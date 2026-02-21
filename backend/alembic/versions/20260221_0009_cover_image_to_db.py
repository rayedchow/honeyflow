"""store cover image data in database as BYTEA

Revision ID: 20260221_0009
Revises: 20260221_0008
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa

revision = "20260221_0009"
down_revision = "20260221_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("cover_image_data", sa.LargeBinary(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "cover_image_data")
