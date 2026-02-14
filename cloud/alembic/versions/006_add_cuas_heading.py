"""Add heading_deg to cuas_placements

Revision ID: 006
Revises: 005
Create Date: 2026-02-13
"""
from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cuas_placements", sa.Column("heading_deg", sa.Float))


def downgrade() -> None:
    op.drop_column("cuas_placements", "heading_deg")
