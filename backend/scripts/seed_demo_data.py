"""Seed high-quality demo data for HoneyFlow.

This script is intentionally opinionated for demo environments:
- runs real tracing across repo / paper / package project types,
- upserts projects with canonical keys,
- enriches the dataset with synthetic but realistic projects,
- seeds high-value donations, jury votes, priors, badges, and feedback,
- is re-runnable (cleans only demo-tagged rows where possible).

Run from backend/:
    python -m scripts.seed_demo_data

Optional flags:
    python -m scripts.seed_demo_data --seed 1337 --trace-timeout 180
    python -m scripts.seed_demo_data --skip-traces
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import logging
import random
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import delete, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import session_scope
from app.models.badge import Badge
from app.models.donation import Donation
from app.models.edge_vote import EdgeVote
from app.models.jury_prior import JuryPrior
from app.models.project import Project
from app.routes.stream import _canonical_source_key, _canonical_source_url, _slugify
from app.services.arxiv import parse_arxiv_id
from app.services.citation_graph_builder import build_citation_graph
from app.services.donation_db import init_donations_db
from app.services.github import parse_repo_owner_and_name
from app.services.graph_builder import build_contribution_graph
from app.services.package_graph_builder import build_package_graph
from app.services.vault_db import init_db as init_vault_db

log = logging.getLogger("seed_demo_data")

ETH_TO_USD = 2500.0
DEMO_TX_PREFIX = "0xdeadbeef"
DEMO_JUROR_PREFIX = "bee"
DEMO_VAULT_PREFIX = "fac"
ROOT_NODE_TYPES = {"REPO", "PACKAGE", "PAPER"}
LEAF_NODE_TYPES = {"CONTRIBUTOR", "AUTHOR"}


@dataclass(frozen=True)
class TraceSpec:
    trace_type: str  # repo | paper | package
    category: str
    source: str  # repo_url, arxiv_id/url, package_name
    ecosystem: str | None = None  # for package: "npm" | "pypi"
    max_depth: int = 2
    max_children: int = 8
    max_citations: int = 4


@dataclass(frozen=True)
class SyntheticSpec:
    name: str
    slug: str
    project_type: str  # repo | paper | package
    category: str
    summary: str
    description: str
    source_url: str
    tech_stack: tuple[str, ...]
    dependency_pool: tuple[str, ...]
    lead_user: str
    depth: int


TRACE_SPECS: list[TraceSpec] = [
    TraceSpec(
        trace_type="repo",
        category="Infrastructure",
        source="https://github.com/fastapi/fastapi",
        max_depth=2,
        max_children=7,
    ),
    TraceSpec(
        trace_type="repo",
        category="Security",
        source="https://github.com/OpenZeppelin/openzeppelin-contracts",
        max_depth=2,
        max_children=7,
    ),
    TraceSpec(
        trace_type="paper",
        category="Research",
        source="1706.03762",
        max_depth=1,
        max_citations=4,
    ),
    TraceSpec(
        trace_type="package",
        category="Infrastructure",
        source="httpx",
        ecosystem="pypi",
        max_depth=2,
        max_children=6,
    ),
    TraceSpec(
        trace_type="package",
        category="Cryptography",
        source="viem",
        ecosystem="npm",
        max_depth=2,
        max_children=6,
    ),
]


CORE_CONTRIBUTORS = [
    "gaearon",
    "sindresorhus",
    "addyosmani",
    "paulmillr",
    "kentcdodds",
    "leerob",
    "shuding",
    "torvalds",
    "vbuterin",
]

CONTRIBUTOR_POOL = [
    "gaearon",
    "sindresorhus",
    "addyosmani",
    "paulmillr",
    "kentcdodds",
    "leerob",
    "shuding",
    "torvalds",
    "vbuterin",
    "rauchg",
    "sebmarkbage",
    "acdlite",
    "yyx990803",
    "jakewharton",
    "tj",
    "mxstbr",
    "developit",
    "wesbos",
    "cassidoo",
    "swyx",
    "octocat",
    "mojombo",
    "defunkt",
    "be5invis",
    "evanw",
    "jashkenas",
    "fabpot",
    "josevalim",
    "mitchellh",
    "jlevy",
    "t3dotgg",
    "theo",
    "antfu",
    "gaearonbot",
    "hybridzk",
    "cryptotess",
    "zklara",
]

JUROR_USERNAMES = [
    "gaearon",
    "sindresorhus",
    "jakewharton",
    "wesbos",
    "t3dotgg",
    "antfu",
    "octocat",
    "hybridzk",
]

SYNTHETIC_SPECS: list[SyntheticSpec] = [
    SyntheticSpec(
        name="Zero-Knowledge ML",
        slug="zero-knowledge-ml-live",
        project_type="paper",
        category="Research",
        summary="ZK proofs for verifying ML inference in public blockchains.",
        description=(
            "A research track focused on proving model inference correctness with "
            "succinct proofs. The team combines recursive proof systems and model "
            "distillation to keep verification costs practical for on-chain use."
        ),
        source_url="https://arxiv.org/abs/2401.04268",
        tech_stack=("Halo2", "PyTorch", "Rust", "SNARKs"),
        dependency_pool=(
            "Nova: Recursive Proof Composition",
            "Succinct Proofs for Neural Inference",
            "Practical zkML Systems Survey",
            "Polynomial Commitments in Production",
            "On-Chain Verifier Optimization",
        ),
        lead_user="vbuterin",
        depth=2,
    ),
    SyntheticSpec(
        name="DePIN Mesh Network",
        slug="depin-mesh-network-live",
        project_type="repo",
        category="Infrastructure",
        summary="Community-owned connectivity layer for resilient low-cost networking.",
        description=(
            "An open-source implementation of distributed mesh routing with incentive "
            "alignment for node operators. The project includes embedded firmware, "
            "routing middleware, and a reliability analytics dashboard."
        ),
        source_url="https://github.com/honeyflow/depin-mesh-network",
        tech_stack=("Rust", "libp2p", "PostgreSQL", "Prometheus"),
        dependency_pool=("libp2p", "tokio", "prost", "sqlx", "prometheus", "serde"),
        lead_user="gaearon",
        depth=3,
    ),
    SyntheticSpec(
        name="Agent Framework",
        slug="agent-framework-live",
        project_type="repo",
        category="AI",
        summary="Composable framework for autonomous agents with verifiable actions.",
        description=(
            "A modular framework where AI agents reason over state, plan workflows, "
            "and execute audited transactions. It supports simulation-first rollout, "
            "tool plugins, and reproducible runbooks for operators."
        ),
        source_url="https://github.com/honeyflow/agent-framework",
        tech_stack=("TypeScript", "OpenTelemetry", "Postgres", "Redis"),
        dependency_pool=("langchain", "zod", "bullmq", "openai", "drizzle", "viem"),
        lead_user="sindresorhus",
        depth=3,
    ),
    SyntheticSpec(
        name="Recursive STARK Verifier",
        slug="recursive-stark-verifier-live",
        project_type="paper",
        category="Cryptography",
        summary="Recursive verification design for scalable rollup proof systems.",
        description=(
            "This paper proposes a recursion-friendly verifier architecture that lowers "
            "proof verification costs while preserving strong soundness guarantees. "
            "Benchmarks show meaningful gas savings for high-throughput deployments."
        ),
        source_url="https://arxiv.org/abs/2402.11890",
        tech_stack=("STARK", "Finite Fields", "Rust", "Proof Systems"),
        dependency_pool=(
            "Batching Strategies for Recursive Proofs",
            "Algebraic Hash Functions at Scale",
            "Efficient FRI Parameterization",
            "Polynomial IOP Design Patterns",
            "Verifier Cost Modeling for L1",
        ),
        lead_user="paulmillr",
        depth=2,
    ),
    SyntheticSpec(
        name="Solidity Fuzzer",
        slug="solidity-fuzzer-live",
        project_type="package",
        category="Security",
        summary="Property-based fuzzing toolkit for EVM contract security workflows.",
        description=(
            "A package designed for auditors and protocol teams to run deterministic "
            "fuzz campaigns across contract state transitions. It includes shrinking, "
            "coverage guidance, and exploit trace export."
        ),
        source_url="https://www.npmjs.com/package/demo-solidity-fuzzer",
        tech_stack=("Node.js", "TypeScript", "Foundry", "Hardhat"),
        dependency_pool=("ethers", "viem", "fast-check", "chalk", "commander", "zod"),
        lead_user="addyosmani",
        depth=3,
    ),
    SyntheticSpec(
        name="OpenGraph Protocol",
        slug="opengraph-protocol-live",
        project_type="package",
        category="Social",
        summary="Portable social graph primitives for multi-app interoperability.",
        description=(
            "Defines a shared interface for follows, reputation signals, and context "
            "objects that can move between social clients. The package ships with "
            "validation schemas and indexer integration utilities."
        ),
        source_url="https://www.npmjs.com/package/demo-opengraph-protocol",
        tech_stack=("TypeScript", "GraphQL", "IPFS", "Postgres"),
        dependency_pool=("graphql", "pino", "zod", "superjson", "viem", "pg"),
        lead_user="leerob",
        depth=2,
    ),
    SyntheticSpec(
        name="Cross-Chain Indexer",
        slug="cross-chain-indexer-live",
        project_type="package",
        category="Infrastructure",
        summary="Unified indexing runtime for cross-chain application analytics.",
        description=(
            "A runtime that normalizes events and entity views across EVM networks. "
            "It provides deterministic backfill, streaming checkpoints, and "
            "developer-focused query ergonomics for analytics workloads."
        ),
        source_url="https://pypi.org/project/demo-cross-chain-indexer/",
        tech_stack=("Python", "AsyncIO", "SQLAlchemy", "ClickHouse"),
        dependency_pool=("httpx", "pydantic", "sqlalchemy", "orjson", "aiohttp", "tenacity"),
        lead_user="shuding",
        depth=2,
    ),
    SyntheticSpec(
        name="DAO Governance Kit",
        slug="dao-governance-kit-live",
        project_type="package",
        category="Governance",
        summary="Composable governance modules for proposal lifecycle and voting.",
        description=(
            "Provides drop-in governance modules for proposal authoring, voting "
            "strategies, and timelock execution. Teams can ship custom governance "
            "flows while preserving transparent audit trails."
        ),
        source_url="https://www.npmjs.com/package/demo-dao-governance-kit",
        tech_stack=("Solidity", "TypeScript", "Foundry", "IPFS"),
        dependency_pool=("openzeppelin", "viem", "hardhat", "merkletreejs", "dotenv", "zod"),
        lead_user="kentcdodds",
        depth=2,
    ),
    SyntheticSpec(
        name="FHE Analytics",
        slug="fhe-analytics-live",
        project_type="paper",
        category="Privacy",
        summary="Confidential analytics under fully homomorphic encryption constraints.",
        description=(
            "Explores practical encrypted query execution for governance and DeFi "
            "reporting. The paper balances correctness, throughput, and key "
            "management concerns for production-ready confidential analytics."
        ),
        source_url="https://arxiv.org/abs/2403.09111",
        tech_stack=("FHE", "Lattices", "Rust", "Privacy Engineering"),
        dependency_pool=(
            "Bootstrapping Cost Reduction Techniques",
            "Encrypted Aggregation for Governance",
            "Privacy-Preserving Query Compilation",
            "Lattice Parameter Selection Study",
            "Secure Multiparty Analytics Baselines",
        ),
        lead_user="vbuterin",
        depth=2,
    ),
    SyntheticSpec(
        name="MEV Shield",
        slug="mev-shield-live",
        project_type="package",
        category="Security",
        summary="Private routing middleware that reduces common MEV extraction vectors.",
        description=(
            "Middleware for wallet and dapp teams to route transactions through "
            "privacy-preserving lanes with transparent policy controls. Includes "
            "simulation hooks and configurable fallback strategies."
        ),
        source_url="https://www.npmjs.com/package/demo-mev-shield",
        tech_stack=("TypeScript", "Ethers", "RPC", "Simulation"),
        dependency_pool=("viem", "ethers", "pino", "undici", "zod", "rxjs"),
        lead_user="paulmillr",
        depth=3,
    ),
    SyntheticSpec(
        name="Self-Sovereign ID",
        slug="self-sovereign-id-live",
        project_type="repo",
        category="Identity",
        summary="Developer toolkit for verifiable credentials and selective disclosure.",
        description=(
            "A full-stack identity repository that implements credential issuance, "
            "verification, and revocation flows. It prioritizes interoperability with "
            "existing DID standards and robust privacy defaults."
        ),
        source_url="https://github.com/honeyflow/self-sovereign-id",
        tech_stack=("TypeScript", "Rust", "DID", "Verifiable Credentials"),
        dependency_pool=("did-jwt", "jose", "multiformats", "ipfs-http-client", "zod", "viem"),
        lead_user="gaearon",
        depth=3,
    ),
    SyntheticSpec(
        name="Audit AI",
        slug="audit-ai-live",
        project_type="repo",
        category="Security",
        summary="LLM-assisted auditing pipeline for contract and protocol review.",
        description=(
            "A repository that combines static analysis, protocol context extraction, "
            "and model-guided triage to reduce reviewer time-to-signal. It outputs "
            "evidence-linked findings and reproducible audit snapshots."
        ),
        source_url="https://github.com/honeyflow/audit-ai",
        tech_stack=("Python", "TypeScript", "LLM", "Static Analysis"),
        dependency_pool=("slither-analyzer", "mypy", "pydantic", "httpx", "rich", "tenacity"),
        lead_user="addyosmani",
        depth=3,
    ),
    SyntheticSpec(
        name="Civic Reputation Layer",
        slug="civic-reputation-layer-live",
        project_type="repo",
        category="Governance",
        summary="On-chain reputation primitives for governance and public goods funding.",
        description=(
            "Introduces composable reputation attestations with anti-sybil constraints "
            "and transparent scoring. Teams can tune weighting policies while keeping "
            "governance outputs auditable and contestable."
        ),
        source_url="https://github.com/honeyflow/civic-reputation-layer",
        tech_stack=("Rust", "GraphQL", "Postgres", "Indexing"),
        dependency_pool=("axum", "serde", "sqlx", "juniper", "tokio", "prometheus"),
        lead_user="kentcdodds",
        depth=2,
    ),
    SyntheticSpec(
        name="Privacy Relay SDK",
        slug="privacy-relay-sdk-live",
        project_type="package",
        category="Privacy",
        summary="SDK for routing sensitive actions through auditable privacy relays.",
        description=(
            "A package that helps apps route user actions through relay networks with "
            "policy checks, monitoring, and compliance hooks. It includes robust retry "
            "logic and explicit trade-off controls for latency versus privacy."
        ),
        source_url="https://pypi.org/project/demo-privacy-relay-sdk/",
        tech_stack=("Python", "Cryptography", "AsyncIO", "Telemetry"),
        dependency_pool=("cryptography", "httpx", "anyio", "pydantic", "uvloop", "prometheus-client"),
        lead_user="sindresorhus",
        depth=2,
    ),
]


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-5s  [%(name)s]  %(message)s",
        datefmt="%H:%M:%S",
    )


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _hash_hex(value: str, length: int = 64) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:length]


def _make_eth_address(key: str, prefix: str = "") -> str:
    raw_prefix = "".join(ch for ch in prefix.lower().replace("0x", "") if ch in "0123456789abcdef")
    suffix = _hash_hex(key, 40)
    body = (raw_prefix + suffix)[:40]
    body = body.ljust(40, "0")
    return "0x{}".format(body)


def _demo_tx_hash(project_slug: str, idx: int, seed: int) -> str:
    return "{}{}".format(DEMO_TX_PREFIX, _hash_hex("{}:{}:{}".format(seed, project_slug, idx), 56))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _normalized_weights(count: int, rng: random.Random, *, floor: float = 0.0) -> list[float]:
    if count <= 0:
        return []
    raw = [rng.uniform(0.2, 1.2) for _ in range(count)]
    total = sum(raw) or 1.0
    out = [(val / total) for val in raw]
    if floor > 0:
        out = [max(floor, v) for v in out]
    return out


def _rebalance_parent_edges(graph_data: dict[str, Any]) -> None:
    """Normalize each source's outgoing edge weights to sum to 1."""
    edges: list[dict[str, Any]] = graph_data.get("edges") or []
    by_source: dict[str, list[int]] = defaultdict(list)
    for idx, edge in enumerate(edges):
        src = str(edge.get("source", ""))
        if src:
            by_source[src].append(idx)

    for idx_list in by_source.values():
        if not idx_list:
            continue
        weights = [max(_safe_float(edges[i].get("weight"), 0.0), 0.0) for i in idx_list]
        total = sum(weights)
        if total <= 0:
            equal = 1.0 / len(idx_list)
            for i in idx_list:
                edges[i]["weight"] = round(equal, 4)
        else:
            scaled = [w / total for w in weights]
            rounded = [round(v, 4) for v in scaled]
            diff = round(1.0 - sum(rounded), 4)
            rounded[0] = round(max(0.0, rounded[0] + diff), 4)
            if rounded[0] > 1.0:
                rounded[0] = 1.0
            for i, value in zip(idx_list, rounded):
                edges[i]["weight"] = value
        for i in idx_list:
            pct = round(_safe_float(edges[i].get("weight"), 0.0) * 100, 1)
            edges[i]["label"] = "{}%".format(pct)


