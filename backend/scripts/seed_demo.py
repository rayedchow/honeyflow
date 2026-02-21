"""Comprehensive demo data seeder with REAL project tracing.

Traces real GitHub repos, npm/PyPI packages, and arXiv papers using the
actual graph builders, then adds donations, jury votes, priors, and
community feedback on top of the traced data.

Run from the backend/ directory:
    python -m scripts.seed_demo          # trace + seed
    python -m scripts.seed_demo --reset  # wipe ALL data from every table

Note: Tracing requires network access (GitHub, arXiv, npm/PyPI APIs).
      Each trace takes ~30-120s. Total runtime ~5-15 minutes.
"""

import argparse
import asyncio
import logging
import os
import random
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import delete, select, text
from sqlalchemy.orm import defer

from app.database import SessionLocal, engine, session_scope
from app.models.badge import Badge
from app.models.community_feedback import CommunityFeedback
from app.models.edge_vote import EdgeVote
from app.models.jury_prior import JuryPrior
from app.models.project import Project
from app.services.citation_graph_builder import build_citation_graph
from app.services.github import parse_repo_owner_and_name
from app.services.graph_builder import build_contribution_graph
from app.services.package_graph_builder import build_package_graph
from app.services.donation_db import init_donations_db
from app.services.screenshot import take_project_screenshot
from app.services.vault_db import init_db as init_vault_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("seed_demo")

random.seed(42)

# ---------------------------------------------------------------------------
# Tracing configuration
# ---------------------------------------------------------------------------

TRACE_DEPTH = 4
TRACE_MAX_CHILDREN = 15
TRACE_MAX_CITATIONS = 8

PROJECTS_TO_TRACE = [
    # ── Repos ─────────────────────────────────────────────────
    {
        "url": "https://github.com/transmissions11/solmate",
        "type": "repo",
        "raised": 67100.0,
        "category": "Infrastructure",
    },
    {
        "url": "https://github.com/Vectorized/solady",
        "type": "repo",
        "raised": 52300.0,
        "category": "Infrastructure",
    },
    {
        "url": "https://github.com/pcaversaccio/createx",
        "type": "repo",
        "raised": 34500.0,
        "category": "Security",
    },
    {
        "url": "https://github.com/Uniswap/permit2",
        "type": "repo",
        "raised": 45200.0,
        "category": "Infrastructure",
    },
    # ── Papers ────────────────────────────────────────────────
    {
        "url": "https://arxiv.org/abs/1706.03762",
        "type": "paper",
        "raised": 41200.0,
        "category": "Research",
    },
    {
        "url": "https://arxiv.org/abs/2010.11929",
        "type": "paper",
        "raised": 31200.0,
        "category": "Research",
    },
    # ── Packages ──────────────────────────────────────────────
    {
        "url": "https://www.npmjs.com/package/viem",
        "type": "package",
        "raised": 28500.0,
        "category": "Infrastructure",
    },
    {
        "url": "https://www.npmjs.com/package/wagmi",
        "type": "package",
        "raised": 23800.0,
        "category": "Infrastructure",
    },
    {
        "url": "https://github.com/rayedchow/codeu",
        "type": "repo",
        "raised": 2600.0,
        "category": "AI",
    },
]

# ---------------------------------------------------------------------------
# Wallet addresses for donations / jury votes
# ---------------------------------------------------------------------------

DEMO_WALLETS = [
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "0x1a9C8182C09F50C8318d769245beA52c32BE35BC",
    "0x57757E3D981446D585Af0D9Ae4d7DF6D64647806",
    "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B",
    "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
]
HARDCODED_PROJECT_VAULT_ADDRESS = "0xA379391214d8D4Cbed7d8190a598CAf93ad38ED3"
HARDCODED_PROJECT_VAULT_ID = "seeded-shared-vault"


# ---------------------------------------------------------------------------
# URL parsing helpers (same logic as routes/stream.py)
# ---------------------------------------------------------------------------


