"""
Audit Repository

Handles database operations for the audit log.
Provides compliance-grade audit trail for all data modifications.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AuditLog
from .base import BaseRepository


class AuditRepository(BaseRepository[AuditLog]):
    """Repository for audit log operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(AuditLog, db)

    async def log_action(
        self,
        action: str,
        entity_type: str,
        entity_id: str,
        user_id: Optional[str] = None,
        user_name: Optional[str] = None,
        changes: Optional[Dict[str, Any]] = None,
        classification_accessed: Optional[str] = None,
    ) -> AuditLog:
        """
        Log an action to the audit trail.

        Args:
            action: The action performed (create, update, delete, view, export).
            entity_type: The type of entity affected.
            entity_id: The ID of the entity affected.
            user_id: The ID of the user performing the action.
            user_name: The name of the user performing the action.
            changes: Details of changes made.
            classification_accessed: Classification level of data accessed.

        Returns:
            The created audit log entry.
        """
        entry = AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            user_id=user_id,
            user_name=user_name,
            changes=changes,
            classification_accessed=classification_accessed,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def get_entity_history(
        self,
        entity_type: str,
        entity_id: str,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[AuditLog], int]:
        """
        Get audit history for a specific entity.

        Args:
            entity_type: The type of entity.
            entity_id: The ID of the entity.
            skip: Number of records to skip.
            limit: Maximum number of records to return.

        Returns:
            Tuple of (list of audit entries, total count).
        """
        conditions = and_(
            AuditLog.entity_type == entity_type,
            AuditLog.entity_id == entity_id,
        )

        # Get count
        count_result = await self.db.execute(
            select(func.count(AuditLog.id)).where(conditions)
        )
        total = count_result.scalar() or 0

        # Get entries
        result = await self.db.execute(
            select(AuditLog)
            .where(conditions)
            .order_by(AuditLog.timestamp.desc())
            .offset(skip)
            .limit(limit)
        )
        entries = list(result.scalars().all())

        return entries, total

    async def get_user_activity(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[AuditLog], int]:
        """
        Get audit history for a specific user.

        Args:
            user_id: The ID of the user.
            start_date: Optional start of date range.
            end_date: Optional end of date range.
            skip: Number of records to skip.
            limit: Maximum number of records to return.

        Returns:
            Tuple of (list of audit entries, total count).
        """
        conditions = [AuditLog.user_id == user_id]

        if start_date:
            conditions.append(AuditLog.timestamp >= start_date)

        if end_date:
            conditions.append(AuditLog.timestamp <= end_date)

        where_clause = and_(*conditions)

        # Get count
        count_result = await self.db.execute(
            select(func.count(AuditLog.id)).where(where_clause)
        )
        total = count_result.scalar() or 0

        # Get entries
        result = await self.db.execute(
            select(AuditLog)
            .where(where_clause)
            .order_by(AuditLog.timestamp.desc())
            .offset(skip)
            .limit(limit)
        )
        entries = list(result.scalars().all())

        return entries, total

    async def search_audit_log(
        self,
        action: Optional[str] = None,
        entity_type: Optional[str] = None,
        user_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        classification: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[AuditLog], int]:
        """
        Search the audit log with various filters.

        Args:
            action: Optional filter by action type.
            entity_type: Optional filter by entity type.
            user_id: Optional filter by user.
            start_date: Optional start of date range.
            end_date: Optional end of date range.
            classification: Optional filter by classification accessed.
            skip: Number of records to skip.
            limit: Maximum number of records to return.

        Returns:
            Tuple of (list of audit entries, total count).
        """
        conditions = []

        if action:
            conditions.append(AuditLog.action == action)

        if entity_type:
            conditions.append(AuditLog.entity_type == entity_type)

        if user_id:
            conditions.append(AuditLog.user_id == user_id)

        if start_date:
            conditions.append(AuditLog.timestamp >= start_date)

        if end_date:
            conditions.append(AuditLog.timestamp <= end_date)

        if classification:
            conditions.append(AuditLog.classification_accessed == classification)

        query = select(AuditLog)
        count_query = select(func.count(AuditLog.id))

        if conditions:
            where_clause = and_(*conditions)
            query = query.where(where_clause)
            count_query = count_query.where(where_clause)

        # Get count
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Get entries
        result = await self.db.execute(
            query.order_by(AuditLog.timestamp.desc())
            .offset(skip)
            .limit(limit)
        )
        entries = list(result.scalars().all())

        return entries, total

    async def get_activity_summary(
        self,
        days: int = 30,
    ) -> Dict[str, Any]:
        """
        Get a summary of recent activity.

        Args:
            days: Number of days to look back.

        Returns:
            Dictionary with activity statistics.
        """
        cutoff = datetime.utcnow() - timedelta(days=days)

        # Count by action type
        action_counts = await self.db.execute(
            select(AuditLog.action, func.count(AuditLog.id))
            .where(AuditLog.timestamp >= cutoff)
            .group_by(AuditLog.action)
        )
        actions = {row[0]: row[1] for row in action_counts.fetchall()}

        # Count by entity type
        entity_counts = await self.db.execute(
            select(AuditLog.entity_type, func.count(AuditLog.id))
            .where(AuditLog.timestamp >= cutoff)
            .group_by(AuditLog.entity_type)
        )
        entities = {row[0]: row[1] for row in entity_counts.fetchall()}

        # Count by user
        user_counts = await self.db.execute(
            select(AuditLog.user_id, AuditLog.user_name, func.count(AuditLog.id))
            .where(
                and_(
                    AuditLog.timestamp >= cutoff,
                    AuditLog.user_id.isnot(None),
                )
            )
            .group_by(AuditLog.user_id, AuditLog.user_name)
            .order_by(func.count(AuditLog.id).desc())
            .limit(10)
        )
        top_users = [
            {"user_id": row[0], "user_name": row[1], "action_count": row[2]}
            for row in user_counts.fetchall()
        ]

        # Total count
        total_result = await self.db.execute(
            select(func.count(AuditLog.id))
            .where(AuditLog.timestamp >= cutoff)
        )
        total = total_result.scalar() or 0

        return {
            "period_days": days,
            "total_actions": total,
            "actions_by_type": actions,
            "actions_by_entity": entities,
            "top_users": top_users,
        }

    async def get_classification_access_report(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> List[Dict[str, Any]]:
        """
        Get a report of classified data access.

        Args:
            start_date: Start of reporting period.
            end_date: End of reporting period.

        Returns:
            List of access records with classification info.
        """
        result = await self.db.execute(
            select(
                AuditLog.classification_accessed,
                AuditLog.user_id,
                AuditLog.user_name,
                func.count(AuditLog.id),
            )
            .where(
                and_(
                    AuditLog.timestamp >= start_date,
                    AuditLog.timestamp <= end_date,
                    AuditLog.classification_accessed.isnot(None),
                )
            )
            .group_by(
                AuditLog.classification_accessed,
                AuditLog.user_id,
                AuditLog.user_name,
            )
            .order_by(AuditLog.classification_accessed)
        )

        return [
            {
                "classification": row[0],
                "user_id": row[1],
                "user_name": row[2],
                "access_count": row[3],
            }
            for row in result.fetchall()
        ]

    async def purge_old_entries(
        self,
        retention_days: int = 365,
    ) -> int:
        """
        Purge audit entries older than retention period.

        Note: This should be used with caution and may require
        compliance review before enabling.

        Args:
            retention_days: Number of days to retain.

        Returns:
            Number of entries purged.
        """
        from sqlalchemy import delete

        cutoff = datetime.utcnow() - timedelta(days=retention_days)

        # Count entries to be deleted
        count_result = await self.db.execute(
            select(func.count(AuditLog.id))
            .where(AuditLog.timestamp < cutoff)
        )
        count = count_result.scalar() or 0

        if count > 0:
            await self.db.execute(
                delete(AuditLog).where(AuditLog.timestamp < cutoff)
            )
            await self.db.flush()

        return count
