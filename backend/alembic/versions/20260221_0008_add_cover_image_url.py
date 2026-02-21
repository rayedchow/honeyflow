"""add cover_image_url column to projects

Revision ID: 20260221_0008
Revises: 20260221_0006
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa

revision = "20260221_0008"
down_revision = "20260221_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("cover_image_url", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "cover_image_url")