def _compute_leaf_attribution(graph_data: dict[str, Any]) -> dict[str, float]:
    nodes = graph_data.get("nodes") or []
    edges = graph_data.get("edges") or []
    node_by_id = {str(node.get("id", "")): node for node in nodes if node.get("id")}
    children: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for edge in edges:
        source = str(edge.get("source", ""))
        target = str(edge.get("target", ""))
        if not source or not target:
            continue
        children[source].append((target, _clamp01(_safe_float(edge.get("weight"), 0.0))))

    root_id = ""
    for node in nodes:
        if str(node.get("type", "")) in ROOT_NODE_TYPES:
            root_id = str(node.get("id", ""))
            break
    if not root_id:
        return {}

    attribution: dict[str, float] = defaultdict(float)
    stack: list[tuple[str, float, set[str]]] = [(root_id, 1.0, {root_id})]
    max_steps = 1_000_000
    steps = 0

    while stack:
        node_id, path_weight, seen = stack.pop()
        steps += 1
        if steps > max_steps:
            break
        node = node_by_id.get(node_id)
        if not node:
            continue
        node_type = str(node.get("type", ""))
        if node_type in LEAF_NODE_TYPES:
            label = str(node.get("label", "")).strip()
            if label:
                attribution[label] += path_weight
            continue

        for child_id, edge_weight in children.get(node_id, []):
            if child_id in seen:
                continue
            stack.append((child_id, path_weight * edge_weight, seen | {child_id}))

    sorted_rows = sorted(attribution.items(), key=lambda row: -row[1])
    return {name: round(score, 6) for name, score in sorted_rows}