def _slugify(name: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", name.lower()))


def _extract_arxiv_id(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.strip("/")
    parts = [p for p in path.split("/") if p]
    raw = parts[-1] if parts else path
    if raw.endswith(".pdf"):
        raw = raw[:-4]
    m = re.search(r"(\d{4}\.\d{4,5})(v\d+)?", raw)
    if m:
        return m.group(1)
    m2 = re.search(r"([a-z\-\.]+/\d{7})(v\d+)?", raw, re.IGNORECASE)
    if m2:
        return m2.group(1).lower()
    return raw


def _normalize_pypi_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name.strip().lower())


def _parse_package_identity(url: str) -> tuple[str, str]:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    parts = [unquote(p) for p in parsed.path.split("/") if p]
    if "pypi.org" in host:
        name = (
            parts[1] if len(parts) >= 2 and parts[0].lower() == "project" else parts[0]
        )
        return "PYPI", _normalize_pypi_name(name)
    if parts and parts[0].lower() == "package":
        parts = parts[1:]
    if parts[0].startswith("@") and len(parts) >= 2:
        return "NPM", f"{parts[0]}/{parts[1]}".lower()
    return "NPM", parts[0].lower()


def _canonical_source_url(url: str, trace_type: str) -> str:
    if trace_type == "repo":
        owner, repo = parse_repo_owner_and_name(url)
        return f"https://github.com/{owner.lower()}/{repo.lower()}"
    if trace_type == "paper":
        return f"https://arxiv.org/abs/{_extract_arxiv_id(url)}"
    if trace_type == "package":
        ecosystem, pkg = _parse_package_identity(url)
        if ecosystem == "PYPI":
            return f"https://pypi.org/project/{pkg}/"
        return f"https://www.npmjs.com/package/{pkg}"
    return url


def _canonical_source_key(url: str, trace_type: str) -> str:
    canonical = _canonical_source_url(url, trace_type)
    return f"{trace_type}:{canonical.rstrip('/').lower()}"


# ---------------------------------------------------------------------------
# Tracing
# ---------------------------------------------------------------------------


async def _trace_project(spec: dict) -> Optional[dict]:
    """Run the real tracer for a single project. Returns result dict or None."""
    url = spec["url"]
    trace_type = spec["type"]
    logger.info("━━━ Tracing [%s] %s ━━━", trace_type.upper(), url)

    try:
        if trace_type == "repo":
            graph, config, attribution = await build_contribution_graph(
                url,
                max_depth=TRACE_DEPTH,
                max_children=TRACE_MAX_CHILDREN,
            )
            graph_dict = graph.model_dump()
            owner, repo = parse_repo_owner_and_name(url)
            name = repo

            sorted_contribs = sorted(
                attribution.items(), key=lambda x: x[1], reverse=True
            )[:10]
            total = sum(attribution.values()) or 1
            top_contributors = [
                {"name": c[0], "percentage": f"{(c[1] / total) * 100:.1f}%"}
                for c in sorted_contribs
            ]
            deps = list(
                dict.fromkeys(
                    n["label"]
                    for n in graph_dict["nodes"]
                    if n["type"] in ("PACKAGE", "BODY_OF_WORK")
                )
            )[:20]

            return {
                "name": name,
                "category": spec.get("category", "Infrastructure"),
                "type": "repo",
                "summary": f"Contribution graph for {name}",
                "description": f"Automatically traced dependency and contribution graph for the {name} repository.",
                "source_url": url,
                "contributors": len(attribution),
                "depth": config.max_depth,
                "graph_data": graph_dict,
                "attribution": attribution,
                "dependencies": deps,
                "top_contributors": top_contributors,
            }

        elif trace_type == "paper":
            arxiv_id = _extract_arxiv_id(url)
            graph, config, attribution, title = await build_citation_graph(
                arxiv_id,
                max_depth=TRACE_DEPTH,
                max_citations=TRACE_MAX_CITATIONS,
            )
            graph_dict = graph.model_dump()
            name = title or arxiv_id

            sorted_contribs = sorted(
                attribution.items(), key=lambda x: x[1], reverse=True
            )[:10]
            total = sum(attribution.values()) or 1
            top_contributors = [
                {"name": c[0], "percentage": f"{(c[1] / total) * 100:.1f}%"}
                for c in sorted_contribs
            ]
            deps = [
                n["label"] for n in graph_dict["nodes"] if n["type"] == "CITED_WORK"
            ][:20]

            return {
                "name": name,
                "category": spec.get("category", "Research"),
                "type": "paper",
                "summary": f"Citation graph for {name}",
                "description": f"Automatically traced citation and author attribution graph for: {name}.",
                "source_url": url,
                "contributors": len(attribution),
                "depth": config.max_depth,
                "graph_data": graph_dict,
                "attribution": attribution,
                "dependencies": deps,
                "top_contributors": top_contributors,
            }

        elif trace_type == "package":
            ecosystem, pkg_name = _parse_package_identity(url)
            graph, config, attribution = await build_package_graph(
                pkg_name,
                ecosystem.lower(),
                max_depth=TRACE_DEPTH,
                max_children=TRACE_MAX_CHILDREN,
            )
            graph_dict = graph.model_dump()

            sorted_contribs = sorted(
                attribution.items(), key=lambda x: x[1], reverse=True
            )[:10]
            total = sum(attribution.values()) or 1
            top_contributors = [
                {"name": c[0], "percentage": f"{(c[1] / total) * 100:.1f}%"}
                for c in sorted_contribs
            ]
            deps = list(
                dict.fromkeys(
                    n["label"]
                    for n in graph_dict["nodes"]
                    if n["type"] in ("PACKAGE", "BODY_OF_WORK")
                )
            )[:20]

            return {
                "name": pkg_name,
                "category": spec.get("category", "Infrastructure"),
                "type": "package",
                "summary": f"Package dependency graph for {pkg_name}",
                "description": f"Automatically traced dependency and contribution graph for the {pkg_name} package.",
                "source_url": url,
                "contributors": len(attribution),
                "depth": config.max_depth,
                "graph_data": graph_dict,
                "attribution": attribution,
                "dependencies": deps,
                "top_contributors": top_contributors,
            }

        else:
            logger.error("Unknown trace type: %s", trace_type)
            return None

    except Exception:
        logger.exception("TRACE FAILED for %s", url)
        return None


async def _save_traced_project(result: dict, spec: dict) -> Optional[Project]:
    """Save a traced project to the database with upsert logic."""
    trace_type = result["type"]
    canonical_url = _canonical_source_url(result["source_url"], trace_type)
    canonical_key = _canonical_source_key(result["source_url"], trace_type)

    async with session_scope() as session:
        existing = await session.scalar(
            select(Project).where(Project.canonical_key == canonical_key)
        )
        if existing is None:
            existing = await session.scalar(
                select(Project).where(
                    Project.type == trace_type,
                    Project.source_url == canonical_url,
                )
            )

        if existing:
            existing.name = result["name"]
            existing.category = result["category"]
            existing.type = result["type"]
            existing.summary = result["summary"]
            existing.description = result["description"]
            existing.source_url = canonical_url
            existing.raised = spec.get("raised", 0.0)
            existing.contributors = result["contributors"]
            existing.depth = result["depth"]
            existing.graph_data = result["graph_data"]
            existing.attribution = result["attribution"]
            existing.dependencies = result["dependencies"]
            existing.top_contributors = result["top_contributors"]
            existing.canonical_key = canonical_key
            await session.flush()
            await session.refresh(existing)
            return existing

        slug = _slugify(result["name"]) or "project"
        base_slug = slug
        suffix = 1
        while await session.scalar(select(Project.id).where(Project.slug == slug)):
            suffix += 1
            slug = f"{base_slug}-{suffix}"

        project = Project(
            slug=slug,
            canonical_key=canonical_key,
            name=result["name"],
            category=result["category"],
            type=result["type"],
            summary=result["summary"],
            description=result["description"],
            source_url=canonical_url,
            raised=spec.get("raised", 0.0),
            contributors=result["contributors"],
            depth=result["depth"],
            graph_data=result["graph_data"],
            attribution=result["attribution"],
            dependencies=result["dependencies"],
            top_contributors=result["top_contributors"],
        )
        session.add(project)
        await session.flush()
        await session.refresh(project)
        return project


async def _apply_cover_image(
    screenshot_task: asyncio.Task,
    actual_slug: str,
) -> str | None:
    """Persist generated cover bytes to project.cover_image_data/url."""
    try:
        cover_data = await asyncio.wait_for(screenshot_task, timeout=60.0)
        if not cover_data:
            return None

        cover_url = f"/projects/{actual_slug}/cover"

        async with session_scope() as session:
            project = await session.scalar(
                select(Project)
                .where(Project.slug == actual_slug)
                .options(
                    defer(Project.graph_data),
                    defer(Project.attribution),
                    defer(Project.dependencies),
                    defer(Project.top_contributors),
                )
            )
            if project:
                project.cover_image_data = cover_data
                project.cover_image_url = cover_url
                logger.info("Cover image updated for %s: %s", actual_slug, cover_url)
                return cover_url
        return None
    except Exception as exc:
        logger.warning("Cover image finalization failed for %s: %s", actual_slug, exc)
        return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _rand_addr() -> str:
    return "0x" + os.urandom(20).hex()


def _now_minus(days: int = 0, hours: int = 0) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days, hours=hours)


