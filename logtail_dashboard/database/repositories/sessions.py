"""
Session Repository

Handles all database operations for test sessions including
CRUD, filtering, tagging, and annotation management.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select, func, and_, or_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import (
    TestSession,
    SessionTag,
    SessionAnnotation,
    SessionMetrics,
    TrackerAssignment,
    CUASPlacement,
    CUASProfile,
    SessionStatus,
    Engagement,
)
from .base import BaseRepository


class SessionFilters:
    """Filter options for session queries."""

    def __init__(
        self,
        status: Optional[List[str]] = None,
        site_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        tags: Optional[List[str]] = None,
        search: Optional[str] = None,
        classification: Optional[str] = None,
        operator_name: Optional[str] = None,
        pass_fail: Optional[str] = None,
        drone_profile_id: Optional[str] = None,
        cuas_profile_id: Optional[str] = None,
    ):
        self.status = status
        self.site_id = site_id
        self.start_date = start_date
        self.end_date = end_date
        self.tags = tags
        self.search = search
        self.classification = classification
        self.operator_name = operator_name
        self.pass_fail = pass_fail
        self.drone_profile_id = drone_profile_id
        self.cuas_profile_id = cuas_profile_id


class SessionRepository(BaseRepository[TestSession]):
    """Repository for test session operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(TestSession, db)

    async def get_with_relations(self, session_id: str) -> Optional[TestSession]:
        """
        Get a session with all its related data loaded.

        Args:
            session_id: The session's primary key.

        Returns:
            The session with loaded relationships, or None.
        """
        result = await self.db.execute(
            select(TestSession)
            .options(
                selectinload(TestSession.site),
                selectinload(TestSession.tags),
                selectinload(TestSession.annotations),
                selectinload(TestSession.session_metrics),
                selectinload(TestSession.tracker_assignments),
                selectinload(TestSession.cuas_placements).selectinload(CUASPlacement.cuas_profile),
                selectinload(TestSession.events),
                selectinload(TestSession.engagements)
                    .selectinload(Engagement.targets),
                selectinload(TestSession.engagements)
                    .selectinload(Engagement.metrics),
                selectinload(TestSession.engagements)
                    .selectinload(Engagement.cuas_placement)
                    .selectinload(CUASPlacement.cuas_profile),
                selectinload(TestSession.engagements)
                    .selectinload(Engagement.bursts),
            )
            .where(TestSession.id == session_id)
        )
        return result.scalar_one_or_none()

    async def list_sessions(
        self,
        filters: Optional[SessionFilters] = None,
        skip: int = 0,
        limit: int = 50,
        order_by: str = "created_at",
        descending: bool = True,
    ) -> Tuple[List[TestSession], int]:
        """
        List sessions with filters and pagination.

        Args:
            filters: Optional filter criteria.
            skip: Number of records to skip.
            limit: Maximum number of records to return.
            order_by: Field to order by.
            descending: Whether to sort descending.

        Returns:
            Tuple of (list of sessions, total count).
        """
        # Build base query
        query = select(TestSession).options(
            selectinload(TestSession.site),
            selectinload(TestSession.tags),
            selectinload(TestSession.session_metrics),
            selectinload(TestSession.tracker_assignments),
            selectinload(TestSession.cuas_placements),
        )

        # Count query (before pagination)
        count_query = select(func.count(TestSession.id))

        # Apply filters
        if filters:
            conditions = []

            if filters.status:
                conditions.append(TestSession.status.in_(filters.status))

            if filters.site_id:
                conditions.append(TestSession.site_id == filters.site_id)

            if filters.start_date:
                conditions.append(TestSession.start_time >= filters.start_date)

            if filters.end_date:
                conditions.append(TestSession.start_time <= filters.end_date)

            if filters.classification:
                conditions.append(TestSession.classification == filters.classification)

            if filters.operator_name:
                conditions.append(TestSession.operator_name.ilike(f"%{filters.operator_name}%"))

            if filters.search:
                search_term = f"%{filters.search}%"
                conditions.append(
                    or_(
                        TestSession.name.ilike(search_term),
                        TestSession.operator_name.ilike(search_term),
                        TestSession.weather_notes.ilike(search_term),
                        TestSession.post_test_notes.ilike(search_term),
                    )
                )

            if conditions:
                query = query.where(and_(*conditions))
                count_query = count_query.where(and_(*conditions))

            # Tag filtering requires a subquery
            if filters.tags:
                tag_subquery = (
                    select(SessionTag.session_id)
                    .where(SessionTag.tag.in_(filters.tags))
                    .group_by(SessionTag.session_id)
                    .having(func.count(SessionTag.tag) == len(filters.tags))
                )
                query = query.where(TestSession.id.in_(tag_subquery))
                count_query = count_query.where(TestSession.id.in_(tag_subquery))

            # Pass/fail filtering requires joining metrics
            if filters.pass_fail:
                query = query.join(SessionMetrics).where(
                    SessionMetrics.pass_fail == filters.pass_fail
                )
                count_query = count_query.join(SessionMetrics).where(
                    SessionMetrics.pass_fail == filters.pass_fail
                )

            # Drone profile filtering
            if filters.drone_profile_id:
                drone_subquery = (
                    select(TrackerAssignment.session_id)
                    .where(TrackerAssignment.drone_profile_id == filters.drone_profile_id)
                )
                query = query.where(TestSession.id.in_(drone_subquery))
                count_query = count_query.where(TestSession.id.in_(drone_subquery))

            # CUAS profile filtering
            if filters.cuas_profile_id:
                cuas_subquery = (
                    select(CUASPlacement.session_id)
                    .where(CUASPlacement.cuas_profile_id == filters.cuas_profile_id)
                )
                query = query.where(TestSession.id.in_(cuas_subquery))
                count_query = count_query.where(TestSession.id.in_(cuas_subquery))

        # Get total count
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Apply ordering
        if hasattr(TestSession, order_by):
            order_col = getattr(TestSession, order_by)
            query = query.order_by(desc(order_col) if descending else asc(order_col))

        # Apply pagination
        query = query.offset(skip).limit(limit)

        # Execute query
        result = await self.db.execute(query)
        sessions = list(result.scalars().all())

        return sessions, total

    async def update_status(
        self,
        session_id: str,
        status: str,
        audit_user: Optional[str] = None,
    ) -> Optional[TestSession]:
        """
        Update the status of a session.

        Args:
            session_id: The session's primary key.
            status: The new status value.
            audit_user: Optional user ID for audit logging.

        Returns:
            The updated session, or None if not found.
        """
        return await self.update(
            session_id,
            {"status": status},
            audit_user=audit_user,
        )

    # =========================================================================
    # TAG OPERATIONS
    # =========================================================================

    async def add_tag(
        self,
        session_id: str,
        tag: str,
        audit_user: Optional[str] = None,
    ) -> SessionTag:
        """
        Add a tag to a session.

        Args:
            session_id: The session's primary key.
            tag: The tag to add.
            audit_user: Optional user ID for audit logging.

        Returns:
            The created tag.
        """
        # Check if tag already exists
        existing = await self.db.execute(
            select(SessionTag).where(
                and_(
                    SessionTag.session_id == session_id,
                    SessionTag.tag == tag,
                )
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"Tag '{tag}' already exists on session")

        session_tag = SessionTag(session_id=session_id, tag=tag)
        self.db.add(session_tag)
        await self.db.flush()

        if audit_user:
            await self._log_audit(
                user_id=audit_user,
                action="add_tag",
                entity_type="test_sessions",
                entity_id=session_id,
                changes={"tag_added": tag},
            )

        return session_tag

    async def remove_tag(
        self,
        session_id: str,
        tag: str,
        audit_user: Optional[str] = None,
    ) -> bool:
        """
        Remove a tag from a session.

        Args:
            session_id: The session's primary key.
            tag: The tag to remove.
            audit_user: Optional user ID for audit logging.

        Returns:
            True if removed, False if tag didn't exist.
        """
        result = await self.db.execute(
            select(SessionTag).where(
                and_(
                    SessionTag.session_id == session_id,
                    SessionTag.tag == tag,
                )
            )
        )
        session_tag = result.scalar_one_or_none()

        if not session_tag:
            return False

        await self.db.delete(session_tag)
        await self.db.flush()

        if audit_user:
            await self._log_audit(
                user_id=audit_user,
                action="remove_tag",
                entity_type="test_sessions",
                entity_id=session_id,
                changes={"tag_removed": tag},
            )

        return True

    async def get_tags(self, session_id: str) -> List[str]:
        """
        Get all tags for a session.

        Args:
            session_id: The session's primary key.

        Returns:
            List of tag strings.
        """
        result = await self.db.execute(
            select(SessionTag.tag).where(SessionTag.session_id == session_id)
        )
        return [row[0] for row in result.fetchall()]

    async def get_all_tags(self) -> List[Dict[str, Any]]:
        """
        Get all unique tags with usage counts.

        Returns:
            List of dicts with tag name and count.
        """
        result = await self.db.execute(
            select(SessionTag.tag, func.count(SessionTag.id))
            .group_by(SessionTag.tag)
            .order_by(func.count(SessionTag.id).desc())
        )
        return [{"tag": row[0], "count": row[1]} for row in result.fetchall()]

    # =========================================================================
    # ANNOTATION OPERATIONS
    # =========================================================================

    async def add_annotation(
        self,
        session_id: str,
        content: str,
        annotation_type: str = "note",
        timestamp_ref: Optional[datetime] = None,
        author: Optional[str] = None,
        audit_user: Optional[str] = None,
    ) -> SessionAnnotation:
        """
        Add an annotation to a session.

        Args:
            session_id: The session's primary key.
            content: The annotation content.
            annotation_type: Type of annotation (note, observation, issue, recommendation).
            timestamp_ref: Optional reference to a point in the session timeline.
            author: Optional author name.
            audit_user: Optional user ID for audit logging.

        Returns:
            The created annotation.
        """
        annotation = SessionAnnotation(
            session_id=session_id,
            content=content,
            annotation_type=annotation_type,
            timestamp_ref=timestamp_ref,
            author=author,
        )
        self.db.add(annotation)
        await self.db.flush()

        if audit_user:
            await self._log_audit(
                user_id=audit_user,
                action="add_annotation",
                entity_type="test_sessions",
                entity_id=session_id,
                changes={"annotation_added": annotation.id},
            )

        return annotation

    async def get_annotations(
        self,
        session_id: str,
        annotation_type: Optional[str] = None,
    ) -> List[SessionAnnotation]:
        """
        Get annotations for a session.

        Args:
            session_id: The session's primary key.
            annotation_type: Optional filter by type.

        Returns:
            List of annotations.
        """
        query = select(SessionAnnotation).where(
            SessionAnnotation.session_id == session_id
        )

        if annotation_type:
            query = query.where(SessionAnnotation.annotation_type == annotation_type)

        query = query.order_by(SessionAnnotation.created_at.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_annotation(
        self,
        annotation_id: str,
        content: str,
        audit_user: Optional[str] = None,
    ) -> Optional[SessionAnnotation]:
        """
        Update an annotation's content.

        Args:
            annotation_id: The annotation's primary key.
            content: The new content.
            audit_user: Optional user ID for audit logging.

        Returns:
            The updated annotation, or None if not found.
        """
        result = await self.db.execute(
            select(SessionAnnotation).where(SessionAnnotation.id == annotation_id)
        )
        annotation = result.scalar_one_or_none()

        if not annotation:
            return None

        old_content = annotation.content
        annotation.content = content
        annotation.updated_at = datetime.utcnow()
        await self.db.flush()

        if audit_user:
            await self._log_audit(
                user_id=audit_user,
                action="update_annotation",
                entity_type="session_annotations",
                entity_id=annotation_id,
                changes={"content": {"old": old_content, "new": content}},
            )

        return annotation

    async def delete_annotation(
        self,
        annotation_id: str,
        audit_user: Optional[str] = None,
    ) -> bool:
        """
        Delete an annotation.

        Args:
            annotation_id: The annotation's primary key.
            audit_user: Optional user ID for audit logging.

        Returns:
            True if deleted, False if not found.
        """
        result = await self.db.execute(
            select(SessionAnnotation).where(SessionAnnotation.id == annotation_id)
        )
        annotation = result.scalar_one_or_none()

        if not annotation:
            return False

        session_id = annotation.session_id
        await self.db.delete(annotation)
        await self.db.flush()

        if audit_user:
            await self._log_audit(
                user_id=audit_user,
                action="delete_annotation",
                entity_type="test_sessions",
                entity_id=session_id,
                changes={"annotation_deleted": annotation_id},
            )

        return True

    # =========================================================================
    # METRICS OPERATIONS
    # =========================================================================

    async def set_metrics(
        self,
        session_id: str,
        metrics: Dict[str, Any],
        audit_user: Optional[str] = None,
    ) -> SessionMetrics:
        """
        Set or update metrics for a session.

        Args:
            session_id: The session's primary key.
            metrics: Dictionary of metric values.
            audit_user: Optional user ID for audit logging.

        Returns:
            The created or updated metrics.
        """
        # Check for existing metrics
        result = await self.db.execute(
            select(SessionMetrics).where(SessionMetrics.session_id == session_id)
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing metrics
            for key, value in metrics.items():
                if hasattr(existing, key):
                    setattr(existing, key, value)
            existing.analyzed_at = datetime.utcnow()
            await self.db.flush()
            session_metrics = existing
        else:
            # Create new metrics
            session_metrics = SessionMetrics(session_id=session_id, **metrics)
            self.db.add(session_metrics)
            await self.db.flush()

        if audit_user:
            await self._log_audit(
                user_id=audit_user,
                action="set_metrics",
                entity_type="test_sessions",
                entity_id=session_id,
                changes={"metrics_set": list(metrics.keys())},
            )

        return session_metrics

    async def get_metrics(self, session_id: str) -> Optional[SessionMetrics]:
        """
        Get metrics for a session.

        Args:
            session_id: The session's primary key.

        Returns:
            The session metrics, or None if not set.
        """
        result = await self.db.execute(
            select(SessionMetrics).where(SessionMetrics.session_id == session_id)
        )
        return result.scalar_one_or_none()

    # =========================================================================
    # STATISTICS
    # =========================================================================

    async def get_status_counts(self) -> Dict[str, int]:
        """
        Get count of sessions by status.

        Returns:
            Dictionary mapping status to count.
        """
        result = await self.db.execute(
            select(TestSession.status, func.count(TestSession.id))
            .group_by(TestSession.status)
        )
        return {row[0]: row[1] for row in result.fetchall()}

    async def get_sessions_by_site(self, site_id: str) -> List[TestSession]:
        """
        Get all sessions for a specific site.

        Args:
            site_id: The site's primary key.

        Returns:
            List of sessions at this site.
        """
        result = await self.db.execute(
            select(TestSession)
            .where(TestSession.site_id == site_id)
            .order_by(TestSession.start_time.desc())
        )
        return list(result.scalars().all())

    async def get_recent_sessions(self, limit: int = 10) -> List[TestSession]:
        """
        Get the most recent sessions.

        Args:
            limit: Maximum number of sessions to return.

        Returns:
            List of recent sessions.
        """
        result = await self.db.execute(
            select(TestSession)
            .options(
                selectinload(TestSession.site),
                selectinload(TestSession.tags),
            )
            .order_by(TestSession.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