def _top_contributors(attribution: dict[str, float], *, limit: int = 10) -> list[dict[str, str]]:
    if not attribution:
        return []
    total = sum(attribution.values()) or 1.0
    top_items = list(attribution.items())[:limit]
    return [
        {
            "name": name,
            "percentage": "{:.1f}%".format((score / total) * 100),
        }
        for name, score in top_items
    ]


def _extract_dependencies(graph_data: dict[str, Any], trace_type: str, project_name: str) -> list[str]:
    nodes = graph_data.get("nodes") or []
    dep_types = {"BODY_OF_WORK"}
    if trace_type == "paper":
        dep_types = {"CITED_WORK"}
    elif trace_type == "package":
        dep_types = {"BODY_OF_WORK", "PACKAGE"}

    out: list[str] = []
    seen: set[str] = set()
    for node in nodes:
        node_type = str(node.get("type", ""))
        label = str(node.get("label", "")).strip()
        if not label or label == project_name:
            continue
        if node_type in dep_types and label not in seen:
            seen.add(label)
            out.append(label)
    return out[:20]


def _pick_contributors(rng: random.Random, lead_user: str, count: int) -> list[str]:
    keep: list[str] = [lead_user]
    bonus_core = [name for name in CORE_CONTRIBUTORS if name != lead_user]
    for name in rng.sample(bonus_core, k=min(2, len(bonus_core))):
        if name not in keep:
            keep.append(name)
    candidates = [name for name in CONTRIBUTOR_POOL if name not in keep]
    for name in rng.sample(candidates, k=max(0, count - len(keep))):
        keep.append(name)
    return keep


def _contributor_metadata(username: str, rng: random.Random) -> dict[str, Any]:
    commits = rng.randint(30, 420)
    additions = rng.randint(1000, 24000)
    deletions = rng.randint(400, 10000)
    return {
        "avatar_url": "https://github.com/{}.png".format(username),
        "total_commits": commits,
        "total_additions": additions,
        "total_deletions": deletions,
        "total_lines": additions + deletions,
    }


