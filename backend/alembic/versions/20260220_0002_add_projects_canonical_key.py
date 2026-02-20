"""add canonical project key for O(1) upsert matching

Revision ID: 20260220_0002
Revises: 20260220_0001
Create Date: 2026-02-20 06:45:00
"""

import re
from typing import Sequence, Union
from urllib.parse import unquote, urlparse

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260220_0002"
down_revision: Union[str, None] = "20260220_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _extract_arxiv_id(url: str) -> str:
    parsed = urlparse(str(url))
    path = parsed.path.strip("/")
    parts = [p for p in path.split("/") if p]

    raw = parts[-1] if parts else path
    if raw.endswith(".pdf"):
        raw = raw[:-4]

    m_new = re.search(r"(\d{4}\.\d{4,5})(v\d+)?", raw, flags=re.IGNORECASE)
    if m_new:
        return m_new.group(1)

    m_old = re.search(r"([a-z\-\.]+/\d{7})(v\d+)?", raw, flags=re.IGNORECASE)
    if m_old:
        return m_old.group(1).lower()

    return raw


def _normalize_pypi_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", str(name).strip().lower())


def _parse_package_identity(url: str) -> tuple[str, str]:
    parsed = urlparse(str(url))
    host = (parsed.hostname or "").lower()
    parts = [unquote(p) for p in parsed.path.split("/") if p]

    if "pypi.org" in host:
        if len(parts) >= 2 and parts[0].lower() == "project":
            name = parts[1]
        elif parts:
            name = parts[0]
        else:
            raise ValueError("Could not parse PyPI package name from URL")
        return "PYPI", _normalize_pypi_name(name)

    if parts and parts[0].lower() == "package":
        parts = parts[1:]

    if not parts:
        raise ValueError("Could not parse npm package name from URL")

    if parts[0].startswith("@") and len(parts) >= 2:
        return "NPM", "{}/{}".format(parts[0], parts[1]).lower()
    return "NPM", parts[0].lower()


def _parse_repo_owner_repo(url: str) -> tuple[str, str]:
    parsed = urlparse(str(url))
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 2:
        raise ValueError("Could not parse owner/repo from URL")
    owner = parts[0]
    repo = parts[1]
    if repo.endswith(".git"):
        repo = repo[:-4]
    if not owner or not repo:
        raise ValueError("Could not parse owner/repo from URL")
    return owner, repo


def _canonical_source_url(url: str, trace_type: str) -> str:
    trace_type = str(trace_type or "repo").lower()

    try:
        if trace_type == "repo":
            owner, repo = _parse_repo_owner_repo(url)
            return "https://github.com/{}/{}".format(owner.lower(), repo.lower())

        if trace_type == "paper":
            return "https://arxiv.org/abs/{}".format(_extract_arxiv_id(url))

        if trace_type == "package":
            ecosystem, package_name = _parse_package_identity(url)
            if ecosystem == "PYPI":
                return "https://pypi.org/project/{}/".format(package_name)
            return "https://www.npmjs.com/package/{}".format(package_name)
    except Exception:
        pass

    parsed = urlparse(str(url))
    scheme = parsed.scheme or "https"
    host = (parsed.netloc or "").lower()
    path = parsed.path.rstrip("/")
    return "{}://{}{}".format(scheme, host, path)


def _canonical_source_key(url: str, trace_type: str) -> str:
    trace_type = str(trace_type or "repo").lower()
    canonical = _canonical_source_url(url, trace_type).rstrip("/").lower()
    return "{}:{}".format(trace_type, canonical)


def _pick_winner(rows: list[dict]) -> dict:
    return sorted(
        rows,
        key=lambda r: (
            -float(r["raised"] or 0),
            r["created_at"] is None,
            r["created_at"],
            r["id"],
        ),
    )[0]


def upgrade() -> None:
    op.add_column("projects", sa.Column("canonical_key", sa.String(), nullable=True))

    bind = op.get_bind()
    rows = (
        bind.execute(
            sa.text(
                "SELECT id, type, source_url, raised, created_at FROM projects ORDER BY id"
            )
        )
        .mappings()
        .all()
    )

    grouped: dict[str, list[dict]] = {}
    for row in rows:
        key = _canonical_source_key(row["source_url"] or "", row["type"] or "repo")
        grouped.setdefault(key, []).append(dict(row))

    for key, dupes in grouped.items():
        winner = _pick_winner(dupes)
        total_raised = sum(float(r["raised"] or 0) for r in dupes)

        bind.execute(
            sa.text(
                "UPDATE projects SET canonical_key = :key, raised = :raised WHERE id = :id"
            ),
            {"key": key, "raised": total_raised, "id": winner["id"]},
        )

        for row in dupes:
            if row["id"] == winner["id"]:
                continue
            bind.execute(
                sa.text("DELETE FROM projects WHERE id = :id"),
                {"id": row["id"]},
            )

    op.alter_column("projects", "canonical_key", nullable=False)
    op.create_unique_constraint(
        "projects_canonical_key_key",
        "projects",
        ["canonical_key"],
    )


def downgrade() -> None:
    op.drop_constraint("projects_canonical_key_key", "projects", type_="unique")
    op.drop_column("projects", "canonical_key")
