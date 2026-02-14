"""Add PostGIS geography generated columns (Postgres-only)

Revision ID: 007
Revises: 006
Create Date: 2026-02-13
"""
from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Only apply PostGIS columns on PostgreSQL
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    # Enable PostGIS extension if not already enabled
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # Add computed geography column for session_actors
    op.execute("""
        ALTER TABLE session_actors ADD COLUMN IF NOT EXISTS position GEOGRAPHY(POINT, 4326)
        GENERATED ALWAYS AS (
            CASE WHEN lon IS NOT NULL AND lat IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
                ELSE NULL
            END
        ) STORED
    """)

    # Add computed geography column for engagement_jam_bursts
    op.execute("""
        ALTER TABLE engagement_jam_bursts ADD COLUMN IF NOT EXISTS emitter_position GEOGRAPHY(POINT, 4326)
        GENERATED ALWAYS AS (
            CASE WHEN emitter_lon IS NOT NULL AND emitter_lat IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint(emitter_lon, emitter_lat), 4326)::geography
                ELSE NULL
            END
        ) STORED
    """)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("ALTER TABLE engagement_jam_bursts DROP COLUMN IF EXISTS emitter_position")
    op.execute("ALTER TABLE session_actors DROP COLUMN IF EXISTS position")
