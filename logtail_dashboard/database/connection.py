"""
Database Connection Manager

Handles SQLite connection management with support for async operations.
Designed for easy migration to PostgreSQL in Phase 2+.
"""

import asyncio
import os
from pathlib import Path
from typing import AsyncGenerator, Optional
from contextlib import asynccontextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from .models import Base


class DatabaseConfig:
    """Database configuration settings."""

    def __init__(
        self,
        db_path: Optional[str] = None,
        database_url: Optional[str] = None,
        echo: bool = False,
        pool_size: int = 5,
    ):
        """
        Initialize database configuration.

        Args:
            db_path: Path to SQLite database file. If None, uses default location.
            database_url: Full database URL (overrides db_path). Supports PostgreSQL.
            echo: Whether to echo SQL statements (for debugging).
            pool_size: Connection pool size.
        """
        self._database_url = database_url or os.environ.get("DATABASE_URL")
        self.echo = echo
        self.pool_size = pool_size

        if self._database_url:
            # Using explicit database URL (PostgreSQL or other)
            self.db_path = None
            self.is_postgres = "postgresql" in self._database_url
        else:
            # Default to SQLite
            if db_path is None:
                app_data = Path.home() / ".scensus"
                app_data.mkdir(parents=True, exist_ok=True)
                db_path = str(app_data / "scensus_crm.db")
            self.db_path = db_path
            self.is_postgres = False

    @property
    def sync_url(self) -> str:
        """SQLAlchemy sync connection URL."""
        if self._database_url:
            # Convert asyncpg URL to psycopg2 for sync
            url = self._database_url
            if "+asyncpg" in url:
                url = url.replace("+asyncpg", "")
            return url
        return f"sqlite:///{self.db_path}"

    @property
    def async_url(self) -> str:
        """SQLAlchemy async connection URL."""
        if self._database_url:
            url = self._database_url
            # Ensure async driver is used
            if "postgresql://" in url and "+asyncpg" not in url:
                url = url.replace("postgresql://", "postgresql+asyncpg://")
            return url
        return f"sqlite+aiosqlite:///{self.db_path}"


class DatabaseManager:
    """
    Manages database connections and sessions.

    Provides both sync and async session management for flexibility.
    The sync interface is useful for migrations and CLI tools.
    The async interface is used by the FastAPI backend.
    """

    _instance: Optional["DatabaseManager"] = None
    _lock = asyncio.Lock()

    def __init__(self, config: Optional[DatabaseConfig] = None):
        """
        Initialize the database manager.

        Args:
            config: Database configuration. Uses defaults if not provided.
        """
        self.config = config or DatabaseConfig()

        # Sync engine for migrations and sync operations
        sync_kwargs = {"echo": self.config.echo}
        if not self.config.is_postgres:
            sync_kwargs["connect_args"] = {"check_same_thread": False}
            sync_kwargs["poolclass"] = StaticPool

        self._sync_engine = create_engine(self.config.sync_url, **sync_kwargs)

        # Enable foreign key constraints for SQLite
        if not self.config.is_postgres:
            @event.listens_for(self._sync_engine, "connect")
            def set_sqlite_pragma(dbapi_connection, connection_record):
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.close()

        # Async engine for FastAPI
        async_kwargs = {"echo": self.config.echo}
        if not self.config.is_postgres:
            async_kwargs["connect_args"] = {"check_same_thread": False}

        self._async_engine = create_async_engine(self.config.async_url, **async_kwargs)

        # Session factories
        self._sync_session_factory = sessionmaker(
            bind=self._sync_engine,
            autocommit=False,
            autoflush=False,
        )

        self._async_session_factory = async_sessionmaker(
            bind=self._async_engine,
            class_=AsyncSession,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )

        self._initialized = False

    @classmethod
    async def get_instance(cls, config: Optional[DatabaseConfig] = None) -> "DatabaseManager":
        """
        Get the singleton database manager instance.

        Args:
            config: Optional configuration (only used on first call).

        Returns:
            The database manager instance.
        """
        async with cls._lock:
            if cls._instance is None:
                cls._instance = cls(config)
            return cls._instance

    @classmethod
    def get_instance_sync(cls, config: Optional[DatabaseConfig] = None) -> "DatabaseManager":
        """
        Get the singleton database manager instance (sync version).

        Args:
            config: Optional configuration (only used on first call).

        Returns:
            The database manager instance.
        """
        if cls._instance is None:
            cls._instance = cls(config)
        return cls._instance

    @classmethod
    def reset_instance(cls):
        """Reset the singleton instance (useful for testing)."""
        cls._instance = None

    def create_tables(self):
        """Create all database tables."""
        Base.metadata.create_all(bind=self._sync_engine)
        self._initialized = True

    async def create_tables_async(self):
        """Create all database tables (async version)."""
        async with self._async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self._initialized = True

    def drop_tables(self):
        """Drop all database tables. Use with caution!"""
        Base.metadata.drop_all(bind=self._sync_engine)

    async def drop_tables_async(self):
        """Drop all database tables async. Use with caution!"""
        async with self._async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    def get_sync_session(self) -> Session:
        """
        Get a synchronous database session.

        Returns:
            A new SQLAlchemy Session.
        """
        return self._sync_session_factory()

    @asynccontextmanager
    async def get_async_session(self) -> AsyncGenerator[AsyncSession, None]:
        """
        Get an asynchronous database session as a context manager.

        Yields:
            An AsyncSession that will be automatically closed.
        """
        session = self._async_session_factory()
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    async def close(self):
        """Close all database connections."""
        await self._async_engine.dispose()
        self._sync_engine.dispose()

    @property
    def is_initialized(self) -> bool:
        """Check if database tables have been created."""
        return self._initialized


# Global database manager instance
_db_manager: Optional[DatabaseManager] = None


async def init_database(config: Optional[DatabaseConfig] = None) -> DatabaseManager:
    """
    Initialize the database and create tables.

    This should be called once at application startup.

    Args:
        config: Optional database configuration.

    Returns:
        The initialized DatabaseManager.
    """
    global _db_manager
    _db_manager = await DatabaseManager.get_instance(config)
    await _db_manager.create_tables_async()
    return _db_manager


def init_database_sync(config: Optional[DatabaseConfig] = None) -> DatabaseManager:
    """
    Initialize the database synchronously.

    Useful for CLI tools and migrations.

    Args:
        config: Optional database configuration.

    Returns:
        The initialized DatabaseManager.
    """
    global _db_manager
    _db_manager = DatabaseManager.get_instance_sync(config)
    _db_manager.create_tables()
    return _db_manager


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency for getting a database session.

    Usage:
        @app.get("/items")
        async def get_items(db: AsyncSession = Depends(get_db)):
            ...

    Yields:
        An AsyncSession for database operations.
    """
    global _db_manager
    if _db_manager is None:
        _db_manager = await DatabaseManager.get_instance()
        await _db_manager.create_tables_async()

    async with _db_manager.get_async_session() as session:
        yield session


def get_db_manager() -> Optional[DatabaseManager]:
    """Get the current database manager instance."""
    return _db_manager
