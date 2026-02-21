"""add jury_priors table for human feedback training loop

Revision ID: 20260221_0005
Revises: 20260220_0004
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa

revision = "20260221_0005"
down_revision = "20260220_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "jury_priors",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("entity_name", sa.String(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("avg_human_weight", sa.Float(), nullable=False, server_default=sa.text("0.5")),
        sa.Column("avg_ai_weight", sa.Float(), nullable=False, server_default=sa.text("0.5")),
        sa.Column("avg_correction", sa.Float(), nullable=False, server_default=sa.text("1.0")),
        sa.Column("vote_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entity_name", "entity_type", name="uq_jury_priors_entity"),
    )
    op.create_index(
        "ix_jury_priors_entity_type",
        "jury_priors",
        ["entity_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_jury_priors_entity_type", table_name="jury_priors")
    op.drop_table("jury_priors")
