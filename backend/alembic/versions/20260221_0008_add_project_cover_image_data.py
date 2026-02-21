"""add cover_image_data column to projects

Revision ID: 20260221_0008
Revises: 20260221_0007
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa

revision = "20260221_0008"
down_revision = "20260221_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    column_names = {col["name"] for col in inspector.get_columns("projects")}
    if "cover_image_data" not in column_names:
        op.add_column(
            "projects",
            sa.Column("cover_image_data", sa.LargeBinary(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    column_names = {col["name"] for col in inspector.get_columns("projects")}
    if "cover_image_data" in column_names:
        op.drop_column("projects", "cover_image_data")
