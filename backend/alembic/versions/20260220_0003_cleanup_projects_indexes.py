"""cleanup redundant projects indexes and canonical key constraint

Revision ID: 20260220_0003
Revises: 20260220_0002
Create Date: 2026-02-20 06:55:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic
revision: str = "20260220_0003"
down_revision: Union[str, None] = "20260220_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(bind) -> set[str]:
    return {idx["name"] for idx in sa.inspect(bind).get_indexes("projects")}


def _unique_constraint_names(bind) -> set[str]:
    return {
        c["name"] for c in sa.inspect(bind).get_unique_constraints("projects")
        if c.get("name")
    }


def upgrade() -> None:
    bind = op.get_bind()
    index_names = _index_names(bind)

    if "projects_slug_idx" in index_names:
        op.drop_index("projects_slug_idx", table_name="projects")
    if "ix_projects_slug" in index_names:
        op.drop_index("ix_projects_slug", table_name="projects")

    unique_names = _unique_constraint_names(bind)
    if "projects_canonical_key_key" not in unique_names:
        if "ix_projects_canonical_key" in index_names:
            op.execute(
                sa.text(
                    "ALTER TABLE projects "
                    "ADD CONSTRAINT projects_canonical_key_key "
                    "UNIQUE USING INDEX ix_projects_canonical_key"
                )
            )
        else:
            op.create_unique_constraint(
                "projects_canonical_key_key",
                "projects",
                ["canonical_key"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    unique_names = _unique_constraint_names(bind)
    if "projects_canonical_key_key" in unique_names:
        op.drop_constraint("projects_canonical_key_key", "projects", type_="unique")

    index_names = _index_names(bind)
    if "ix_projects_canonical_key" not in index_names:
        op.create_index(
            "ix_projects_canonical_key",
            "projects",
            ["canonical_key"],
            unique=True,
        )
    if "projects_slug_idx" not in index_names:
        op.create_index("projects_slug_idx", "projects", ["slug"], unique=False)
