"""
Engagement Repository

Handles all database operations for engagements including
CRUD, status transitions, target management, and metrics.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import (
    Engagement,
    EngagementTarget,
    EngagementMetrics,
    EngagementJamBurst,
    EngagementStatus,
    SessionActor,
    CUASPlacement,
    CUASProfile,
)
from .base import BaseRepository


class EngagementRepository(BaseRepository[Engagement]):
    """Repository for engagement operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(Engagement, db)

    async def get_with_relations(self, engagement_id: str) -> Optional[Engagement]:
        """Get an engagement with all related data loaded."""
        result = await self.db.execute(
            select(Engagement)
            .options(
                selectinload(Engagement.targets),
                selectinload(Engagement.metrics),
                selectinload(Engagement.events),
                selectinload(Engagement.cuas_placement).selectinload(CUASPlacement.cuas_profile),
                selectinload(Engagement.bursts),
            )
            .where(Engagement.id == engagement_id)
        )
        return result.scalar_one_or_none()

    async def get_by_session(self, session_id: str) -> List[Engagement]:
        """Get all engagements for a session ordered by creation time."""
        result = await self.db.execute(
            select(Engagement)
            .options(
                selectinload(Engagement.targets),
                selectinload(Engagement.metrics),
                selectinload(Engagement.cuas_placement).selectinload(CUASPlacement.cuas_profile),
                selectinload(Engagement.bursts),
            )
            .where(Engagement.session_id == session_id)
            .order_by(Engagement.created_at)
        )
        return list(result.scalars().all())

    async def get_active_for_session(self, session_id: str) -> List[Engagement]:
        """Get only active engagements for a session."""
        result = await self.db.execute(
            select(Engagement)
            .options(
                selectinload(Engagement.targets),
                selectinload(Engagement.cuas_placement),
            )
            .where(and_(
                Engagement.session_id == session_id,
                Engagement.status == EngagementStatus.ACTIVE.value,
            ))
            .order_by(Engagement.engage_timestamp)
        )
        return list(result.scalars().all())

    async def set_metrics(
        self,
        engagement_id: str,
        metrics_data: Dict[str, Any],
        audit_user: Optional[str] = None,
    ) -> EngagementMetrics:
        """Upsert engagement metrics."""
        result = await self.db.execute(
            select(EngagementMetrics)
            .where(EngagementMetrics.engagement_id == engagement_id)
        )
        existing = result.scalar_one_or_none()

        if existing:
            for key, value in metrics_data.items():
                if hasattr(existing, key):
                    setattr(existing, key, value)
            existing.analyzed_at = datetime.utcnow()
            await self.db.flush()
            return existing
        else:
            metrics = EngagementMetrics(
                engagement_id=engagement_id,
                **metrics_data,
            )
            self.db.add(metrics)
            await self.db.flush()
            return metrics

    async def add_target(
        self,
        engagement_id: str,
        target_data: Dict[str, Any],
    ) -> EngagementTarget:
        """Add a target to an engagement."""
        target = EngagementTarget(
            engagement_id=engagement_id,
            **target_data,
        )
        self.db.add(target)
        await self.db.flush()
        return target

    async def get_targets(self, engagement_id: str) -> List[EngagementTarget]:
        """Get all targets for an engagement."""
        result = await self.db.execute(
            select(EngagementTarget)
            .where(EngagementTarget.engagement_id == engagement_id)
        )
        return list(result.scalars().all())

    # =========================================================================
    # Jam Burst Operations
    # =========================================================================

    async def get_open_burst(self, engagement_id: str) -> Optional[EngagementJamBurst]:
        """Get the currently open burst (jam_off_at IS NULL) for an engagement."""
        result = await self.db.execute(
            select(EngagementJamBurst)
            .where(and_(
                EngagementJamBurst.engagement_id == engagement_id,
                EngagementJamBurst.jam_off_at.is_(None),
            ))
        )
        return result.scalar_one_or_none()

    async def get_max_burst_seq(self, engagement_id: str) -> int:
        """Get the maximum burst sequence number for an engagement."""
        from sqlalchemy import func
        result = await self.db.execute(
            select(func.max(EngagementJamBurst.burst_seq))
            .where(EngagementJamBurst.engagement_id == engagement_id)
        )
        max_seq = result.scalar()
        return max_seq if max_seq is not None else 0

    async def create_burst(self, burst_data: Dict[str, Any]) -> EngagementJamBurst:
        """Create a new jam burst."""
        burst = EngagementJamBurst(**burst_data)
        self.db.add(burst)
        await self.db.flush()
        return burst

    async def close_burst(
        self,
        burst_id: str,
        jam_off_at: datetime,
        duration_s: float,
    ) -> Optional[EngagementJamBurst]:
        """Close an open burst by setting jam_off_at and duration."""
        result = await self.db.execute(
            select(EngagementJamBurst)
            .where(EngagementJamBurst.id == burst_id)
        )
        burst = result.scalar_one_or_none()
        if burst:
            burst.jam_off_at = jam_off_at
            burst.duration_s = duration_s
            await self.db.flush()
        return burst

    async def get_bursts(self, engagement_id: str) -> List[EngagementJamBurst]:
        """Get all bursts for an engagement ordered by sequence."""
        result = await self.db.execute(
            select(EngagementJamBurst)
            .where(EngagementJamBurst.engagement_id == engagement_id)
            .order_by(EngagementJamBurst.burst_seq)
        )
        return list(result.scalars().all())


class SessionActorRepository(BaseRepository[SessionActor]):
    """Repository for session actor operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(SessionActor, db)

    async def get_by_session(self, session_id: str) -> List[SessionActor]:
        """Get all actors for a session."""
        result = await self.db.execute(
            select(SessionActor)
            .where(SessionActor.session_id == session_id)
            .order_by(SessionActor.created_at)
        )
        return list(result.scalars().all())

    async def get_active_by_session(self, session_id: str) -> List[SessionActor]:
        """Get only active actors for a session."""
        result = await self.db.execute(
            select(SessionActor)
            .where(and_(
                SessionActor.session_id == session_id,
                SessionActor.is_active.is_(True),
            ))
            .order_by(SessionActor.created_at)
        )
        return list(result.scalars().all())
