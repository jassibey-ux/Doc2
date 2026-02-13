"""
Base Repository Pattern

Provides common CRUD operations for all entity types.
Designed for async operations with SQLAlchemy.
"""

from datetime import datetime
from typing import Any, Dict, Generic, List, Optional, Type, TypeVar
from uuid import uuid4

from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Base, AuditLog


# Generic type variable for models
ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    """
    Base repository with common CRUD operations.

    All specific repositories inherit from this class and add
    entity-specific query methods.
    """

    def __init__(self, model: Type[ModelType], db: AsyncSession):
        """
        Initialize the repository.

        Args:
            model: The SQLAlchemy model class.
            db: The async database session.
        """
        self.model = model
        self.db = db

    async def create(self, data: Dict[str, Any], audit_user: Optional[str] = None) -> ModelType:
        """
        Create a new entity.

        Args:
            data: Dictionary of field values.
            audit_user: Optional user ID for audit logging.

        Returns:
            The created entity.
        """
        # Generate ID if not provided
        if "id" not in data and hasattr(self.model, "id"):
            data["id"] = str(uuid4())

        instance = self.model(**data)
        self.db.add(instance)
        await self.db.flush()

        # Log creation
        if audit_user:
            await self._log_audit(
                user_id=audit_user,
                action="create",
                entity_type=self.model.__tablename__,
                entity_id=str(getattr(instance, "id", "")),
                changes={"created": data},
            )

        return instance

    async def get_by_id(self, entity_id: str) -> Optional[ModelType]:
        """
        Get an entity by its ID.

        Args:
            entity_id: The entity's primary key.

        Returns:
            The entity if found, None otherwise.
        """
        result = await self.db.execute(
            select(self.model).where(self.model.id == entity_id)
        )
        return result.scalar_one_or_none()

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        order_by: Optional[str] = None,
        descending: bool = True,
    ) -> List[ModelType]:
        """
        Get all entities with pagination.

        Args:
            skip: Number of records to skip.
            limit: Maximum number of records to return.
            order_by: Field name to order by.
            descending: Whether to sort descending.

        Returns:
            List of entities.
        """
        query = select(self.model)

        # Apply ordering
        if order_by and hasattr(self.model, order_by):
            order_col = getattr(self.model, order_by)
            query = query.order_by(order_col.desc() if descending else order_col.asc())
        elif hasattr(self.model, "created_at"):
            query = query.order_by(
                self.model.created_at.desc() if descending else self.model.created_at.asc()
            )

        # Apply pagination
        query = query.offset(skip).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update(
        self,
        entity_id: str,
        data: Dict[str, Any],
        audit_user: Optional[str] = None,
    ) -> Optional[ModelType]:
        """
        Update an entity.

        Args:
            entity_id: The entity's primary key.
            data: Dictionary of fields to update.
            audit_user: Optional user ID for audit logging.

        Returns:
            The updated entity if found, None otherwise.
        """
        # Get current state for audit
        current = await self.get_by_id(entity_id)
        if not current:
            return None

        # Track changes for audit
        changes = {}
        for key, new_value in data.items():
            if hasattr(current, key):
                old_value = getattr(current, key)
                if old_value != new_value:
                    changes[key] = {"old": old_value, "new": new_value}

        # Update timestamp if the model has one
        if hasattr(self.model, "updated_at"):
            data["updated_at"] = datetime.utcnow()

        # Perform update
        await self.db.execute(
            update(self.model).where(self.model.id == entity_id).values(**data)
        )
        await self.db.flush()

        # Log changes
        if audit_user and changes:
            await self._log_audit(
                user_id=audit_user,
                action="update",
                entity_type=self.model.__tablename__,
                entity_id=entity_id,
                changes=changes,
            )

        # Refresh and return
        return await self.get_by_id(entity_id)

    async def delete(self, entity_id: str, audit_user: Optional[str] = None) -> bool:
        """
        Delete an entity.

        Args:
            entity_id: The entity's primary key.
            audit_user: Optional user ID for audit logging.

        Returns:
            True if deleted, False if not found.
        """
        current = await self.get_by_id(entity_id)
        if not current:
            return False

        await self.db.execute(
            delete(self.model).where(self.model.id == entity_id)
        )
        await self.db.flush()

        # Log deletion
        if audit_user:
            await self._log_audit(
                user_id=audit_user,
                action="delete",
                entity_type=self.model.__tablename__,
                entity_id=entity_id,
                changes={"deleted": True},
            )

        return True

    async def soft_delete(
        self,
        entity_id: str,
        audit_user: Optional[str] = None,
    ) -> Optional[ModelType]:
        """
        Soft delete by setting is_active=False.

        Only works for models with an is_active field.

        Args:
            entity_id: The entity's primary key.
            audit_user: Optional user ID for audit logging.

        Returns:
            The updated entity if found, None otherwise.
        """
        if not hasattr(self.model, "is_active"):
            raise ValueError(f"Model {self.model.__name__} does not support soft delete")

        return await self.update(
            entity_id,
            {"is_active": False},
            audit_user=audit_user,
        )

    async def count(self, filters: Optional[Dict[str, Any]] = None) -> int:
        """
        Count entities, optionally with filters.

        Args:
            filters: Optional dictionary of field=value filters.

        Returns:
            The count of matching entities.
        """
        query = select(func.count()).select_from(self.model)

        if filters:
            for field, value in filters.items():
                if hasattr(self.model, field):
                    query = query.where(getattr(self.model, field) == value)

        result = await self.db.execute(query)
        return result.scalar() or 0

    async def exists(self, entity_id: str) -> bool:
        """
        Check if an entity exists.

        Args:
            entity_id: The entity's primary key.

        Returns:
            True if exists, False otherwise.
        """
        result = await self.db.execute(
            select(func.count()).select_from(self.model).where(self.model.id == entity_id)
        )
        return (result.scalar() or 0) > 0

    async def _log_audit(
        self,
        user_id: str,
        action: str,
        entity_type: str,
        entity_id: str,
        changes: Optional[Dict[str, Any]] = None,
        classification_accessed: Optional[str] = None,
    ):
        """
        Log an audit entry.

        Args:
            user_id: The user who performed the action.
            action: The action performed (create, update, delete, etc.).
            entity_type: The type of entity.
            entity_id: The entity's ID.
            changes: Optional dictionary of changes made.
            classification_accessed: Optional classification level accessed.
        """
        audit_entry = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            changes=changes,
            classification_accessed=classification_accessed,
        )
        self.db.add(audit_entry)
