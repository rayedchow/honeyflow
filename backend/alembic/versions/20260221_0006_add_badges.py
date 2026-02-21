"""add badges table for user merit badges

Revision ID: 20260221_0006
Revises: 20260221_0005
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa

revision = "20260221_0006"
down_revision = "20260221_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "badges",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("badge_key", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column(
            "earned_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username", "badge_key", name="uq_user_badge"),
    )
    op.create_index("ix_badges_username", "badges", ["username"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_badges_username", table_name="badges")
    op.drop_table("badges")
