"""Gemini LLM integration for semantic analysis.

Uses the Gemini REST API directly via httpx. Falls back to heuristic
values when no API key is configured.
"""

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(60.0, connect=10.0)
_MAX_RETRIES = 3
_BACKOFF_BASE = 2.0


async def _call_gemini(prompt: str, label: str = "gemini") -> Optional[str]:
    """Send a prompt to Gemini and return the text response."""
    if not settings.gemini_api_key:
        logger.info("[LLM]  No Gemini API key configured, skipping %s", label)
        return None

    url = "{}/models/{}:generateContent".format(
        settings.gemini_api_base, settings.gemini_model
    )
    params = {"key": settings.gemini_api_key}
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.1,
        },
    }

    logger.info("[LLM]  Calling Gemini (%s) model=%s ...", label, settings.gemini_model)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(url, params=params, json=body)

            retries = 0
            while resp.status_code == 429 and retries < _MAX_RETRIES:
                wait = _BACKOFF_BASE * (2 ** retries)
                logger.info("[LLM]  Rate limited (429), retrying %s in %.0fs (%d/%d)",
                            label, wait, retries + 1, _MAX_RETRIES)
                await asyncio.sleep(wait)
                resp = await client.post(url, params=params, json=body)
                retries += 1

            resp.raise_for_status()

        data = resp.json()
        candidates = data.get("candidates", [])
        if not candidates:
            logger.warning("[LLM]  Gemini returned no candidates for %s", label)
            return None
        parts = candidates[0].get("content", {}).get("parts", [])
        text = parts[0].get("text", "") if parts else None
        logger.info("[LLM]  Gemini %s response: %d chars", label, len(text or ""))
        return text
    except Exception as exc:
        logger.warning("[LLM]  Gemini API call failed (%s): %s", label, exc)
        return None


def _parse_json_response(raw: Optional[str]) -> Optional[Any]:
    """Safely parse a JSON response from the LLM."""
    if not raw:
        return None
    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            logger.warning("Failed to parse LLM JSON: %.200s", raw)
            return None


def _extract_float(d: Dict, keys: tuple) -> Optional[float]:
    """Try multiple key names to extract a float from a dict."""
    for k in keys:
        val = d.get(k)
        if isinstance(val, (int, float)):
            return float(val)
        if isinstance(val, str):
            try:
                return float(val)
            except ValueError:
                continue
    return None


# ------------------------------------------------------------------
# Repo analysis
# ------------------------------------------------------------------

async def analyze_repo(
    readme: str,
    metadata: Dict[str, Any],
    file_tree: str,
) -> Dict[str, Any]:
    """Ask Gemini to classify the repo's purpose and tech stack."""
    prompt = """You are analyzing a GitHub repository.

Description: {description}
Languages: {languages}

README (first 4000 chars):
{readme}

File structure:
{file_tree}

Respond with ONLY a JSON object:
{{
  "purpose": "one-sentence description of what this project does",
  "tech_stack": ["key", "technologies"],
  "project_type": "library|application|framework|tool|other"
}}""".format(
        description=metadata.get("description", ""),
        languages=json.dumps(metadata.get("languages", {})),
        readme=readme or "(no README)",
        file_tree=file_tree[:3000],
    )

    result = _parse_json_response(await _call_gemini(prompt, label="analyze_repo"))
    if isinstance(result, dict) and "purpose" in result:
        logger.info("[LLM]  Repo analysis: purpose=%s, type=%s",
                    result.get("purpose", "")[:80], result.get("project_type"))
        return result

    logger.info("[LLM]  Using heuristic repo analysis (no LLM response)")
    return {
        "purpose": metadata.get("description", "Unknown project"),
        "tech_stack": list((metadata.get("languages") or {}).keys())[:5],
        "project_type": "application",
    }


# ------------------------------------------------------------------
# Direct-vs-dependencies split
# ------------------------------------------------------------------

async def split_direct_vs_deps(
    repo_analysis: Dict[str, Any],
    dep_count: int,
    source_file_count: int,
) -> Tuple[float, float]:
    """Ask Gemini what fraction of value comes from custom code vs deps."""
    prompt = """You are evaluating how much of a software project's value comes from its original code versus its dependencies.

Project purpose: {purpose}
Project type: {project_type}
Tech stack: {tech_stack}
Number of source files: {source_files}
Number of dependencies: {dep_count}

What fraction of this project's value comes from its original custom code vs its dependencies?

Respond with ONLY a JSON object:
{{"direct_fraction": 0.XX, "deps_fraction": 0.XX}}
The two values MUST sum to exactly 1.0.""".format(
        purpose=repo_analysis.get("purpose", "Unknown"),
        project_type=repo_analysis.get("project_type", "application"),
        tech_stack=json.dumps(repo_analysis.get("tech_stack", [])),
        source_files=source_file_count,
        dep_count=dep_count,
    )

    raw_text = await _call_gemini(prompt, label="direct_vs_deps")
    result = _parse_json_response(raw_text)
    if isinstance(result, dict):
        logger.info("[LLM]  direct_vs_deps parsed: %s", result)
        direct = _extract_float(result, ("direct_fraction", "direct", "custom_code", "original_code"))
        deps = _extract_float(result, ("deps_fraction", "deps", "dependencies", "dependency_fraction"))
        if direct is not None and deps is not None:
            total = direct + deps
            if total > 0:
                d, p = (direct / total, deps / total)
                logger.info("[LLM]  Split -> direct=%.1f%% deps=%.1f%%", d * 100, p * 100)
                return (d, p)
        logger.warning("[LLM]  Could not extract fractions from: %s", result)
    else:
        logger.warning("[LLM]  direct_vs_deps response not valid JSON: %.200s", raw_text)

    if dep_count == 0:
        logger.info("[LLM]  No deps -> direct=100%%")
        return (1.0, 0.0)
    logger.info("[LLM]  Using heuristic split -> direct=60%% deps=40%%")
    return (0.6, 0.4)


