"""Add engagement_jam_bursts table

Revision ID: 003
Revises: 002
Create Date: 2026-02-13
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "engagement_jam_bursts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("engagement_id", sa.String(36), sa.ForeignKey("engagements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("burst_seq", sa.Integer, nullable=False),
        sa.Column("jam_on_at", sa.DateTime, nullable=False),
        sa.Column("jam_off_at", sa.DateTime),
        sa.Column("duration_s", sa.Float),
        # Emitter snapshot at jam_on
        sa.Column("emitter_lat", sa.Float),
        sa.Column("emitter_lon", sa.Float),
        sa.Column("emitter_heading_deg", sa.Float),
        # Per-target snapshots as JSON
        sa.Column("target_snapshots", sa.Text),  # JSONType stored as TEXT
        # Denial detection
        sa.Column("gps_denial_detected", sa.Boolean, default=False),
        sa.Column("denial_onset_at", sa.DateTime),
        sa.Column("time_to_effect_s", sa.Float),
        # Metadata
        sa.Column("notes", sa.Text),
        sa.Column("source", sa.String(20), server_default="live"),
        sa.Column("created_at", sa.DateTime),
        sa.UniqueConstraint("engagement_id", "burst_seq", name="uq_engagement_burst_seq"),
    )
    op.create_index("idx_bursts_engagement", "engagement_jam_bursts", ["engagement_id"])
    op.create_index("idx_bursts_time", "engagement_jam_bursts", ["jam_on_at"])


def downgrade() -> None:
    op.drop_index("idx_bursts_time", table_name="engagement_jam_bursts")
    op.drop_index("idx_bursts_engagement", table_name="engagement_jam_bursts")
    op.drop_table("engagement_jam_bursts")