# ---------------------------------------------------------------------------
# Donation seeding
# ---------------------------------------------------------------------------


def _build_donations(project_slugs: list[str]) -> list[dict]:
    donations = []
    for slug in project_slugs:
        n = random.randint(8, 18)
        for i in range(n):
            addr = random.choice(DEMO_WALLETS) if i < 3 else _rand_addr()
            if i == 0:
                amount = round(random.uniform(1.5, 5.0), 4)
            elif i < 4:
                amount = round(random.uniform(0.3, 2.0), 4)
            else:
                amount = round(min(random.expovariate(2.0) + 0.01, 3.0), 4)
            donations.append(
                {
                    "project_id": slug,
                    "donator_address": addr,
                    "amount_eth": amount,
                    "tx_hash": None,
                    "created_at": _now_minus(
                        days=random.randint(0, 30), hours=random.randint(0, 23)
                    ),
                }
            )
    return donations


# ---------------------------------------------------------------------------
# Edge vote seeding
# ---------------------------------------------------------------------------


def _build_edge_votes(saved_projects: list[tuple[Project, dict]]) -> list[dict]:
    votes = []
    for project, _spec in saved_projects:
        graph = project.graph_data or {}
        edges = graph.get("edges", [])
        voteable = [e for e in edges if e.get("weight", 0) > 0.05][:8]

        for edge in voteable:
            for _ in range(random.randint(1, 6)):
                wallet = random.choice(DEMO_WALLETS)
                ai_w = edge["weight"]
                human_w = max(0.01, min(1.0, ai_w + random.uniform(-0.15, 0.15)))
                votes.append(
                    {
                        "project_id": project.id,
                        "wallet_address": wallet.lower(),
                        "edge_source": edge["source"],
                        "edge_target": edge["target"],
                        "ai_weight": round(ai_w, 6),
                        "human_weight": round(human_w, 6),
                        "confidence": random.choice([0.5, 0.7, 0.8, 0.9, 1.0]),
                        "question_type": "edge",
                    }
                )
    return votes