# ------------------------------------------------------------------
# Dependency importance ranking
# ------------------------------------------------------------------

async def rank_dependency_importance(
    repo_analysis: Dict[str, Any],
    dep_names: List[str],
    usage_freq: Dict[str, int],
) -> Dict[str, float]:
    """Ask Gemini to rate each dependency's importance, then blend with usage frequency.

    Returns a dict of dep_name -> blended importance score (0..1).
    """
    if not dep_names:
        return {}

    dep_summary = []
    for name in dep_names[:40]:
        freq = usage_freq.get(name, 0)
        dep_summary.append("  {}: imported in {} files".format(name, freq))

    prompt = """You are ranking dependencies by how critical they are to a project's core functionality.

Project purpose: {purpose}
Tech stack: {tech_stack}
Project type: {project_type}

Dependencies and their import frequency:
{dep_list}

Rate each dependency from 0.0 to 1.0 on how critical it is to the project's core functionality.
Dev tools, linters, test frameworks, and type stubs should score LOW (0.05 to 0.2).
Core runtime dependencies that the project fundamentally relies on should score HIGH (0.6 to 1.0).

Respond with ONLY a JSON object mapping each dependency name to its score:
{{"dep_name": 0.X, ...}}""".format(
        purpose=repo_analysis.get("purpose", "Unknown"),
        tech_stack=json.dumps(repo_analysis.get("tech_stack", [])),
        project_type=repo_analysis.get("project_type", "application"),
        dep_list="\n".join(dep_summary),
    )

    llm_scores = _parse_json_response(await _call_gemini(prompt, label="dep_ranking"))
    if not isinstance(llm_scores, dict):
        logger.info("[LLM]  No LLM dep scores, using usage frequency only")
        llm_scores = {}
    else:
        logger.info("[LLM]  Got LLM dep scores for %d/%d deps", len(llm_scores), len(dep_names))

    max_freq = max(usage_freq.values()) if usage_freq else 1
    w_usage = settings.graph.usage_freq_weight
    w_llm = settings.graph.llm_importance_weight
    blended: Dict[str, float] = {}

    for name in dep_names:
        norm_usage = (usage_freq.get(name, 0) / max_freq) if max_freq > 0 else 0.0
        llm_score = llm_scores.get(name, 0.3)
        if not isinstance(llm_score, (int, float)):
            llm_score = 0.3
        llm_score = max(0.0, min(1.0, float(llm_score)))
        blended[name] = (w_usage * norm_usage) + (w_llm * llm_score)

    return blended


# ------------------------------------------------------------------
# Gemini with Google Search grounding (for citation influence)
# ------------------------------------------------------------------

async def _call_gemini_with_search(prompt: str, label: str = "gemini_search") -> Optional[str]:
    """Send a prompt to Gemini with Google Search grounding enabled.

    Web search grounding is incompatible with response_mime_type: application/json,
    so we rely on the prompt asking for JSON and parse it from the markdown response.
    """
    if not settings.gemini_api_key:
        logger.info("[LLM]  No Gemini API key configured, skipping %s", label)
        return None

    url = "{}/models/{}:generateContent".format(
        settings.gemini_api_base, settings.gemini_model
    )
    params = {"key": settings.gemini_api_key}
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0.1},
    }

    logger.info("[LLM]  Calling Gemini+Search (%s) model=%s ...", label, settings.gemini_model)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(url, params=params, json=body)

            retries = 0
            while resp.status_code == 429 and retries < _MAX_RETRIES:
                wait = _BACKOFF_BASE * (2 ** retries)
                logger.info("[LLM]  Rate limited (429), retrying %s in %.0fs (%d/%d)",
                            label, wait, retries + 1, _MAX_RETRIES)
                await asyncio.sleep(wait)
                resp = await client.post(url, params=params, json=body)
                retries += 1

            resp.raise_for_status()

        data = resp.json()
        candidates = data.get("candidates", [])
        if not candidates:
            logger.warning("[LLM]  Gemini+Search returned no candidates for %s", label)
            return None
        parts = candidates[0].get("content", {}).get("parts", [])
        text = parts[0].get("text", "") if parts else None
        logger.info("[LLM]  Gemini+Search %s response: %d chars", label, len(text or ""))
        return text
    except Exception as exc:
        logger.warning("[LLM]  Gemini+Search API call failed (%s): %s", label, exc)
        return None