def _build_repo_or_package_graph(spec: SyntheticSpec, rng: random.Random) -> dict[str, Any]:
    is_repo = spec.project_type == "repo"
    root_type = "REPO" if is_repo else "PACKAGE"
    root_id = (
        "repo:honeyflow/{}".format(spec.slug)
        if is_repo
        else "pkg:{}".format(spec.slug.replace("-", "_"))
    )

    nodes: list[dict[str, Any]] = [
        {
            "id": root_id,
            "type": root_type,
            "label": spec.name,
            "metadata": {
                "purpose": spec.summary,
                "tech_stack": list(spec.tech_stack),
                "source_url": spec.source_url,
            },
        }
    ]
    edges: list[dict[str, Any]] = []

    contributor_count = rng.randint(6, 9)
    contributor_names = _pick_contributors(rng, spec.lead_user, contributor_count)
    metadata_cache: dict[str, dict[str, Any]] = {}

    dep_count = rng.randint(3, min(6, len(spec.dependency_pool)))
    dep_labels = rng.sample(list(spec.dependency_pool), k=dep_count)

    root_edges: list[dict[str, Any]] = []

    for dep_idx, dep_label in enumerate(dep_labels):
        dep_id = "bow:{}:{}".format(spec.slug, _slugify("{}-{}".format(dep_label, dep_idx)))
        nodes.append(
            {
                "id": dep_id,
                "type": "BODY_OF_WORK",
                "label": dep_label,
                "metadata": {
                    "purpose": "{} is a core dependency used across critical paths.".format(dep_label),
                    "usage_import_count": rng.randint(4, 42),
                    "is_dev_dependency": rng.random() < 0.2,
                },
            }
        )
        root_edges.append(
            {
                "source": root_id,
                "target": dep_id,
                "weight": rng.uniform(0.2, 0.8),
                "label": "",
                "metadata": {
                    "dependency_name": dep_label,
                    "usage_import_count": rng.randint(4, 42),
                    "is_dev_dependency": rng.random() < 0.2,
                },
            }
        )

        dep_contrib_count = rng.randint(2, 3)
        dep_contributors = rng.sample(contributor_names, k=min(dep_contrib_count, len(contributor_names)))
        dep_child_weights = _normalized_weights(len(dep_contributors), rng)
        for username, weight in zip(dep_contributors, dep_child_weights):
            node_id = "user:{}:{}".format(username, spec.slug)
            if node_id not in metadata_cache:
                meta = _contributor_metadata(username, rng)
                metadata_cache[node_id] = meta
                nodes.append(
                    {
                        "id": node_id,
                        "type": "CONTRIBUTOR",
                        "label": username,
                        "metadata": meta,
                    }
                )
            meta = metadata_cache[node_id]
            edges.append(
                {
                    "source": dep_id,
                    "target": node_id,
                    "weight": weight,
                    "label": "",
                    "metadata": {
                        "contributor_login": username,
                        "contributor_total_lines": meta["total_lines"],
                        "contributor_total_commits": meta["total_commits"],
                    },
                }
            )

    for username in contributor_names:
        node_id = "user:{}:{}".format(username, spec.slug)
        if node_id not in metadata_cache:
            meta = _contributor_metadata(username, rng)
            metadata_cache[node_id] = meta
            nodes.append(
                {
                    "id": node_id,
                    "type": "CONTRIBUTOR",
                    "label": username,
                    "metadata": meta,
                }
            )

        raw_score = rng.uniform(1.2, 4.5)
        if username == spec.lead_user:
            raw_score += rng.uniform(4.0, 6.0)
        root_edges.append(
            {
                "source": root_id,
                "target": node_id,
                "weight": raw_score,
                "label": "",
                "metadata": {
                    "contributor_login": username,
                    "contributor_total_lines": metadata_cache[node_id]["total_lines"],
                    "contributor_total_commits": metadata_cache[node_id]["total_commits"],
                },
            }
        )

    edges.extend(root_edges)
    graph_data = {"nodes": nodes, "edges": edges}
    _rebalance_parent_edges(graph_data)
    return graph_data


def _build_paper_graph(spec: SyntheticSpec, rng: random.Random) -> dict[str, Any]:
    arxiv_id = parse_arxiv_id(spec.source_url)
    root_id = "paper:{}".format(arxiv_id)

    nodes: list[dict[str, Any]] = [
        {
            "id": root_id,
            "type": "PAPER",
            "label": spec.name,
            "metadata": {
                "title": spec.name,
                "purpose": spec.summary,
                "tech_stack": list(spec.tech_stack),
                "arxiv_url": spec.source_url,
                "source_url": spec.source_url,
            },
        }
    ]
    edges: list[dict[str, Any]] = []
    author_meta_cache: dict[str, dict[str, Any]] = {}

    author_count = rng.randint(4, 6)
    authors = _pick_contributors(rng, spec.lead_user, author_count)
    citation_count = rng.randint(3, min(5, len(spec.dependency_pool)))
    citations = rng.sample(list(spec.dependency_pool), k=citation_count)

    root_edges: list[dict[str, Any]] = []
    for username in authors:
        node_id = "author:{}:{}".format(username, spec.slug)
        if node_id not in author_meta_cache:
            meta = _contributor_metadata(username, rng)
            author_meta_cache[node_id] = meta
            nodes.append(
                {
                    "id": node_id,
                    "type": "AUTHOR",
                    "label": username,
                    "metadata": {
                        "total_commits": meta["total_commits"],
                        "total_additions": meta["total_additions"],
                        "total_deletions": meta["total_deletions"],
                        "total_lines": meta["total_lines"],
                    },
                }
            )
        score = rng.uniform(1.0, 3.0)
        if username == spec.lead_user:
            score += rng.uniform(4.0, 6.0)
        root_edges.append(
            {
                "source": root_id,
                "target": node_id,
                "weight": score,
                "label": "",
                "metadata": {
                    "contributor_login": username,
                    "contributor_total_lines": author_meta_cache[node_id]["total_lines"],
                    "contributor_total_commits": author_meta_cache[node_id]["total_commits"],
                },
            }
        )

    for idx, title in enumerate(citations):
        cite_id = "cited:{}:{}".format(spec.slug, idx)
        nodes.append(
            {
                "id": cite_id,
                "type": "CITED_WORK",
                "label": title,
                "metadata": {
                    "title": title,
                    "purpose": "{} provides the main conceptual building block.".format(title),
                    "explicit_mentions": rng.randint(2, 11),
                    "conceptual_mentions": rng.randint(3, 17),
                    "arxiv_url": "https://arxiv.org/abs/{}".format(2000 + idx),
                },
            }
        )
        root_edges.append(
            {
                "source": root_id,
                "target": cite_id,
                "weight": rng.uniform(0.6, 1.6),
                "label": "",
                "metadata": {"citation_context": "Foundational prior work."},
            }
        )

        cited_authors = rng.sample(CONTRIBUTOR_POOL, k=2)
        child_weights = _normalized_weights(len(cited_authors), rng)
        for username, weight in zip(cited_authors, child_weights):
            node_id = "author:{}:{}:{}".format(username, spec.slug, idx)
            meta = _contributor_metadata(username, rng)
            nodes.append(
                {
                    "id": node_id,
                    "type": "AUTHOR",
                    "label": username,
                    "metadata": {
                        "total_commits": meta["total_commits"],
                        "total_additions": meta["total_additions"],
                        "total_deletions": meta["total_deletions"],
                        "total_lines": meta["total_lines"],
                    },
                }
            )
            edges.append(
                {
                    "source": cite_id,
                    "target": node_id,
                    "weight": weight,
                    "label": "",
                    "metadata": {
                        "contributor_login": username,
                        "contributor_total_lines": meta["total_lines"],
                        "contributor_total_commits": meta["total_commits"],
                    },
                }
            )

    edges.extend(root_edges)
    graph_data = {"nodes": nodes, "edges": edges}
    _rebalance_parent_edges(graph_data)
    return graph_data


def _build_synthetic_payload(spec: SyntheticSpec, rng: random.Random) -> dict[str, Any]:
    if spec.project_type == "paper":
        graph_data = _build_paper_graph(spec, rng)
    else:
        graph_data = _build_repo_or_package_graph(spec, rng)

    attribution = _compute_leaf_attribution(graph_data)
    top_contributors = _top_contributors(attribution)
    dependencies = _extract_dependencies(graph_data, spec.project_type, spec.name)

    if spec.project_type == "paper":
        raised = round(rng.uniform(45000, 180000), 2)
    elif spec.project_type == "repo":
        raised = round(rng.uniform(35000, 250000), 2)
    else:
        raised = round(rng.uniform(25000, 160000), 2)

    return {
        "slug": spec.slug,
        "name": spec.name,
        "category": spec.category,
        "type": spec.project_type,
        "summary": spec.summary,
        "description": spec.description,
        "source_url": spec.source_url,
        "raised": raised,
        "contributors": max(len(attribution), len(top_contributors), 4),
        "depth": spec.depth,
        "graph_data": graph_data,
        "attribution": attribution,
        "dependencies": dependencies,
        "top_contributors": top_contributors,
    }