# ---------------------------------------------------------------------------
# Jury prior seeding
# ---------------------------------------------------------------------------


def _build_jury_priors(saved_projects: list[tuple[Project, dict]]) -> list[dict]:
    seen_contributors: set[str] = set()
    seen_deps: set[str] = set()

    for project, _ in saved_projects:
        for tc in (project.top_contributors or [])[:5]:
            seen_contributors.add(tc["name"])
        for dep in (project.dependencies or [])[:4]:
            seen_deps.add(dep)

    priors = []
    for name in list(seen_contributors)[:15]:
        ah = round(random.uniform(0.3, 0.8), 4)
        aa = round(random.uniform(0.2, 0.7), 4)
        priors.append(
            {
                "entity_name": name,
                "entity_type": "contributor",
                "avg_human_weight": ah,
                "avg_ai_weight": aa,
                "avg_correction": round(ah / max(aa, 0.01), 4),
                "vote_count": random.randint(3, 30),
            }
        )
    for dep in list(seen_deps)[:10]:
        ah = round(random.uniform(0.4, 0.9), 4)
        aa = round(random.uniform(0.3, 0.8), 4)
        priors.append(
            {
                "entity_name": dep,
                "entity_type": "dependency",
                "avg_human_weight": ah,
                "avg_ai_weight": aa,
                "avg_correction": round(ah / max(aa, 0.01), 4),
                "vote_count": random.randint(2, 15),
            }
        )
    return priors


