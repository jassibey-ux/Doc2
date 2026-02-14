"""Add burst_id and client_timestamp to test_events

Revision ID: 005
Revises: 004
Create Date: 2026-02-13
"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("test_events", sa.Column("burst_id", sa.String(36), sa.ForeignKey("engagement_jam_bursts.id"), nullable=True))
    op.add_column("test_events", sa.Column("client_timestamp", sa.DateTime))


def downgrade() -> None:
    op.drop_column("test_events", "client_timestamp")
    op.drop_column("test_events", "burst_id")