def _trace_failure_payload(spec: TraceSpec, rng: random.Random, error: str) -> dict[str, Any]:
    """Build a fallback payload when a real trace fails."""
    if spec.trace_type == "repo":
        owner, repo = parse_repo_owner_and_name(spec.source)
        name = "{} ({})".format(repo, owner)
        source_url = spec.source
    elif spec.trace_type == "paper":
        paper_id = parse_arxiv_id(spec.source)
        name = "Paper {}".format(paper_id)
        source_url = "https://arxiv.org/abs/{}".format(paper_id)
    else:
        package_name = spec.source
        eco = spec.ecosystem or "npm"
        if eco == "pypi":
            source_url = "https://pypi.org/project/{}/".format(package_name)
        else:
            source_url = "https://www.npmjs.com/package/{}".format(package_name)
        name = "{} ({})".format(package_name, eco)

    synthetic = SyntheticSpec(
        name=name,
        slug="trace-fallback-{}-{}".format(spec.trace_type, _slugify(spec.source)[:24]),
        project_type=spec.trace_type,
        category=spec.category,
        summary="Fallback payload: trace attempt failed, synthetic graph injected.",
        description=(
            "Trace attempted with live services but fallback generation was used "
            "for demo continuity. Last trace error: {}.".format(error[:240])
        ),
        source_url=source_url,
        tech_stack=("Fallback", "Demo", "Seed Script"),
        dependency_pool=(
            "Synthetic Dependency A",
            "Synthetic Dependency B",
            "Synthetic Dependency C",
            "Synthetic Dependency D",
            "Synthetic Dependency E",
        ),
        lead_user=random.choice(CORE_CONTRIBUTORS),
        depth=spec.max_depth,
    )
    return _build_synthetic_payload(synthetic, rng)


async def _trace_one_project(spec: TraceSpec) -> dict[str, Any]:
    if spec.trace_type == "repo":
        graph, config, attribution = await build_contribution_graph(
            spec.source,
            max_depth=spec.max_depth,
            max_children=spec.max_children,
        )
        _, repo = parse_repo_owner_and_name(spec.source)
        name = repo
        source_url = spec.source
        graph_data = graph.model_dump()
        deps = _extract_dependencies(graph_data, "repo", name)
        top = _top_contributors(attribution)
        return {
            "name": name,
            "category": spec.category,
            "type": "repo",
            "summary": "Live traced contribution graph for {}.".format(name),
            "description": (
                "Generated from live tracing across contributors and dependencies for "
                "{}. This project is seeded from real external sources.".format(source_url)
            ),
            "source_url": source_url,
            "raised": 0.0,
            "contributors": max(len(attribution), 1),
            "depth": config.max_depth,
            "graph_data": graph_data,
            "attribution": attribution,
            "dependencies": deps,
            "top_contributors": top,
        }

    if spec.trace_type == "paper":
        arxiv_id = parse_arxiv_id(spec.source)
        graph, config, attribution, title = await build_citation_graph(
            arxiv_id,
            max_depth=spec.max_depth,
            max_citations=spec.max_citations,
        )
        name = title or arxiv_id
        source_url = "https://arxiv.org/abs/{}".format(arxiv_id)
        graph_data = graph.model_dump()
        deps = _extract_dependencies(graph_data, "paper", name)
        top = _top_contributors(attribution)
        return {
            "name": name,
            "category": spec.category,
            "type": "paper",
            "summary": "Live traced citation graph for {}.".format(name),
            "description": (
                "Generated from live citation tracing and author attribution for "
                "{}. This paper is seeded from real external sources.".format(source_url)
            ),
            "source_url": source_url,
            "raised": 0.0,
            "contributors": max(len(attribution), 1),
            "depth": config.max_depth,
            "graph_data": graph_data,
            "attribution": attribution,
            "dependencies": deps,
            "top_contributors": top,
        }

    if spec.trace_type == "package":
        ecosystem = (spec.ecosystem or "npm").lower()
        graph, config, attribution = await build_package_graph(
            spec.source,
            ecosystem,
            max_depth=spec.max_depth,
            max_children=spec.max_children,
        )
        if ecosystem == "pypi":
            source_url = "https://pypi.org/project/{}/".format(spec.source)
        else:
            source_url = "https://www.npmjs.com/package/{}".format(spec.source)
        name = spec.source
        graph_data = graph.model_dump()
        deps = _extract_dependencies(graph_data, "package", name)
        top = _top_contributors(attribution)
        return {
            "name": name,
            "category": spec.category,
            "type": "package",
            "summary": "Live traced package graph for {}.".format(name),
            "description": (
                "Generated from live registry + GitHub tracing for {}. "
                "This package is seeded from real external sources.".format(source_url)
            ),
            "source_url": source_url,
            "raised": 0.0,
            "contributors": max(len(attribution), 1),
            "depth": config.max_depth,
            "graph_data": graph_data,
            "attribution": attribution,
            "dependencies": deps,
            "top_contributors": top,
        }

    raise ValueError("Unknown trace type: {}".format(spec.trace_type))


def _raise_target_usd(project_type: str, rng: random.Random) -> float:
    if project_type == "repo":
        return round(rng.uniform(60000, 280000), 2)
    if project_type == "paper":
        return round(rng.uniform(50000, 220000), 2)
    return round(rng.uniform(35000, 180000), 2)


def _demo_payloads(rng: random.Random) -> list[dict[str, Any]]:
    return [_build_synthetic_payload(spec, rng) for spec in SYNTHETIC_SPECS]


async def _build_traced_payloads(
    rng: random.Random,
    *,
    skip_traces: bool,
    trace_timeout: float,
) -> tuple[list[dict[str, Any]], list[str]]:
    if skip_traces:
        return [], ["traces skipped by flag"]

    payloads: list[dict[str, Any]] = []
    errors: list[str] = []

    for spec in TRACE_SPECS:
        label = "{}:{}".format(spec.trace_type, spec.source)
        try:
            log.info("Tracing %s ...", label)
            traced = await asyncio.wait_for(_trace_one_project(spec), timeout=trace_timeout)
            traced["raised"] = _raise_target_usd(spec.trace_type, rng)
            payloads.append(traced)
            log.info(
                "Trace success for %s (%d nodes, %d edges)",
                label,
                len((traced.get("graph_data") or {}).get("nodes") or []),
                len((traced.get("graph_data") or {}).get("edges") or []),
            )
        except Exception as exc:
            err = "Trace failed for {} -> {}".format(label, str(exc))
            errors.append(err)
            log.warning(err)
            payloads.append(_trace_failure_payload(spec, rng, str(exc)))
    return payloads, errors


