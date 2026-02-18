"""Parse citations from LaTeX source files and BibTeX bibliographies.

Extracts:
  - BibTeX entries from .bib files (title, authors, year, key)
  - \\cite{} frequencies and surrounding context from .tex files
"""

import os
import re
from typing import Any, Dict, List, Optional, Set, Tuple

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


class Citation:
    __slots__ = ("key", "title", "authors", "year", "frequency", "contexts")

    def __init__(
        self,
        key: str,
        title: str = "",
        authors: Optional[List[str]] = None,
        year: Optional[str] = None,
        frequency: int = 0,
        contexts: Optional[List[str]] = None,
    ):
        self.key = key
        self.title = title
        self.authors = authors or []
        self.year = year
        self.frequency = frequency
        self.contexts = contexts or []

    def __repr__(self) -> str:
        return "Citation({}, freq={}, title='{}')".format(
            self.key, self.frequency, self.title[:40]
        )


# ---------------------------------------------------------------------------
# BibTeX parsing
# ---------------------------------------------------------------------------

_BIB_ENTRY_RE = re.compile(
    r"@\w+\s*\{\s*([^,\s]+)\s*,", re.MULTILINE
)

_BIB_FIELD_RE = re.compile(
    r"^\s*(\w+)\s*=\s*[{\"](.+?)[}\"]", re.MULTILINE
)


def _parse_bib_entry(raw_block: str) -> Dict[str, str]:
    """Parse fields from a single BibTeX entry block."""
    fields: Dict[str, str] = {}
    for m in _BIB_FIELD_RE.finditer(raw_block):
        key = m.group(1).lower()
        val = m.group(2).strip().strip("{}")
        fields[key] = val
    return fields


def parse_bib_file(path: str) -> Dict[str, Dict[str, str]]:
    """Parse a .bib file and return a dict of cite_key -> {title, author, year, ...}."""
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    entries: Dict[str, Dict[str, str]] = {}

    starts = list(_BIB_ENTRY_RE.finditer(content))
    for i, m in enumerate(starts):
        cite_key = m.group(1)
        start = m.start()
        end = starts[i + 1].start() if i + 1 < len(starts) else len(content)
        block = content[start:end]
        fields = _parse_bib_entry(block)
        fields["_key"] = cite_key
        entries[cite_key] = fields

    return entries


# ---------------------------------------------------------------------------
# LaTeX \cite{} parsing
# ---------------------------------------------------------------------------

_CITE_RE = re.compile(
    r"\\(?:cite|citep|citet|citeauthor|citeyear|parencite|textcite|autocite|nocite)"
    r"(?:\[.*?\])*\{([^}]+)\}",
    re.MULTILINE,
)

_CONTEXT_WINDOW = 300


def parse_latex_citations(path: str) -> Tuple[Dict[str, int], Dict[str, List[str]]]:
    """Parse a .tex file for \\cite{} commands.

    Returns (frequency_map, context_map):
      - frequency_map: {cite_key: count}
      - context_map: {cite_key: [surrounding text snippets]}
    """
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    frequency: Dict[str, int] = {}
    contexts: Dict[str, List[str]] = {}

    for m in _CITE_RE.finditer(content):
        keys_str = m.group(1)
        keys = [k.strip() for k in keys_str.split(",") if k.strip()]

        start = max(0, m.start() - _CONTEXT_WINDOW)
        end = min(len(content), m.end() + _CONTEXT_WINDOW)
        ctx = content[start:end].replace("\n", " ")
        ctx = re.sub(r"\s+", " ", ctx).strip()

        for key in keys:
            frequency[key] = frequency.get(key, 0) + 1
            if key not in contexts:
                contexts[key] = []
            if len(contexts[key]) < 3:
                contexts[key].append(ctx)

    return frequency, contexts


# ---------------------------------------------------------------------------
# Directory-level scanning
# ---------------------------------------------------------------------------

_SKIP_DIRS = frozenset({".git", "__pycache__", "node_modules", ".venv"})


def scan_source_dir(source_dir: str) -> Tuple[
    Dict[str, Dict[str, str]],
    Dict[str, int],
    Dict[str, List[str]],
]:
    """Scan a LaTeX source directory for all .bib and .tex files.

    Returns (bib_entries, cite_frequency, cite_contexts).
    """
    bib_entries: Dict[str, Dict[str, str]] = {}
    cite_frequency: Dict[str, int] = {}
    cite_contexts: Dict[str, List[str]] = {}

    for root, dirs, files in os.walk(source_dir):
        dirs[:] = [d for d in dirs if d not in _SKIP_DIRS]

        for fname in files:
            fpath = os.path.join(root, fname)
            try:
                if fname.endswith(".bib"):
                    entries = parse_bib_file(fpath)
                    for key, fields in entries.items():
                        if key not in bib_entries:
                            bib_entries[key] = fields

                elif fname.endswith(".tex"):
                    freq, ctx = parse_latex_citations(fpath)
                    for key, count in freq.items():
                        cite_frequency[key] = cite_frequency.get(key, 0) + count
                    for key, snippets in ctx.items():
                        if key not in cite_contexts:
                            cite_contexts[key] = []
                        cite_contexts[key].extend(snippets)
            except Exception:
                continue

    return bib_entries, cite_frequency, cite_contexts


def build_citations(
    bib_entries: Dict[str, Dict[str, str]],
    cite_frequency: Dict[str, int],
    cite_contexts: Dict[str, List[str]],
) -> List[Citation]:
    """Merge BibTeX metadata with citation frequencies into Citation objects."""
    all_keys: Set[str] = set(bib_entries.keys()) | set(cite_frequency.keys())
    citations: List[Citation] = []

    for key in all_keys:
        bib = bib_entries.get(key, {})
        freq = cite_frequency.get(key, 0)
        ctxs = cite_contexts.get(key, [])[:3]

        authors_raw = bib.get("author", "")
        authors = [a.strip() for a in authors_raw.split(" and ")] if authors_raw else []

        citations.append(Citation(
            key=key,
            title=bib.get("title", ""),
            authors=authors,
            year=bib.get("year"),
            frequency=freq,
            contexts=ctxs,
        ))

    citations.sort(key=lambda c: c.frequency, reverse=True)
    return citations
