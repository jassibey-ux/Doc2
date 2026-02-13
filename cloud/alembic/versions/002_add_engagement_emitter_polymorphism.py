"""Add emitter_type and emitter_id to engagements

Revision ID: 002
Revises: 001
Create Date: 2026-02-13
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("engagements", sa.Column("emitter_type", sa.String(20), nullable=False, server_default="cuas_system"))
    op.add_column("engagements", sa.Column("emitter_id", sa.String(36), nullable=False, server_default=""))
    op.create_index("idx_engagements_emitter", "engagements", ["emitter_type", "emitter_id"])

    # Make cuas_placement_id nullable for actor-based engagements
    op.alter_column("engagements", "cuas_placement_id", existing_type=sa.String(36), nullable=True)

    # Backfill emitter_id from cuas_placement_id for existing rows
    op.execute("UPDATE engagements SET emitter_id = cuas_placement_id WHERE cuas_placement_id IS NOT NULL")


def downgrade() -> None:
    op.drop_index("idx_engagements_emitter", table_name="engagements")
    op.drop_column("engagements", "emitter_id")
    op.drop_column("engagements", "emitter_type")
    op.alter_column("engagements", "cuas_placement_id", existing_type=sa.String(36), nullable=False)
