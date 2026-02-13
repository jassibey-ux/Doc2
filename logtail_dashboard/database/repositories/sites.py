"""
Site Repository

Handles database operations for test sites/locations.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import Site, TestSession
from .base import BaseRepository


class SiteRepository(BaseRepository[Site]):
    """Repository for test site operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(Site, db)

    async def get_with_sessions(self, site_id: str) -> Optional[Site]:
        """
        Get a site with its test sessions loaded.

        Args:
            site_id: The site's primary key.

        Returns:
            The site with sessions, or None.
        """
        result = await self.db.execute(
            select(Site)
            .options(selectinload(Site.sessions))
            .where(Site.id == site_id)
        )
        return result.scalar_one_or_none()

    async def list_sites(
        self,
        search: Optional[str] = None,
        environment_type: Optional[str] = None,
        is_active: Optional[bool] = True,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[Site], int]:
        """
        List sites with filters and pagination.

        Args:
            search: Optional search term for name/description.
            environment_type: Optional filter by environment type.
            is_active: Optional filter by active status.
            skip: Number of records to skip.
            limit: Maximum number of records to return.

        Returns:
            Tuple of (list of sites, total count).
        """
        query = select(Site)
        count_query = select(func.count(Site.id))

        conditions = []

        if search:
            search_term = f"%{search}%"
            conditions.append(
                or_(
                    Site.name.ilike(search_term),
                    Site.description.ilike(search_term),
                )
            )

        if environment_type:
            conditions.append(Site.environment_type == environment_type)

        if is_active is not None:
            conditions.append(Site.is_active == is_active)

        if conditions:
            query = query.where(and_(*conditions))
            count_query = count_query.where(and_(*conditions))

        # Get total count
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Apply ordering and pagination
        query = query.order_by(Site.name.asc()).offset(skip).limit(limit)

        result = await self.db.execute(query)
        sites = list(result.scalars().all())

        return sites, total

    async def get_site_statistics(self, site_id: str) -> Dict[str, Any]:
        """
        Get statistics for a specific site.

        Args:
            site_id: The site's primary key.

        Returns:
            Dictionary with site statistics.
        """
        # Count sessions by status
        status_counts = await self.db.execute(
            select(TestSession.status, func.count(TestSession.id))
            .where(TestSession.site_id == site_id)
            .group_by(TestSession.status)
        )

        status_dict = {row[0]: row[1] for row in status_counts.fetchall()}
        total_sessions = sum(status_dict.values())

        # Get date range
        date_range = await self.db.execute(
            select(
                func.min(TestSession.start_time),
                func.max(TestSession.start_time),
            )
            .where(TestSession.site_id == site_id)
        )
        min_date, max_date = date_range.fetchone()

        # Calculate success rate (requires metrics join)
        # For now, return basic stats
        return {
            "site_id": site_id,
            "total_sessions": total_sessions,
            "sessions_by_status": status_dict,
            "first_test_date": min_date,
            "last_test_date": max_date,
        }

    async def get_sessions_for_site(
        self,
        site_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[TestSession], int]:
        """
        Get all sessions for a site with pagination.

        Args:
            site_id: The site's primary key.
            skip: Number of records to skip.
            limit: Maximum number of records to return.

        Returns:
            Tuple of (list of sessions, total count).
        """
        # Get count
        count_result = await self.db.execute(
            select(func.count(TestSession.id))
            .where(TestSession.site_id == site_id)
        )
        total = count_result.scalar() or 0

        # Get sessions
        result = await self.db.execute(
            select(TestSession)
            .where(TestSession.site_id == site_id)
            .order_by(TestSession.start_time.desc())
            .offset(skip)
            .limit(limit)
        )
        sessions = list(result.scalars().all())

        return sessions, total

    async def find_nearby_sites(
        self,
        lat: float,
        lon: float,
        radius_km: float = 50,
    ) -> List[Site]:
        """
        Find sites within a radius of a point.

        Note: This is a simplified calculation using latitude/longitude
        degrees. For accurate distance calculations, consider using
        PostGIS in Phase 2+.

        Args:
            lat: Latitude of search center.
            lon: Longitude of search center.
            radius_km: Search radius in kilometers.

        Returns:
            List of sites within radius.
        """
        # Approximate conversion: 1 degree ≈ 111 km at equator
        # This is a rough approximation - use PostGIS for production
        degree_radius = radius_km / 111.0

        result = await self.db.execute(
            select(Site).where(
                and_(
                    Site.center_lat.between(lat - degree_radius, lat + degree_radius),
                    Site.center_lon.between(lon - degree_radius, lon + degree_radius),
                    Site.is_active == True,
                )
            )
        )
        return list(result.scalars().all())

    async def get_environment_types(self) -> List[Dict[str, Any]]:
        """
        Get all unique environment types with counts.

        Returns:
            List of dicts with environment type and count.
        """
        result = await self.db.execute(
            select(Site.environment_type, func.count(Site.id))
            .where(Site.is_active == True)
            .group_by(Site.environment_type)
            .order_by(func.count(Site.id).desc())
        )
        return [
            {"environment_type": row[0] or "unspecified", "count": row[1]}
            for row in result.fetchall()
        ]

    async def update_zones(
        self,
        site_id: str,
        zones: List[Dict[str, Any]],
        audit_user: Optional[str] = None,
    ) -> Optional[Site]:
        """
        Update the zones for a site.

        Args:
            site_id: The site's primary key.
            zones: List of zone definitions.
            audit_user: Optional user ID for audit logging.

        Returns:
            The updated site, or None if not found.
        """
        return await self.update(
            site_id,
            {"zones": zones},
            audit_user=audit_user,
        )

    async def update_markers(
        self,
        site_id: str,
        markers: List[Dict[str, Any]],
        audit_user: Optional[str] = None,
    ) -> Optional[Site]:
        """
        Update the markers for a site.

        Args:
            site_id: The site's primary key.
            markers: List of marker definitions.
            audit_user: Optional user ID for audit logging.

        Returns:
            The updated site, or None if not found.
        """
        return await self.update(
            site_id,
            {"markers": markers},
            audit_user=audit_user,
        )