def _dedupe_payloads(payloads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate payloads by canonical key, preferring the latest one."""
    by_key: dict[str, dict[str, Any]] = {}
    for payload in payloads:
        key = _canonical_source_key(payload["source_url"], payload["type"])
        by_key[key] = payload
    return list(by_key.values())


async def _next_available_slug(session: AsyncSession, base_slug: str) -> str:
    base = _slugify(base_slug or "project") or "project"
    candidate = base
    suffix = 2
    while await session.scalar(select(Project.id).where(Project.slug == candidate)) is not None:
        candidate = "{}-{}".format(base, suffix)
        suffix += 1
    return candidate


async def _upsert_project(
    session: AsyncSession,
    payload: dict[str, Any],
    *,
    created_at: datetime,
    updated_at: datetime,
) -> Project:
    project_type = payload["type"]
    canonical_url = _canonical_source_url(payload["source_url"], project_type)
    canonical_key = _canonical_source_key(payload["source_url"], project_type)

    project = await session.scalar(select(Project).where(Project.canonical_key == canonical_key))
    if project is None:
        project = await session.scalar(
            select(Project).where(
                Project.type == project_type,
                Project.source_url == canonical_url,
            )
        )

    if project is None:
        slug_hint = payload.get("slug") or payload.get("name") or "project"
        slug = await _next_available_slug(session, slug_hint)
        project = Project(
            slug=slug,
            canonical_key=canonical_key,
            name=payload["name"],
            category=payload["category"],
            type=project_type,
            summary=payload["summary"],
            description=payload["description"],
            source_url=canonical_url,
            raised=float(payload["raised"]),
            contributors=int(payload["contributors"]),
            depth=int(payload["depth"]),
            graph_data=payload["graph_data"],
            attribution=payload["attribution"],
            dependencies=payload["dependencies"],
            top_contributors=payload["top_contributors"],
        )
        session.add(project)
    else:
        project.canonical_key = canonical_key
        project.name = payload["name"]
        project.category = payload["category"]
        project.type = project_type
        project.summary = payload["summary"]
        project.description = payload["description"]
        project.source_url = canonical_url
        project.raised = float(payload["raised"])
        project.contributors = int(payload["contributors"])
        project.depth = int(payload["depth"])
        project.graph_data = payload["graph_data"]
        project.attribution = payload["attribution"]
        project.dependencies = payload["dependencies"]
        project.top_contributors = payload["top_contributors"]

    project.created_at = created_at
    project.updated_at = updated_at

    await session.flush()
    return project


async def _seed_projects(
    session: AsyncSession,
    payloads: list[dict[str, Any]],
    rng: random.Random,
) -> list[Project]:
    now = datetime.now(timezone.utc)
    seeded: list[Project] = []
    for payload in payloads:
        created_at = now - timedelta(
            days=rng.randint(12, 320),
            hours=rng.randint(0, 23),
            minutes=rng.randint(0, 59),
        )
        updated_at = created_at + timedelta(
            days=rng.randint(0, 120),
            hours=rng.randint(0, 23),
        )
        if updated_at > now:
            updated_at = now - timedelta(hours=rng.randint(0, 12))
        project = await _upsert_project(
            session,
            payload,
            created_at=created_at,
            updated_at=updated_at,
        )
        seeded.append(project)
    return seeded


def _split_amount(total: float, count: int, rng: random.Random, *, min_amount: float = 0.05) -> list[float]:
    if count <= 0:
        return []
    if total <= (min_amount * count):
        equal = round(total / count, 4)
        return [equal for _ in range(count)]

    raw = [rng.gammavariate(2.0, 1.0) for _ in range(count)]
    total_raw = sum(raw) or 1.0
    budget = total - (min_amount * count)
    chunks = [min_amount + (budget * (val / total_raw)) for val in raw]
    rounded = [round(val, 4) for val in chunks]
    diff = round(total - sum(rounded), 4)
    rounded[-1] = round(max(min_amount, rounded[-1] + diff), 4)
    return rounded


async def _seed_donations(
    session: AsyncSession,
    projects: list[Project],
    rng: random.Random,
    donor_wallets: dict[str, str],
    seed: int,
) -> tuple[int, dict[str, dict[str, Any]]]:
    await session.execute(
        delete(Donation).where(Donation.tx_hash.like("{}%".format(DEMO_TX_PREFIX)))
    )

    donor_names = list(donor_wallets.keys())
    core_donors = donor_names[:5]
    stats: dict[str, dict[str, Any]] = {
        username: {"projects": set(), "total_eth": 0.0}
        for username in donor_names
    }

    now = datetime.now(timezone.utc)
    inserted = 0
    for project in projects:
        target_usd = max(float(project.raised), 10000.0)
        onchain_fraction = rng.uniform(0.2, 0.45)
        target_eth = max((target_usd / ETH_TO_USD) * onchain_fraction, rng.uniform(8.0, 26.0))

        if target_usd >= 150000:
            donation_count = rng.randint(12, 22)
        elif target_usd >= 70000:
            donation_count = rng.randint(8, 16)
        else:
            donation_count = rng.randint(6, 12)

        amounts = _split_amount(target_eth, donation_count, rng, min_amount=0.08)
        participant_count = min(len(donor_names), rng.randint(4, 9))
        participants = set(rng.sample(donor_names, k=participant_count))
        participants.update(rng.sample(core_donors, k=min(2, len(core_donors))))
        participant_list = list(participants)

        created_span = max((now - project.created_at).days, 7)
        total_seeded_eth = 0.0
        for idx, amount_eth in enumerate(amounts):
            donor = rng.choice(participant_list)
            total_seeded_eth += amount_eth
            created_at = project.created_at + timedelta(
                days=rng.randint(0, created_span),
                hours=rng.randint(0, 23),
                minutes=rng.randint(0, 59),
            )
            if created_at > now:
                created_at = now - timedelta(hours=rng.randint(0, 48))
            session.add(
                Donation(
                    project_id=project.slug,
                    donator_address=donor_wallets[donor],
                    amount_eth=round(amount_eth, 4),
                    tx_hash=_demo_tx_hash(project.slug, idx, seed),
                    created_at=created_at,
                )
            )
            stats[donor]["projects"].add(project.slug)
            stats[donor]["total_eth"] += amount_eth
            inserted += 1

        multiplier = rng.uniform(1.8, 4.8)
        project.raised = round(
            max(project.raised, total_seeded_eth * ETH_TO_USD * multiplier), 2
        )

    return inserted, stats


async def _seed_vaults(session: AsyncSession, projects: list[Project]) -> int:
    upserted = 0
    for project in projects:
        await session.execute(
            text(
                """
                INSERT INTO project_vaults (project_id, wallet_id, address)
                VALUES (:project_id, :wallet_id, :address)
                ON CONFLICT (project_id) DO UPDATE
                SET wallet_id = EXCLUDED.wallet_id,
                    address = EXCLUDED.address
                """
            ),
            {
                "project_id": project.slug,
                "wallet_id": "demo_wallet_{}".format(project.slug),
                "address": _make_eth_address("vault:{}".format(project.slug), DEMO_VAULT_PREFIX),
            },
        )
        upserted += 1
    return upserted


def _question_type_for_edge(source_type: str, target_type: str) -> str:
    if target_type in {"CONTRIBUTOR", "AUTHOR"}:
        return "contributor"
    if source_type in {"PAPER", "CITED_WORK"} and target_type == "CITED_WORK":
        return "citation"
    if target_type in {"BODY_OF_WORK", "CITED_WORK"}:
        return "dependency"
    return "edge"


async def _seed_edge_votes(
    session: AsyncSession,
    projects: list[Project],
    rng: random.Random,
    juror_wallets: dict[str, str],
) -> tuple[int, dict[str, int]]:
    await session.execute(
        delete(EdgeVote).where(EdgeVote.wallet_address.like("0x{}%".format(DEMO_JUROR_PREFIX)))
    )

    jurors = list(juror_wallets.keys())
    vote_counts: dict[str, int] = defaultdict(int)
    now = datetime.now(timezone.utc)
    inserted = 0

    for project in projects:
        graph_data = project.graph_data or {}
        edges = graph_data.get("edges") or []
        nodes = graph_data.get("nodes") or []
        node_by_id = {str(node.get("id", "")): node for node in nodes if node.get("id")}

        candidates = []
        for edge in edges:
            source = str(edge.get("source", ""))
            target = str(edge.get("target", ""))
            weight = _safe_float(edge.get("weight"), 0.0)
            if not source or not target or weight < 0.05:
                continue
            source_type = str((node_by_id.get(source) or {}).get("type", ""))
            target_type = str((node_by_id.get(target) or {}).get("type", ""))
            q_type = _question_type_for_edge(source_type, target_type)
            if not q_type:
                continue
            candidates.append((edge, q_type))

        if not candidates:
            continue

        sample_count = min(len(candidates), rng.randint(4, 10))
        sampled = rng.sample(candidates, k=sample_count)
        for edge, q_type in sampled:
            source = str(edge.get("source"))
            target = str(edge.get("target"))
            ai_weight = _clamp01(_safe_float(edge.get("weight"), 0.0))
            voter_count = min(len(jurors), rng.randint(2, 5))
            voters = rng.sample(jurors, k=voter_count)
            for juror in voters:
                human = _clamp01(ai_weight + rng.uniform(-0.2, 0.24))
                confidence = round(rng.uniform(0.45, 1.0), 2)
                created_at = now - timedelta(
                    days=rng.randint(0, 45),
                    hours=rng.randint(0, 23),
                    minutes=rng.randint(0, 59),
                )
                session.add(
                    EdgeVote(
                        project_id=project.id,
                        wallet_address=juror_wallets[juror],
                        edge_source=source,
                        edge_target=target,
                        ai_weight=round(ai_weight, 4),
                        human_weight=round(human, 4),
                        confidence=confidence,
                        question_type=q_type,
                        created_at=created_at,
                    )
                )
                vote_counts[juror] += 1
                inserted += 1

    return inserted, vote_counts


async def _upsert_jury_priors_from_votes(
    session: AsyncSession,
    projects: list[Project],
) -> int:
    vote_rows = (
        await session.execute(
            select(EdgeVote).where(EdgeVote.wallet_address.like("0x{}%".format(DEMO_JUROR_PREFIX)))
        )
    ).scalars().all()

    if not vote_rows:
        return 0

    project_by_id = {project.id: project for project in projects}
    grouped: dict[tuple[str, str], list[EdgeVote]] = defaultdict(list)

    for vote in vote_rows:
        project = project_by_id.get(vote.project_id)
        if project is None:
            continue
        node_by_id = {
            str(node.get("id", "")): node
            for node in (project.graph_data or {}).get("nodes", [])
            if node.get("id")
        }
        source_node = node_by_id.get(vote.edge_source, {})
        target_node = node_by_id.get(vote.edge_target, {})
        entity_name = str(target_node.get("label", "")).strip()
        if not entity_name:
            continue

        source_type = str(source_node.get("type", ""))
        target_type = str(target_node.get("type", ""))
        entity_type = _question_type_for_edge(source_type, target_type)
        if entity_type == "edge":
            entity_type = "dependency"
        grouped[(entity_name, entity_type)].append(vote)

    if not grouped:
        return 0

    now = datetime.now(timezone.utc)
    rows = []
    for (entity_name, entity_type), votes in grouped.items():
        avg_human = sum(float(v.human_weight) for v in votes) / len(votes)
        avg_ai = sum(float(v.ai_weight) for v in votes) / len(votes)
        correction = avg_human / max(avg_ai, 0.01)
        rows.append(
            {
                "entity_name": entity_name,
                "entity_type": entity_type,
                "avg_human_weight": round(avg_human, 6),
                "avg_ai_weight": round(avg_ai, 6),
                "avg_correction": round(correction, 6),
                "vote_count": len(votes),
                "updated_at": now,
            }
        )

    insert_stmt = pg_insert(JuryPrior).values(rows)
    upsert_stmt = insert_stmt.on_conflict_do_update(
        index_elements=[JuryPrior.entity_name, JuryPrior.entity_type],
        set_={
            "avg_human_weight": insert_stmt.excluded.avg_human_weight,
            "avg_ai_weight": insert_stmt.excluded.avg_ai_weight,
            "avg_correction": insert_stmt.excluded.avg_correction,
            "vote_count": insert_stmt.excluded.vote_count,
            "updated_at": insert_stmt.excluded.updated_at,
        },
    )
    await session.execute(upsert_stmt)
    return len(rows)


async def _ensure_feedback_table(session: AsyncSession) -> None:
    await session.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS community_feedback (
                id SERIAL PRIMARY KEY,
                project_id TEXT NOT NULL,
                feedback TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )


async def _seed_feedback(
    session: AsyncSession,
    projects: list[Project],
    rng: random.Random,
) -> tuple[int, dict[str, int]]:
    await _ensure_feedback_table(session)
    await session.execute(
        text("DELETE FROM community_feedback WHERE feedback LIKE '[DEMO] %'")
    )

    feedback_templates = [
        "Clear milestone framing and measurable delivery cadence.",
        "Strong technical direction; dependency risk appears manageable.",
        "Great contributor diversity and transparent review culture.",
        "Roadmap looks credible with practical checkpoints this quarter.",
        "Would love additional docs around integration and migration.",
        "Impressive velocity with consistent quality safeguards in place.",
    ]
    author_counts: dict[str, int] = defaultdict(int)
    inserted = 0
    now = datetime.now(timezone.utc)

    for project in projects:
        count = rng.randint(2, 6)
        authors = rng.sample(CONTRIBUTOR_POOL, k=min(count, len(CONTRIBUTOR_POOL)))
        for idx in range(count):
            author = authors[idx % len(authors)]
            created_at = now - timedelta(
                days=rng.randint(0, 60),
                hours=rng.randint(0, 23),
                minutes=rng.randint(0, 59),
            )
            feedback = "[DEMO] {}: {}".format(
                author,
                rng.choice(feedback_templates),
            )
            await session.execute(
                text(
                    """
                    INSERT INTO community_feedback (project_id, feedback, created_at)
                    VALUES (:project_id, :feedback, :created_at)
                    """
                ),
                {
                    "project_id": project.slug,
                    "feedback": feedback,
                    "created_at": created_at,
                },
            )
            author_counts[author] += 1
            inserted += 1

    return inserted, author_counts


def _parse_pct(value: str) -> float:
    try:
        return float(value.replace("%", "").strip())
    except Exception:
        return 0.0


async def _seed_badges(
    session: AsyncSession,
    projects: list[Project],
    donation_stats: dict[str, dict[str, Any]],
    juror_vote_counts: dict[str, int],
    feedback_counts: dict[str, int],
) -> int:
    contribution_stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"projects": set(), "max_pct": 0.0}
    )

    for project in projects:
        for row in project.top_contributors or []:
            username = str(row.get("name", "")).strip()
            if not username:
                continue
            pct = _parse_pct(str(row.get("percentage", "0")))
            contribution_stats[username]["projects"].add(project.slug)
            contribution_stats[username]["max_pct"] = max(
                contribution_stats[username]["max_pct"],
                pct,
            )

    rows: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc)

    def add_badge(username: str, badge_key: str, category: str) -> None:
        rows.append(
            {
                "username": username,
                "badge_key": badge_key,
                "category": category,
                "earned_at": now,
            }
        )

    all_users = set(contribution_stats.keys()) | set(donation_stats.keys()) | set(juror_vote_counts.keys()) | set(feedback_counts.keys())
    for username in sorted(all_users):
        project_count = len(contribution_stats.get(username, {}).get("projects", set()))
        max_pct = float(contribution_stats.get(username, {}).get("max_pct", 0.0))

        if project_count >= 1:
            add_badge(username, "seedling", "contributor")
        if project_count >= 3:
            add_badge(username, "pollinator", "contributor")
        if project_count >= 5:
            add_badge(username, "hive_architect", "contributor")
        if max_pct > 30:
            add_badge(username, "queen_bee", "contributor")

        donor_projects = len(donation_stats.get(username, {}).get("projects", set()))
        donor_total = float(donation_stats.get(username, {}).get("total_eth", 0.0))
        if donor_projects >= 1:
            add_badge(username, "first_nectar", "philanthropist")
        if donor_projects >= 3:
            add_badge(username, "honey_pot", "philanthropist")
        if donor_total >= 1.0:
            add_badge(username, "golden_flow", "philanthropist")
        if donor_total >= 10.0:
            add_badge(username, "benefactor", "philanthropist")

        juror_votes = int(juror_vote_counts.get(username, 0))
        if juror_votes >= 1:
            add_badge(username, "first_verdict", "juror")
        if juror_votes >= 10:
            add_badge(username, "wise_bee", "juror")
        if juror_votes >= 50:
            add_badge(username, "oracle", "juror")

        feedback_total = int(feedback_counts.get(username, 0))
        if feedback_total >= 1:
            add_badge(username, "voice", "community")
        if feedback_total >= 5:
            add_badge(username, "megaphone", "community")
        if feedback_total >= 20:
            add_badge(username, "beacon", "community")

    if not rows:
        return 0

    insert_stmt = pg_insert(Badge).values(rows)
    upsert_stmt = insert_stmt.on_conflict_do_update(
        index_elements=[Badge.username, Badge.badge_key],
        set_={
            "category": insert_stmt.excluded.category,
            "earned_at": insert_stmt.excluded.earned_at,
        },
    )
    await session.execute(upsert_stmt)
    return len(rows)


async def _seed_demo_data(
    *,
    seed: int,
    skip_traces: bool,
    trace_timeout: float,
) -> dict[str, Any]:
    rng = random.Random(seed)

    await init_vault_db()
    await init_donations_db()

    traced_payloads, trace_errors = await _build_traced_payloads(
        rng,
        skip_traces=skip_traces,
        trace_timeout=trace_timeout,
    )
    synthetic_payloads = _demo_payloads(rng)
    all_payloads = _dedupe_payloads(traced_payloads + synthetic_payloads)

    donor_wallets = {
        username: _make_eth_address("donor:{}".format(username), "d0")
        for username in CONTRIBUTOR_POOL[:20]
    }
    juror_wallets = {
        username: _make_eth_address("juror:{}".format(username), DEMO_JUROR_PREFIX)
        for username in JUROR_USERNAMES
    }

    async with session_scope() as session:
        projects = await _seed_projects(session, all_payloads, rng)

        donation_count, donation_stats = await _seed_donations(
            session, projects, rng, donor_wallets, seed
        )
        vault_count = await _seed_vaults(session, projects)
        vote_count, juror_vote_counts = await _seed_edge_votes(
            session, projects, rng, juror_wallets
        )
        priors_count = await _upsert_jury_priors_from_votes(session, projects)
        feedback_count, feedback_stats = await _seed_feedback(session, projects, rng)
        badge_count = await _seed_badges(
            session,
            projects,
            donation_stats,
            juror_vote_counts,
            feedback_stats,
        )

        project_ids = [project.id for project in projects]
        project_count = len(project_ids)

    return {
        "seed": seed,
        "project_count": project_count,
        "traced_count": len(traced_payloads),
        "synthetic_count": len(synthetic_payloads),
        "deduped_payload_count": len(all_payloads),
        "trace_errors": trace_errors,
        "donation_count": donation_count,
        "vault_count": vault_count,
        "vote_count": vote_count,
        "priors_count": priors_count,
        "feedback_count": feedback_count,
        "badge_count": badge_count,
    }


async def _print_post_seed_snapshot() -> None:
    async with session_scope() as session:
        project_total = await session.scalar(select(text("COUNT(*)")).select_from(Project.__table__))
        donation_total = await session.scalar(
            select(text("COUNT(*)")).select_from(Donation.__table__)
        )
        vote_total = await session.scalar(select(text("COUNT(*)")).select_from(EdgeVote.__table__))
        badge_total = await session.scalar(select(text("COUNT(*)")).select_from(Badge.__table__))
        prior_total = await session.scalar(select(text("COUNT(*)")).select_from(JuryPrior.__table__))
        sample_projects = (
            (
                await session.execute(
                    select(Project.slug, Project.name, Project.raised)
                    .order_by(Project.raised.desc())
                    .limit(5)
                )
            )
            .all()
        )

    print("\n=== Post-seed snapshot ===")
    print("Projects:      {}".format(project_total))
    print("Donations:     {}".format(donation_total))
    print("Edge votes:    {}".format(vote_total))
    print("Badges:        {}".format(badge_total))
    print("Jury priors:   {}".format(prior_total))
    print("Top raised projects:")
    for slug, name, raised in sample_projects:
        print("  - {:<34} ${:,.0f}  ({})".format(slug, float(raised or 0), name))


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed robust demo data for HoneyFlow.")
    parser.add_argument(
        "--seed",
        type=int,
        default=20260221,
        help="Random seed for deterministic demo data.",
    )
    parser.add_argument(
        "--skip-traces",
        action="store_true",
        help="Skip real tracing calls and only use synthetic projects.",
    )
    parser.add_argument(
        "--trace-timeout",
        type=float,
        default=240.0,
        help="Timeout (seconds) per trace call before fallback.",
    )
    return parser.parse_args()


async def _main_async() -> None:
    args = _parse_args()
    summary = await _seed_demo_data(
        seed=args.seed,
        skip_traces=args.skip_traces,
        trace_timeout=args.trace_timeout,
    )

    print("\n=== Demo seed complete ===")
    print("Seed:                {}".format(summary["seed"]))
    print("Projects seeded:     {}".format(summary["project_count"]))
    print("Traced payloads:     {}".format(summary["traced_count"]))
    print("Synthetic payloads:  {}".format(summary["synthetic_count"]))
    print("Payloads (deduped):  {}".format(summary["deduped_payload_count"]))
    print("Donations inserted:  {}".format(summary["donation_count"]))
    print("Vaults upserted:     {}".format(summary["vault_count"]))
    print("Jury votes inserted: {}".format(summary["vote_count"]))
    print("Jury priors upserted:{}".format(summary["priors_count"]))
    print("Feedback inserted:   {}".format(summary["feedback_count"]))
    print("Badges upserted:     {}".format(summary["badge_count"]))

    trace_errors = summary.get("trace_errors") or []
    if trace_errors:
        print("\nTrace warnings:")
        for item in trace_errors:
            print("  - {}".format(item))

    await _print_post_seed_snapshot()


def main() -> None:
    _configure_logging()
    asyncio.run(_main_async())


if __name__ == "__main__":
    main()
