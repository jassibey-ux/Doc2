"""
CUAS Profile Repository

Handles database operations for Counter-UAS system profiles.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import CUASProfile, CUASPlacement, TestSession, SessionMetrics, TestEvent
from .base import BaseRepository


class CUASProfileRepository(BaseRepository[CUASProfile]):
    """Repository for CUAS profile operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(CUASProfile, db)

    async def get_with_placements(self, profile_id: str) -> Optional[CUASProfile]:
        """
        Get a CUAS profile with its placements loaded.

        Args:
            profile_id: The profile's primary key.

        Returns:
            The profile with placements, or None.
        """
        result = await self.db.execute(
            select(CUASProfile)
            .options(selectinload(CUASProfile.placements))
            .where(CUASProfile.id == profile_id)
        )
        return result.scalar_one_or_none()

    async def list_profiles(
        self,
        search: Optional[str] = None,
        vendor: Optional[str] = None,
        cuas_type: Optional[str] = None,
        is_active: Optional[bool] = True,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[CUASProfile], int]:
        """
        List CUAS profiles with filters and pagination.

        Args:
            search: Optional search term for name/vendor/model.
            vendor: Optional filter by vendor.
            cuas_type: Optional filter by CUAS type.
            is_active: Optional filter by active status.
            skip: Number of records to skip.
            limit: Maximum number of records to return.

        Returns:
            Tuple of (list of profiles, total count).
        """
        query = select(CUASProfile)
        count_query = select(func.count(CUASProfile.id))

        conditions = []

        if search:
            search_term = f"%{search}%"
            conditions.append(
                or_(
                    CUASProfile.name.ilike(search_term),
                    CUASProfile.vendor.ilike(search_term),
                    CUASProfile.model.ilike(search_term),
                )
            )

        if vendor:
            conditions.append(CUASProfile.vendor == vendor)

        if cuas_type:
            conditions.append(CUASProfile.type == cuas_type)

        if is_active is not None:
            conditions.append(CUASProfile.is_active == is_active)

        if conditions:
            query = query.where(and_(*conditions))
            count_query = count_query.where(and_(*conditions))

        # Get total count
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Apply ordering and pagination
        query = query.order_by(CUASProfile.name.asc()).offset(skip).limit(limit)

        result = await self.db.execute(query)
        profiles = list(result.scalars().all())

        return profiles, total

    async def get_sessions_for_cuas(
        self,
        profile_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[TestSession], int]:
        """
        Get all test sessions that used this CUAS profile.

        Args:
            profile_id: The profile's primary key.
            skip: Number of records to skip.
            limit: Maximum number of records to return.

        Returns:
            Tuple of (list of sessions, total count).
        """
        # Subquery to find session IDs with this CUAS
        session_ids_query = (
            select(CUASPlacement.session_id)
            .where(CUASPlacement.cuas_profile_id == profile_id)
            .distinct()
        )

        # Get count
        count_result = await self.db.execute(
            select(func.count()).select_from(session_ids_query.subquery())
        )
        total = count_result.scalar() or 0

        # Get sessions
        result = await self.db.execute(
            select(TestSession)
            .where(TestSession.id.in_(session_ids_query))
            .order_by(TestSession.start_time.desc())
            .offset(skip)
            .limit(limit)
        )
        sessions = list(result.scalars().all())

        return sessions, total

    async def get_cuas_statistics(self, profile_id: str) -> Dict[str, Any]:
        """
        Get performance statistics for a CUAS profile.

        Args:
            profile_id: The profile's primary key.

        Returns:
            Dictionary with CUAS effectiveness statistics.
        """
        # Get all session IDs for this CUAS
        session_ids_query = (
            select(CUASPlacement.session_id)
            .where(CUASPlacement.cuas_profile_id == profile_id)
            .distinct()
        )

        # Count tests
        test_count = await self.db.execute(
            select(func.count()).select_from(session_ids_query.subquery())
        )
        total_tests = test_count.scalar() or 0

        # Get metrics aggregates
        metrics_query = await self.db.execute(
            select(
                func.avg(SessionMetrics.time_to_effect_s),
                func.avg(SessionMetrics.time_to_full_denial_s),
                func.avg(SessionMetrics.effective_range_m),
                func.avg(SessionMetrics.overall_score),
                func.count(SessionMetrics.id).filter(SessionMetrics.pass_fail == "pass"),
                func.count(SessionMetrics.id).filter(SessionMetrics.pass_fail == "fail"),
            )
            .where(SessionMetrics.session_id.in_(session_ids_query))
        )
        metrics_row = metrics_query.fetchone()

        avg_time_to_effect = metrics_row[0]
        avg_time_to_denial = metrics_row[1]
        avg_effective_range = metrics_row[2]
        avg_score = metrics_row[3]
        pass_count = metrics_row[4] or 0
        fail_count = metrics_row[5] or 0

        # Get date range
        date_range = await self.db.execute(
            select(
                func.min(TestSession.start_time),
                func.max(TestSession.start_time),
            )
            .where(TestSession.id.in_(session_ids_query))
        )
        min_date, max_date = date_range.fetchone()

        # Calculate success rate
        total_results = pass_count + fail_count
        success_rate = (pass_count / total_results * 100) if total_results > 0 else None

        return {
            "profile_id": profile_id,
            "total_tests": total_tests,
            "pass_count": pass_count,
            "fail_count": fail_count,
            "success_rate": success_rate,
            "avg_time_to_effect_s": avg_time_to_effect,
            "avg_time_to_denial_s": avg_time_to_denial,
            "avg_effective_range_m": avg_effective_range,
            "avg_score": avg_score,
            "first_test_date": min_date,
            "last_test_date": max_date,
        }

    async def get_effectiveness_by_drone_class(
        self,
        profile_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Get effectiveness metrics broken down by drone weight class.

        Args:
            profile_id: The profile's primary key.

        Returns:
            List of effectiveness metrics per drone class.
        """
        # This would require a more complex join through tracker_assignments
        # to drone_profiles to get weight_class, grouped by that class.
        # For now, return a placeholder - this would be implemented with
        # more complex queries in production.
        return []

    async def get_vendors(self) -> List[Dict[str, Any]]:
        """
        Get all unique CUAS vendors with counts.

        Returns:
            List of dicts with vendor and count.
        """
        result = await self.db.execute(
            select(CUASProfile.vendor, func.count(CUASProfile.id))
            .where(CUASProfile.is_active == True)
            .group_by(CUASProfile.vendor)
            .order_by(func.count(CUASProfile.id).desc())
        )
        return [{"vendor": row[0], "count": row[1]} for row in result.fetchall()]

    async def get_types(self) -> List[Dict[str, Any]]:
        """
        Get all CUAS types with counts.

        Returns:
            List of dicts with type and count.
        """
        result = await self.db.execute(
            select(CUASProfile.type, func.count(CUASProfile.id))
            .where(
                and_(
                    CUASProfile.is_active == True,
                    CUASProfile.type.isnot(None),
                )
            )
            .group_by(CUASProfile.type)
            .order_by(func.count(CUASProfile.id).desc())
        )
        return [{"type": row[0], "count": row[1]} for row in result.fetchall()]

    async def find_by_vendor_model(
        self,
        vendor: str,
        model: str,
    ) -> Optional[CUASProfile]:
        """
        Find a CUAS profile by vendor and model.

        Args:
            vendor: The vendor name.
            model: The model name.

        Returns:
            The matching profile, or None.
        """
        result = await self.db.execute(
            select(CUASProfile).where(
                and_(
                    CUASProfile.vendor.ilike(vendor),
                    CUASProfile.model.ilike(model),
                    CUASProfile.is_active == True,
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_placements_for_session(
        self,
        session_id: str,
    ) -> List[CUASPlacement]:
        """
        Get all CUAS placements for a session.

        Args:
            session_id: The session's primary key.

        Returns:
            List of CUAS placements.
        """
        result = await self.db.execute(
            select(CUASPlacement)
            .options(selectinload(CUASPlacement.cuas_profile))
            .where(CUASPlacement.session_id == session_id)
        )
        return list(result.scalars().all())

    async def compare_profiles(
        self,
        profile_ids: List[str],
    ) -> List[Dict[str, Any]]:
        """
        Get comparison data for multiple CUAS profiles.

        Args:
            profile_ids: List of profile IDs to compare.

        Returns:
            List of profile data with statistics.
        """
        comparisons = []
        for profile_id in profile_ids:
            profile = await self.get_by_id(profile_id)
            if profile:
                stats = await self.get_cuas_statistics(profile_id)
                comparisons.append({
                    "profile": {
                        "id": profile.id,
                        "name": profile.name,
                        "vendor": profile.vendor,
                        "model": profile.model,
                        "type": profile.type,
                        "effective_range_m": profile.effective_range_m,
                        "beam_width_deg": profile.beam_width_deg,
                        "antenna_pattern": profile.antenna_pattern,
                        "capabilities": profile.capabilities,
                    },
                    "statistics": stats,
                })
        return comparisons

    async def get_effectiveness_ranking(
        self,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Get CUAS systems ranked by effectiveness (success rate).

        Args:
            limit: Maximum number of results.

        Returns:
            List of CUAS profiles with effectiveness metrics.
        """
        # Get all active profiles
        profiles_result = await self.db.execute(
            select(CUASProfile)
            .where(CUASProfile.is_active == True)
        )
        profiles = list(profiles_result.scalars().all())

        # Calculate stats for each
        rankings = []
        for profile in profiles:
            stats = await self.get_cuas_statistics(profile.id)
            if stats["total_tests"] > 0:  # Only include those with test data
                rankings.append({
                    "profile_id": profile.id,
                    "name": profile.name,
                    "vendor": profile.vendor,
                    "type": profile.type,
                    "success_rate": stats["success_rate"],
                    "total_tests": stats["total_tests"],
                    "avg_time_to_effect_s": stats["avg_time_to_effect_s"],
                })

        # Sort by success rate (descending), then by total tests
        rankings.sort(
            key=lambda x: (x["success_rate"] or 0, x["total_tests"]),
            reverse=True,
        )

        return rankings[:limit]
