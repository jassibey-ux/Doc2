"""Enhance engagement_metrics with burst-aware columns

Revision ID: 004
Revises: 003
Create Date: 2026-02-13
"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("engagement_metrics", sa.Column("anchor_type", sa.String(20), server_default="first_jam_on"))
    op.add_column("engagement_metrics", sa.Column("anchor_timestamp", sa.DateTime))
    op.add_column("engagement_metrics", sa.Column("denial_onset_timestamp", sa.DateTime))
    op.add_column("engagement_metrics", sa.Column("denial_angle_off_boresight_deg_v2", sa.Float))
    op.add_column("engagement_metrics", sa.Column("reacquisition_time_s", sa.Float))
    op.add_column("engagement_metrics", sa.Column("telemetry_loss_duration_s", sa.Float))
    op.add_column("engagement_metrics", sa.Column("per_burst_json", sa.Text))  # JSONType stored as TEXT
    op.add_column("engagement_metrics", sa.Column("computation_version", sa.String(50), server_default="2.0"))
    op.add_column("engagement_metrics", sa.Column("job_id", sa.String(100)))


def downgrade() -> None:
    op.drop_column("engagement_metrics", "job_id")
    op.drop_column("engagement_metrics", "computation_version")
    op.drop_column("engagement_metrics", "per_burst_json")
    op.drop_column("engagement_metrics", "telemetry_loss_duration_s")
    op.drop_column("engagement_metrics", "reacquisition_time_s")
    op.drop_column("engagement_metrics", "denial_angle_off_boresight_deg_v2")
    op.drop_column("engagement_metrics", "denial_onset_timestamp")
    op.drop_column("engagement_metrics", "anchor_timestamp")
    op.drop_column("engagement_metrics", "anchor_type")
