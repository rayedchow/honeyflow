"""add edge_votes table for jury feedback

Revision ID: 20260220_0004
Revises: 20260220_0003
Create Date: 2026-02-20 11:10:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260220_0004"
down_revision: Union[str, None] = "20260220_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "edge_votes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("wallet_address", sa.String(), nullable=False),
        sa.Column("edge_source", sa.String(), nullable=False),
        sa.Column("edge_target", sa.String(), nullable=False),
        sa.Column("ai_weight", sa.Float(), nullable=False),
        sa.Column("human_weight", sa.Float(), nullable=False),
        sa.Column(
            "confidence", sa.Float(), nullable=False, server_default=sa.text("0.7")
        ),
        sa.Column(
            "question_type",
            sa.String(),
            nullable=False,
            server_default=sa.text("'edge'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_edge_votes_project_id",
        "edge_votes",
        ["project_id"],
        unique=False,
    )
    op.create_index(
        "ix_edge_votes_project_edge",
        "edge_votes",
        ["project_id", "edge_source", "edge_target"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_edge_votes_project_edge", table_name="edge_votes")
    op.drop_index("ix_edge_votes_project_id", table_name="edge_votes")
    op.drop_table("edge_votes")