# ---------------------------------------------------------------------------
# Community feedback seeding
# ---------------------------------------------------------------------------

FEEDBACK_TEMPLATES = [
    "Great project! The attribution weights look fair to me.",
    "I think the dependency weights are slightly overestimated for this project.",
    "The contributor breakdown seems accurate based on my experience with the codebase.",
    "Would love to see more granular attribution for sub-module contributions.",
    "The recursive funding model is exactly what OSS needs. Well done!",
    "Attribution looks solid. The top contributor deserves that share.",
    "I've reviewed the graph and the weights make sense for the dependencies involved.",
    "The AI did a surprisingly good job estimating relative contributions here.",
    "Minor suggestion: dev dependencies should carry less weight in the attribution.",
    "Excellent transparency. Being able to see exactly how funds flow is powerful.",
    "The graph visualization really helps understand the dependency structure.",
    "I verified the contributor stats and they align with what I see on GitHub.",
    "This is a much fairer system than traditional grant allocation.",
    "The jury system adds a nice human check on the AI attribution.",
    "Love that we can track exactly how funding flows through the dependency tree.",
]


def _build_community_feedback(project_slugs: list[str]) -> list[dict]:
    feedback = []
    for slug in project_slugs:
        for _ in range(random.randint(3, 8)):
            feedback.append(
                {
                    "project_id": slug,
                    "feedback": random.choice(FEEDBACK_TEMPLATES),
                }
            )
    return feedback


async def _seed_project_vaults(project_slugs: list[str]) -> None:
    """Upsert the same hardcoded vault address for every seeded project."""
    async with SessionLocal() as session:
        for slug in project_slugs:
            await session.execute(
                text(
                    """
                    INSERT INTO project_vaults (project_id, wallet_id, address)
                    VALUES (:project_id, :wallet_id, :address)
                    ON CONFLICT (project_id)
                    DO UPDATE SET
                        wallet_id = EXCLUDED.wallet_id,
                        address = EXCLUDED.address
                    """
                ),
                {
                    "project_id": slug,
                    "wallet_id": HARDCODED_PROJECT_VAULT_ID,
                    "address": HARDCODED_PROJECT_VAULT_ADDRESS,
                },
            )
        await session.commit()


# ---------------------------------------------------------------------------
# Ensure tables exist
# ---------------------------------------------------------------------------


async def _ensure_tables() -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("""
            CREATE TABLE IF NOT EXISTS community_feedback (
                id          SERIAL PRIMARY KEY,
                project_id  TEXT NOT NULL,
                feedback    TEXT NOT NULL,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """)
        )


# ---------------------------------------------------------------------------
# Main seed routine
# ---------------------------------------------------------------------------


