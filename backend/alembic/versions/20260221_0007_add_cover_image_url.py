"""add cover_image_url column to projects

Revision ID: 20260221_0007
Revises: 20260221_0006
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa

revision = "20260221_0007"
down_revision = "20260221_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    column_names = {col["name"] for col in inspector.get_columns("projects")}
    if "cover_image_url" not in column_names:
        op.add_column(
            "projects",
            sa.Column("cover_image_url", sa.String(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    column_names = {col["name"] for col in inspector.get_columns("projects")}
    if "cover_image_url" in column_names:
        op.drop_column("projects", "cover_image_url")
