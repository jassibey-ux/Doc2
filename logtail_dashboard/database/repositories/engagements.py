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
    EngagementStatus,
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
                selectinload(Engagement.cuas_placement),
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
                selectinload(Engagement.cuas_placement),
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
