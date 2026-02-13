"""
Drone Profile Repository

Handles database operations for UAS/drone profiles.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import DroneProfile, TrackerAssignment, TestSession, SessionMetrics
from .base import BaseRepository


class DroneProfileRepository(BaseRepository[DroneProfile]):
    """Repository for drone profile operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(DroneProfile, db)

    async def get_with_assignments(self, profile_id: str) -> Optional[DroneProfile]:
        """
        Get a drone profile with its tracker assignments loaded.

        Args:
            profile_id: The profile's primary key.

        Returns:
            The profile with assignments, or None.
        """
        result = await self.db.execute(
            select(DroneProfile)
            .options(selectinload(DroneProfile.tracker_assignments))
            .where(DroneProfile.id == profile_id)
        )
        return result.scalar_one_or_none()

    async def list_profiles(
        self,
        search: Optional[str] = None,
        make: Optional[str] = None,
        weight_class: Optional[str] = None,
        is_active: Optional[bool] = True,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[DroneProfile], int]:
        """
        List drone profiles with filters and pagination.

        Args:
            search: Optional search term for name/make/model.
            make: Optional filter by manufacturer.
            weight_class: Optional filter by weight class.
            is_active: Optional filter by active status.
            skip: Number of records to skip.
            limit: Maximum number of records to return.

        Returns:
            Tuple of (list of profiles, total count).
        """
        query = select(DroneProfile)
        count_query = select(func.count(DroneProfile.id))

        conditions = []

        if search:
            search_term = f"%{search}%"
            conditions.append(
                or_(
                    DroneProfile.name.ilike(search_term),
                    DroneProfile.make.ilike(search_term),
                    DroneProfile.model.ilike(search_term),
                )
            )

        if make:
            conditions.append(DroneProfile.make == make)

        if weight_class:
            conditions.append(DroneProfile.weight_class == weight_class)

        if is_active is not None:
            conditions.append(DroneProfile.is_active == is_active)

        if conditions:
            query = query.where(and_(*conditions))
            count_query = count_query.where(and_(*conditions))

        # Get total count
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Apply ordering and pagination
        query = query.order_by(DroneProfile.name.asc()).offset(skip).limit(limit)

        result = await self.db.execute(query)
        profiles = list(result.scalars().all())

        return profiles, total

    async def get_sessions_for_drone(
        self,
        profile_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[TestSession], int]:
        """
        Get all test sessions that used this drone profile.

        Args:
            profile_id: The profile's primary key.
            skip: Number of records to skip.
            limit: Maximum number of records to return.

        Returns:
            Tuple of (list of sessions, total count).
        """
        # Subquery to find session IDs with this drone
        session_ids_query = (
            select(TrackerAssignment.session_id)
            .where(TrackerAssignment.drone_profile_id == profile_id)
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

    async def get_drone_statistics(self, profile_id: str) -> Dict[str, Any]:
        """
        Get performance statistics for a drone profile.

        Args:
            profile_id: The profile's primary key.

        Returns:
            Dictionary with drone statistics.
        """
        # Get all session IDs for this drone
        session_ids_query = (
            select(TrackerAssignment.session_id)
            .where(TrackerAssignment.drone_profile_id == profile_id)
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
                func.avg(SessionMetrics.max_lateral_drift_m),
                func.count(SessionMetrics.id).filter(SessionMetrics.pass_fail == "pass"),
                func.count(SessionMetrics.id).filter(SessionMetrics.pass_fail == "fail"),
            )
            .where(SessionMetrics.session_id.in_(session_ids_query))
        )
        metrics_row = metrics_query.fetchone()

        avg_time_to_effect = metrics_row[0]
        avg_time_to_denial = metrics_row[1]
        avg_lateral_drift = metrics_row[2]
        pass_count = metrics_row[3] or 0
        fail_count = metrics_row[4] or 0

        # Get date range
        date_range = await self.db.execute(
            select(
                func.min(TestSession.start_time),
                func.max(TestSession.start_time),
            )
            .where(TestSession.id.in_(session_ids_query))
        )
        min_date, max_date = date_range.fetchone()

        return {
            "profile_id": profile_id,
            "total_tests": total_tests,
            "pass_count": pass_count,
            "fail_count": fail_count,
            "success_rate": (pass_count / (pass_count + fail_count) * 100) if (pass_count + fail_count) > 0 else None,
            "avg_time_to_effect_s": avg_time_to_effect,
            "avg_time_to_denial_s": avg_time_to_denial,
            "avg_lateral_drift_m": avg_lateral_drift,
            "first_test_date": min_date,
            "last_test_date": max_date,
        }

    async def get_makes(self) -> List[Dict[str, Any]]:
        """
        Get all unique drone manufacturers with counts.

        Returns:
            List of dicts with make and count.
        """
        result = await self.db.execute(
            select(DroneProfile.make, func.count(DroneProfile.id))
            .where(DroneProfile.is_active == True)
            .group_by(DroneProfile.make)
            .order_by(func.count(DroneProfile.id).desc())
        )
        return [{"make": row[0], "count": row[1]} for row in result.fetchall()]

    async def get_weight_classes(self) -> List[Dict[str, Any]]:
        """
        Get all weight classes with counts.

        Returns:
            List of dicts with weight class and count.
        """
        result = await self.db.execute(
            select(DroneProfile.weight_class, func.count(DroneProfile.id))
            .where(
                and_(
                    DroneProfile.is_active == True,
                    DroneProfile.weight_class.isnot(None),
                )
            )
            .group_by(DroneProfile.weight_class)
            .order_by(func.count(DroneProfile.id).desc())
        )
        return [{"weight_class": row[0], "count": row[1]} for row in result.fetchall()]

    async def find_by_make_model(
        self,
        make: str,
        model: str,
    ) -> Optional[DroneProfile]:
        """
        Find a drone profile by make and model.

        Args:
            make: The manufacturer name.
            model: The model name.

        Returns:
            The matching profile, or None.
        """
        result = await self.db.execute(
            select(DroneProfile).where(
                and_(
                    DroneProfile.make.ilike(make),
                    DroneProfile.model.ilike(model),
                    DroneProfile.is_active == True,
                )
            )
        )
        return result.scalar_one_or_none()

    async def compare_profiles(
        self,
        profile_ids: List[str],
    ) -> List[Dict[str, Any]]:
        """
        Get comparison data for multiple drone profiles.

        Args:
            profile_ids: List of profile IDs to compare.

        Returns:
            List of profile data with statistics.
        """
        comparisons = []
        for profile_id in profile_ids:
            profile = await self.get_by_id(profile_id)
            if profile:
                stats = await self.get_drone_statistics(profile_id)
                comparisons.append({
                    "profile": {
                        "id": profile.id,
                        "name": profile.name,
                        "make": profile.make,
                        "model": profile.model,
                        "weight_class": profile.weight_class,
                        "max_speed_mps": profile.max_speed_mps,
                        "max_altitude_m": profile.max_altitude_m,
                        "endurance_minutes": profile.endurance_minutes,
                        "expected_failsafe": profile.expected_failsafe,
                    },
                    "statistics": stats,
                })
        return comparisons