async def seed() -> None:
    await init_donations_db()
    await init_vault_db()
    await _ensure_tables()

    # ── Phase 1: Trace all projects ───────────────────────────
    print()
    print("=" * 60)
    print("PHASE 1: TRACING PROJECTS")
    print("=" * 60)
    print(
        f"Tracing {len(PROJECTS_TO_TRACE)} projects (depth={TRACE_DEPTH}, "
        f"max_children={TRACE_MAX_CHILDREN})..."
    )
    print()

    saved_projects: list[tuple[Project, dict]] = []
    failed: list[str] = []

    for i, spec in enumerate(PROJECTS_TO_TRACE, 1):
        print(f"\n[{i}/{len(PROJECTS_TO_TRACE)}] {spec['type'].upper()}: {spec['url']}")
        print("-" * 60)

        canonical_url = _canonical_source_url(spec["url"], spec["type"])
        screenshot_task = asyncio.create_task(take_project_screenshot(canonical_url))

        result = await _trace_project(spec)
        if result is None:
            if not screenshot_task.done():
                screenshot_task.cancel()
            failed.append(spec["url"])
            print("  ✗ FAILED — skipping")
            continue

        n_nodes = len(result["graph_data"].get("nodes", []))
        n_edges = len(result["graph_data"].get("edges", []))
        n_contribs = result["contributors"]
        print(
            f"  ✓ Traced: {n_nodes} nodes, {n_edges} edges, {n_contribs} contributors"
        )

        project = await _save_traced_project(result, spec)
        if project:
            cover_url = await _apply_cover_image(screenshot_task, project.slug)
            saved_projects.append((project, spec))
            print(
                f"  ✓ Saved: slug={project.slug}, id={project.id}, "
                f"${spec.get('raised', 0):,.0f} raised"
            )
            if cover_url:
                print(f"  ✓ Cover: {cover_url}")
            else:
                print("  ⚠ Cover: not generated")
        else:
            if not screenshot_task.done():
                screenshot_task.cancel()
            failed.append(spec["url"])
            print("  ✗ Save failed")

    if not saved_projects:
        print("\nNo projects were traced successfully. Aborting.")
        return

    slugs = [p.slug for p, _ in saved_projects]

    # ── Phase 2: Seed supplementary data ──────────────────────
    print()
    print("=" * 60)
    print("PHASE 2: SEEDING SUPPLEMENTARY DATA")
    print("=" * 60)

    print(
        f"\nHardcoding project vault wallets ({len(slugs)} projects) -> "
        f"{HARDCODED_PROJECT_VAULT_ADDRESS}"
    )
    await _seed_project_vaults(slugs)

    donations = _build_donations(slugs)
    edge_votes_data = _build_edge_votes(saved_projects)
    jury_priors = _build_jury_priors(saved_projects)
    community_fb = _build_community_feedback(slugs)

    async with SessionLocal() as session:
        # Clear old supplementary data
        print("\nClearing old supplementary data...")
        await session.execute(delete(EdgeVote))
        await session.execute(delete(JuryPrior))
        await session.execute(delete(Badge))
        await session.execute(text("DELETE FROM community_feedback"))
        await session.execute(text("DELETE FROM donations WHERE tx_hash IS NULL"))
        await session.commit()

        # Insert donations
        print(f"\nInserting {len(donations)} donations...")
        for d in donations:
            await session.execute(
                text("""
                    INSERT INTO donations (project_id, donator_address, amount_eth, tx_hash, created_at)
                    VALUES (:project_id, :donator_address, :amount_eth, :tx_hash, :created_at)
                """),
                d,
            )
        await session.commit()

        slug_totals: dict[str, float] = {}
        for d in donations:
            slug_totals[d["project_id"]] = (
                slug_totals.get(d["project_id"], 0) + d["amount_eth"]
            )
        for slug, total in sorted(slug_totals.items()):
            count = sum(1 for d in donations if d["project_id"] == slug)
            print(f"  {slug}: {total:.4f} ETH ({count} donations)")

        # Insert edge votes
        print(f"\nInserting {len(edge_votes_data)} edge votes...")
        for v in edge_votes_data:
            session.add(
                EdgeVote(
                    project_id=v["project_id"],
                    wallet_address=v["wallet_address"],
                    edge_source=v["edge_source"],
                    edge_target=v["edge_target"],
                    ai_weight=v["ai_weight"],
                    human_weight=v["human_weight"],
                    confidence=v["confidence"],
                    question_type=v["question_type"],
                )
            )
        await session.commit()

        votes_per_wallet: dict[str, int] = {}
        for v in edge_votes_data:
            w = v["wallet_address"]
            votes_per_wallet[w] = votes_per_wallet.get(w, 0) + 1
        for w, c in sorted(votes_per_wallet.items(), key=lambda x: -x[1])[:5]:
            print(f"  {w[:10]}...{w[-6:]}: {c} votes")

        # Insert jury priors
        print(f"\nInserting {len(jury_priors)} jury priors...")
        for jp in jury_priors:
            session.add(
                JuryPrior(
                    entity_name=jp["entity_name"],
                    entity_type=jp["entity_type"],
                    avg_human_weight=jp["avg_human_weight"],
                    avg_ai_weight=jp["avg_ai_weight"],
                    avg_correction=jp["avg_correction"],
                    vote_count=jp["vote_count"],
                )
            )
        await session.commit()

        # Insert community feedback
        print(f"\nInserting {len(community_fb)} community feedback entries...")
        for fb in community_fb:
            session.add(
                CommunityFeedback(
                    project_id=fb["project_id"],
                    feedback=fb["feedback"],
                )
            )
        await session.commit()

    # ── Summary ───────────────────────────────────────────────
    print()
    print("=" * 60)
    print("SEED COMPLETE")
    print("=" * 60)
    print(f"  Projects traced:    {len(saved_projects)}/{len(PROJECTS_TO_TRACE)}")
    if failed:
        print(f"  Failed:             {len(failed)}")
        for url in failed:
            print(f"    - {url}")
    print(f"  Donations:          {len(donations)}")
    print(f"  Edge votes:         {len(edge_votes_data)}")
    print(f"  Jury priors:        {len(jury_priors)}")
    print(f"  Community feedback: {len(community_fb)}")
    print(f"  Project vaults:     {len(slugs)} (hardcoded)")

    print("\nProjects in DB:")
    for project, spec in saved_projects:
        n_nodes = len((project.graph_data or {}).get("nodes", []))
        n_tc = len(project.top_contributors or [])
        print(
            f"  /explore/{project.slug}  —  {n_nodes} nodes, {n_tc} contributors, "
            f"${spec.get('raised', 0):,.0f} raised"
        )

    print("\nTop contributors across all projects:")
    user_projects: dict[str, int] = {}
    for project, _ in saved_projects:
        for tc in project.top_contributors or []:
            user_projects[tc["name"]] = user_projects.get(tc["name"], 0) + 1
    for name, count in sorted(user_projects.items(), key=lambda x: -x[1])[:10]:
        print(f"  /user/{name}  —  {count} project(s)")

    print(f"\nDemo wallet for badges: {DEMO_WALLETS[0]}")
    print("  Pass as ?wallet= param to /users/<name> for philanthropist + juror badges")


async def reset_db() -> None:
    """Drop ALL data from every application table."""
    await init_donations_db()
    await init_vault_db()
    await _ensure_tables()

    async with SessionLocal() as session:
        tables = [
            "edge_votes",
            "jury_priors",
            "badges",
            "community_feedback",
            "donations",
            "projects",
            "project_vaults",
        ]
        for table in tables:
            try:
                result = await session.execute(text(f"DELETE FROM {table}"))
                print(f"  {table}: {result.rowcount} rows deleted")
            except Exception as e:
                print(f"  {table}: skipped ({e.__class__.__name__})")
        await session.commit()

    print("\nDatabase reset complete — all tables emptied.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed or reset the demo database")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Wipe ALL data from every table instead of seeding",
    )
    args = parser.parse_args()

    if args.reset:
        asyncio.run(reset_db())
    else:
        asyncio.run(seed())
