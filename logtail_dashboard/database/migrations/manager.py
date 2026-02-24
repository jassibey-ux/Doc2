"""
Migration Manager

Handles database schema versioning and migrations.
Designed for SQLite with a simple version table approach.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable, List, Optional

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


@dataclass
class Migration:
    """Represents a single database migration."""

    version: int
    name: str
    description: str
    up_sql: str  # SQL to apply migration
    down_sql: str  # SQL to rollback migration


# Initial schema is created by SQLAlchemy models
# These migrations are for incremental changes after initial deployment
MIGRATIONS: List[Migration] = [
    # Migration 1: Initial schema (handled by SQLAlchemy create_all)
    Migration(
        version=1,
        name="initial_schema",
        description="Initial CRM database schema created by SQLAlchemy",
        up_sql="-- Schema created by SQLAlchemy ORM",
        down_sql="-- Cannot rollback initial schema without data loss",
    ),
    Migration(
        version=2,
        name="add_engagements",
        description="Add engagement model tables and engagement_id FK on test_events",
        up_sql="""
            CREATE TABLE IF NOT EXISTS engagements (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES test_sessions(id),
                cuas_placement_id TEXT NOT NULL REFERENCES cuas_placements(id),
                name TEXT,
                engagement_type TEXT DEFAULT 'test',
                status TEXT DEFAULT 'planned',
                engage_timestamp TIMESTAMP,
                disengage_timestamp TIMESTAMP,
                cuas_lat REAL,
                cuas_lon REAL,
                cuas_alt_m REAL,
                cuas_orientation_deg REAL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_engagements_session ON engagements(session_id);
            CREATE INDEX IF NOT EXISTS idx_engagements_status ON engagements(status);
            CREATE INDEX IF NOT EXISTS idx_engagements_cuas_placement ON engagements(cuas_placement_id);

            CREATE TABLE IF NOT EXISTS engagement_targets (
                id TEXT PRIMARY KEY,
                engagement_id TEXT NOT NULL REFERENCES engagements(id),
                tracker_id TEXT NOT NULL,
                drone_profile_id TEXT REFERENCES drone_profiles(id),
                role TEXT DEFAULT 'primary_target',
                initial_range_m REAL,
                initial_bearing_deg REAL,
                angle_off_boresight_deg REAL,
                initial_altitude_m REAL,
                drone_lat REAL,
                drone_lon REAL,
                final_range_m REAL,
                final_bearing_deg REAL
            );
            CREATE INDEX IF NOT EXISTS idx_engagement_targets_engagement ON engagement_targets(engagement_id);

            CREATE TABLE IF NOT EXISTS engagement_metrics (
                id TEXT PRIMARY KEY,
                engagement_id TEXT NOT NULL UNIQUE REFERENCES engagements(id),
                time_to_effect_s REAL,
                time_to_full_denial_s REAL,
                denial_duration_s REAL,
                denial_consistency_pct REAL,
                recovery_time_s REAL,
                effective_range_m REAL,
                denial_bearing_deg REAL,
                denial_angle_off_boresight_deg REAL,
                min_range_m REAL,
                recovery_range_m REAL,
                max_drift_m REAL,
                max_lateral_drift_m REAL,
                max_vertical_drift_m REAL,
                altitude_change_m REAL,
                failsafe_triggered BOOLEAN DEFAULT 0,
                failsafe_type TEXT,
                pass_fail TEXT,
                overall_score REAL,
                data_source TEXT DEFAULT 'live_only',
                metrics_json TEXT,
                analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE test_events ADD COLUMN engagement_id TEXT REFERENCES engagements(id);
            CREATE INDEX IF NOT EXISTS idx_events_engagement ON test_events(engagement_id)
        """,
        down_sql="""
            DROP INDEX IF EXISTS idx_events_engagement;
            DROP TABLE IF EXISTS engagement_metrics;
            DROP TABLE IF EXISTS engagement_targets;
            DROP TABLE IF EXISTS engagements
        """,
    ),
    Migration(
        version=3,
        name="Add 3D model and recon fields",
        description="Add 3D model columns to profiles and recon fields to sites",
        up_sql="""
            ALTER TABLE sites ADD COLUMN recon_status VARCHAR(20) DEFAULT 'none';
            ALTER TABLE sites ADD COLUMN recon_captured_at DATETIME;
            ALTER TABLE sites ADD COLUMN camera_state_3d TEXT;
            ALTER TABLE drone_profiles ADD COLUMN model_3d VARCHAR(255);
            ALTER TABLE cuas_profiles ADD COLUMN model_3d VARCHAR(255);
        """,
        down_sql="""
            -- SQLite doesn't support DROP COLUMN before 3.35.0
            -- These columns will be ignored if not present
        """,
    ),
    Migration(
        version=4,
        name="merge_jam_burst_into_engagement",
        description="Add merged jam fields to engagements table (1:1 with burst)",
        up_sql="""
            ALTER TABLE engagements ADD COLUMN jam_on_at TIMESTAMP;
            ALTER TABLE engagements ADD COLUMN jam_off_at TIMESTAMP;
            ALTER TABLE engagements ADD COLUMN jam_duration_s REAL;
            ALTER TABLE engagements ADD COLUMN jam_frequency_mhz REAL;
            ALTER TABLE engagements ADD COLUMN jam_power_dbm REAL;
            ALTER TABLE engagements ADD COLUMN jam_bandwidth_mhz REAL;
            ALTER TABLE engagements ADD COLUMN gps_denial_detected BOOLEAN DEFAULT 0;
            ALTER TABLE engagements ADD COLUMN denial_onset_at TIMESTAMP;
            ALTER TABLE engagements ADD COLUMN time_to_effect_s REAL
        """,
        down_sql="""
            -- SQLite < 3.35 cannot DROP COLUMN; columns will be ignored if unused
        """,
    ),
    Migration(
        version=5,
        name="add_model_3d_override",
        description="Add model_3d_override column to tracker_assignments and cuas_placements",
        up_sql="""
            ALTER TABLE tracker_assignments ADD COLUMN model_3d_override VARCHAR(255);
            ALTER TABLE cuas_placements ADD COLUMN model_3d_override VARCHAR(255)
        """,
        down_sql="""
            -- SQLite < 3.35 cannot DROP COLUMN; columns will be ignored if unused
        """,
    ),
    Migration(
        version=6,
        name="add_burst_rf_columns",
        description="Add frequency/power/bandwidth columns to engagement_jam_bursts for per-burst RF params",
        up_sql="""
            ALTER TABLE engagement_jam_bursts ADD COLUMN frequency_mhz REAL;
            ALTER TABLE engagement_jam_bursts ADD COLUMN power_dbm REAL;
            ALTER TABLE engagement_jam_bursts ADD COLUMN bandwidth_mhz REAL
        """,
        down_sql="""
            -- SQLite < 3.35 cannot DROP COLUMN; columns will be ignored if unused
        """,
    ),
]


class MigrationManager:
    """
    Manages database schema migrations.

    Uses a simple version table to track applied migrations.
    """

    VERSION_TABLE = "schema_version"

    def __init__(self, engine: Engine):
        """
        Initialize the migration manager.

        Args:
            engine: SQLAlchemy engine instance.
        """
        self.engine = engine
        self._ensure_version_table()

    def _ensure_version_table(self):
        """Create the schema version table if it doesn't exist."""
        create_sql = f"""
            CREATE TABLE IF NOT EXISTS {self.VERSION_TABLE} (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """
        with self.engine.connect() as conn:
            conn.execute(text(create_sql))
            conn.commit()

    def get_current_version(self) -> int:
        """
        Get the current schema version.

        Returns:
            The current version number, or 0 if no migrations applied.
        """
        query = f"SELECT MAX(version) FROM {self.VERSION_TABLE}"
        with self.engine.connect() as conn:
            result = conn.execute(text(query))
            row = result.fetchone()
            return row[0] if row and row[0] else 0

    def get_applied_migrations(self) -> List[dict]:
        """
        Get list of applied migrations.

        Returns:
            List of dicts with version, name, and applied_at.
        """
        query = f"""
            SELECT version, name, applied_at
            FROM {self.VERSION_TABLE}
            ORDER BY version
        """
        with self.engine.connect() as conn:
            result = conn.execute(text(query))
            return [
                {
                    "version": row[0],
                    "name": row[1],
                    "applied_at": row[2],
                }
                for row in result.fetchall()
            ]

    def get_pending_migrations(self) -> List[Migration]:
        """
        Get list of migrations that haven't been applied.

        Returns:
            List of pending Migration objects.
        """
        current = self.get_current_version()
        return [m for m in MIGRATIONS if m.version > current]

    def apply_migration(self, migration: Migration) -> bool:
        """
        Apply a single migration.

        Args:
            migration: The migration to apply.

        Returns:
            True if successful, False otherwise.
        """
        logger.info(f"Applying migration {migration.version}: {migration.name}")

        try:
            with self.engine.connect() as conn:
                # Skip comment-only migrations (like initial schema)
                if migration.up_sql.strip() and not migration.up_sql.strip().startswith("--"):
                    # Execute migration SQL
                    for statement in migration.up_sql.split(";"):
                        statement = statement.strip()
                        if statement:
                            conn.execute(text(statement))

                # Record migration
                insert_sql = f"""
                    INSERT INTO {self.VERSION_TABLE} (version, name)
                    VALUES (:version, :name)
                """
                conn.execute(
                    text(insert_sql),
                    {"version": migration.version, "name": migration.name},
                )
                conn.commit()

            logger.info(f"Migration {migration.version} applied successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to apply migration {migration.version}: {e}")
            return False

    def rollback_migration(self, migration: Migration) -> bool:
        """
        Rollback a single migration.

        Args:
            migration: The migration to rollback.

        Returns:
            True if successful, False otherwise.
        """
        logger.info(f"Rolling back migration {migration.version}: {migration.name}")

        try:
            with self.engine.connect() as conn:
                # Execute rollback SQL
                if migration.down_sql.strip() and not migration.down_sql.strip().startswith("--"):
                    for statement in migration.down_sql.split(";"):
                        statement = statement.strip()
                        if statement:
                            conn.execute(text(statement))

                # Remove migration record
                delete_sql = f"""
                    DELETE FROM {self.VERSION_TABLE}
                    WHERE version = :version
                """
                conn.execute(text(delete_sql), {"version": migration.version})
                conn.commit()

            logger.info(f"Migration {migration.version} rolled back successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to rollback migration {migration.version}: {e}")
            return False

    def migrate_to_latest(self) -> int:
        """
        Apply all pending migrations.

        Returns:
            Number of migrations applied.
        """
        pending = self.get_pending_migrations()

        if not pending:
            logger.info("Database is already at latest version")
            return 0

        applied_count = 0
        for migration in pending:
            if self.apply_migration(migration):
                applied_count += 1
            else:
                logger.error(f"Migration stopped at version {migration.version}")
                break

        return applied_count

    def migrate_to_version(self, target_version: int) -> int:
        """
        Migrate to a specific version (up or down).

        Args:
            target_version: The target schema version.

        Returns:
            Number of migrations applied/rolled back.
        """
        current = self.get_current_version()

        if target_version == current:
            logger.info(f"Already at version {target_version}")
            return 0

        if target_version > current:
            # Migrate up
            to_apply = [
                m for m in MIGRATIONS
                if current < m.version <= target_version
            ]
            count = 0
            for migration in sorted(to_apply, key=lambda m: m.version):
                if self.apply_migration(migration):
                    count += 1
                else:
                    break
            return count

        else:
            # Migrate down
            to_rollback = [
                m for m in MIGRATIONS
                if target_version < m.version <= current
            ]
            count = 0
            for migration in sorted(to_rollback, key=lambda m: m.version, reverse=True):
                if self.rollback_migration(migration):
                    count += 1
                else:
                    break
            return count

    def get_status(self) -> dict:
        """
        Get migration status.

        Returns:
            Dict with current version, latest version, and pending count.
        """
        current = self.get_current_version()
        latest = max((m.version for m in MIGRATIONS), default=0)
        pending = len(self.get_pending_migrations())

        return {
            "current_version": current,
            "latest_version": latest,
            "pending_migrations": pending,
            "is_current": current == latest,
        }
