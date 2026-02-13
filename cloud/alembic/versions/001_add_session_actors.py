"""Add session_actors table

Revision ID: 001
Revises:
Create Date: 2026-02-13
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "session_actors",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("test_sessions.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("callsign", sa.String(50)),
        sa.Column("lat", sa.Float),
        sa.Column("lon", sa.Float),
        sa.Column("heading_deg", sa.Float),
        sa.Column("tracker_unit_id", sa.String(100)),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime),
        sa.Column("updated_at", sa.DateTime),
    )
    op.create_index("idx_actors_session", "session_actors", ["session_id"])


def downgrade() -> None:
    op.drop_index("idx_actors_session", table_name="session_actors")
    op.drop_table("session_actors")