# ------------------------------------------------------------------
# Citation influence ranking
# ------------------------------------------------------------------

async def rank_citation_influence(
    paper_title: str,
    paper_abstract: str,
    categories: List[str],
    citations: List[Dict[str, Any]],
) -> Dict[str, float]:
    """Ask Gemini (with web search) to rank citations by intellectual influence.

    Each citation dict should have: key, title, authors, year, frequency, contexts.
    Returns {cite_key: influence_score (0..1)}.
    """
    if not citations:
        return {}

    citation_summaries = []
    for c in citations[:30]:
        ctx_text = ""
        if c.get("contexts"):
            snippets = c["contexts"][:2]
            ctx_text = " Contexts: " + " | ".join(
                '"{}"'.format(s[:150]) for s in snippets
            )
        usage_text = ""
        if c.get("explicit_count", 0) or c.get("conceptual_count", 0):
            usage_text = " Explicit mentions: {exp}. Conceptual mentions: {con}.".format(
                exp=c.get("explicit_count", 0),
                con=c.get("conceptual_count", 0),
            )
        authors_str = ", ".join(c.get("authors", [])[:3]) or "unknown"
        citation_summaries.append(
            "- [{key}] \"{title}\" by {authors} ({year}). "
            "Cited {freq} times.{usage}{ctx}".format(
                key=c.get("key", "?"),
                title=c.get("title", "untitled")[:100],
                authors=authors_str,
                year=c.get("year", "?"),
                freq=c.get("frequency", 0),
                usage=usage_text,
                ctx=ctx_text,
            )
        )

    prompt = """You are analyzing a research paper's citations to determine its intellectual lineage.
Your goal is to identify which cited works this paper most fundamentally BUILDS UPON or EXTENDS —
not just which papers are mentioned most often.

A paper cited once as "We extend the architecture of [X]" is MORE influential than
a utility paper cited 20 times as "we use the optimizer from [Y]".

Use explicit and conceptual mention counts as evidence, but treat them as
supporting signals rather than ground truth.

Use Google Search to look up papers you are uncertain about to understand their real
significance and relationship to this paper.

Paper being analyzed:
  Title: {title}
  Abstract: {abstract}
  Categories: {categories}

Citations:
{citation_list}

Rate each citation from 0.0 to 1.0 on how foundational it is to this paper's CORE CONTRIBUTION.

Scoring guide:
  0.8-1.0: Foundational work this paper directly extends or builds upon
  0.5-0.7: Significant methodological or theoretical influence
  0.2-0.4: Useful comparison, baseline, or supporting technique
  0.0-0.1: Incidental mention, dataset source, or general reference

Respond with ONLY a JSON object:
{{"cite_key": score, ...}}""".format(
        title=paper_title,
        abstract=paper_abstract[:1500],
        categories=", ".join(categories[:5]),
        citation_list="\n".join(citation_summaries),
    )

    raw = await _call_gemini_with_search(prompt, label="citation_influence")
    result = _parse_json_response(raw)

    if isinstance(result, dict):
        logger.info("[LLM]  Got influence scores for %d/%d citations",
                    len(result), len(citations))
        scores: Dict[str, float] = {}
        for c in citations:
            key = c.get("key", "")
            score = result.get(key, 0.2)
            if not isinstance(score, (int, float)):
                score = 0.2
            scores[key] = max(0.0, min(1.0, float(score)))
        return scores

    logger.info("[LLM]  No LLM influence scores, falling back to frequency-based ranking")
    max_freq = max((c.get("frequency", 1) for c in citations), default=1) or 1
    return {
        c.get("key", ""): c.get("frequency", 0) / max_freq
        for c in citations
    }


async def analyze_paper(
    title: str,
    abstract: str,
    categories: List[str],
) -> Dict[str, Any]:
    """Ask Gemini to classify a paper's contribution and research area."""
    prompt = """You are analyzing a research paper.

Title: {title}
Abstract: {abstract}
Categories: {categories}

Respond with ONLY a JSON object:
{{
  "contribution": "one-sentence description of the paper's main contribution",
  "research_area": "broad research area (e.g. 'machine learning', 'cryptography')",
  "paper_type": "theoretical|empirical|survey|system|benchmark|other"
}}""".format(
        title=title,
        abstract=abstract[:2000],
        categories=", ".join(categories[:5]),
    )

    result = _parse_json_response(await _call_gemini(prompt, label="analyze_paper"))
    if isinstance(result, dict) and "contribution" in result:
        logger.info("[LLM]  Paper analysis: %s", result.get("contribution", "")[:80])
        return result

    return {
        "contribution": abstract[:200] if abstract else "Unknown",
        "research_area": categories[0] if categories else "unknown",
        "paper_type": "other",
    }
