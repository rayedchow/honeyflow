"""Parse citations from LaTeX and PDF sources.

Extracts:
  - BibTeX entries from .bib files (title, authors, year, key)
  - \\cite{} frequencies and surrounding context from .tex files
  - PDF reference-section entries + explicit/conceptual usage in body text
"""

import os
import re
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


class Citation:
    __slots__ = (
        "key",
        "title",
        "authors",
        "year",
        "frequency",
        "contexts",
        "explicit_count",
        "conceptual_count",
    )

    def __init__(
        self,
        key: str,
        title: str = "",
        authors: Optional[List[str]] = None,
        year: Optional[str] = None,
        frequency: int = 0,
        contexts: Optional[List[str]] = None,
        explicit_count: int = 0,
        conceptual_count: int = 0,
    ):
        self.key = key
        self.title = title
        self.authors = authors or []
        self.year = year
        self.frequency = frequency
        self.contexts = contexts or []
        self.explicit_count = explicit_count
        self.conceptual_count = conceptual_count

    def __repr__(self) -> str:
        return "Citation({}, freq={}, explicit={}, conceptual={}, title='{}')".format(
            self.key,
            self.frequency,
            self.explicit_count,
            self.conceptual_count,
            self.title[:40],
        )


# ---------------------------------------------------------------------------
# BibTeX parsing
# ---------------------------------------------------------------------------

_BIB_ENTRY_RE = re.compile(r"@\w+\s*\{\s*([^,\s]+)\s*,", re.MULTILINE)

_BIB_FIELD_RE = re.compile(r"^\s*(\w+)\s*=\s*[{\"](.+?)[}\"]", re.MULTILINE)


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
# .bbl parsing (compiled bibliography output from LaTeX)
# ---------------------------------------------------------------------------

_BBL_ITEM_RE = re.compile(
    r"\\bibitem(?:\[([^\]]+)\])?\{([^}]+)\}(.*?)(?=\\bibitem(?:\[[^\]]*\])?\{|\\end\{thebibliography\})",
    re.DOTALL,
)


def parse_bbl_file(path: str) -> Dict[str, Dict[str, str]]:
    """Parse a .bbl file and return cite_key -> {title, author, year, ...}.

    Many arXiv sources ship with `main.bbl` instead of raw `.bib` files.
    """
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    entries: Dict[str, Dict[str, str]] = {}
    for m in _BBL_ITEM_RE.finditer(content):
        cite_key = (m.group(2) or "").strip()
        block = (m.group(3) or "").strip()
        if not cite_key:
            continue

        authors, title, year = _parse_bbl_block(block)
        fields: Dict[str, str] = {"_key": cite_key}
        if title:
            fields["title"] = title
        if authors:
            fields["author"] = " and ".join(authors)
        if year:
            fields["year"] = year
        entries[cite_key] = fields

    return entries


def _parse_bbl_block(block: str) -> Tuple[List[str], str, Optional[str]]:
    """Extract authors/title/year from a single .bbl \\bibitem body."""
    parts = [p.strip() for p in block.split("\\newblock") if p.strip()]
    author_part = _strip_latex_markup(parts[0]) if parts else ""
    title_part = _strip_latex_markup(parts[1]) if len(parts) > 1 else ""

    if not title_part and len(parts) > 2:
        # Some styles put venue in part 1 and title in part 2.
        cand = _strip_latex_markup(parts[2])
        if _looks_like_title(cand):
            title_part = cand

    authors = _split_author_names(author_part)
    year_match = re.search(r"\b(19|20)\d{2}\b", block)
    year = year_match.group(0) if year_match else None
    return authors, title_part, year


def _split_author_names(raw: str) -> List[str]:
    raw = re.sub(r"\bet\s+al\.?\b", "", raw, flags=re.IGNORECASE)
    raw = raw.replace("&", ",")
    parts = [p.strip(" ,.;") for p in re.split(r",| and ", raw) if p.strip()]

    names: List[str] = []
    for p in parts:
        low = p.lower()
        if len(p) < 3:
            continue
        if not re.search(r"[a-z]", low):
            continue
        if any(
            tok in low
            for tok in ("doi", "arxiv", "journal", "conference", "proc", "vol", "pp")
        ):
            continue
        names.append(p)
    return names[:10]


def _strip_latex_markup(text: str) -> str:
    s = text.replace("\n", " ")
    s = s.replace("~", " ")

    # Unwrap common LaTeX commands that carry content.
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"\\[a-zA-Z]+\*?\{([^{}]*)\}", r"\1", s)
        s = re.sub(r"\{([^{}]*)\}", r"\1", s)

    # Drop remaining bare LaTeX commands.
    s = re.sub(r"\\[a-zA-Z]+\*?", " ", s)
    s = s.replace("\\", " ")

    s = s.replace("{", "").replace("}", "")
    s = _normalize_text(s)
    return s.strip(" .;")


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


def scan_source_dir(
    source_dir: str,
) -> Tuple[
    Dict[str, Dict[str, str]],
    Dict[str, int],
    Dict[str, List[str]],
]:
    """Scan a LaTeX source directory for .bib/.bbl and .tex files.

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

                elif fname.endswith(".bbl"):
                    entries = parse_bbl_file(fpath)
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

        citations.append(
            Citation(
                key=key,
                title=bib.get("title", ""),
                authors=authors,
                year=bib.get("year"),
                frequency=freq,
                contexts=ctxs,
                explicit_count=freq,
                conceptual_count=0,
            )
        )

    citations.sort(key=lambda c: c.frequency, reverse=True)
    return citations


# ---------------------------------------------------------------------------
# PDF citation parsing
# ---------------------------------------------------------------------------

_PDF_REF_HEADER_RE = re.compile(
    r"\n\s*(references|bibliography|works cited)\s*\n",
    re.IGNORECASE,
)
_PDF_REF_START_RE = re.compile(r"^\s*(?:\[([^\]]{1,32})\]|(\d{1,4})[.)])\s*")
_PDF_BRACKET_RE = re.compile(r"\[([^\]]{1,60})\]")
_WORD_RE = re.compile(r"[A-Za-z][A-Za-z\-]{2,}")
_STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "using",
    "towards",
    "toward",
    "through",
    "into",
    "over",
    "under",
    "between",
    "based",
    "analysis",
    "study",
    "approach",
    "method",
    "methods",
    "model",
    "models",
    "learning",
    "neural",
    "network",
    "networks",
    "data",
    "system",
    "systems",
}


def parse_pdf_citations(pdf_path: str, max_refs: int = 250) -> List[Citation]:
    """Parse references from a paper PDF and estimate explicit/conceptual usage.

    - Explicit usage: in-text bracket markers (numeric or keyed), e.g.
      [12], [4,7], [8-10], [DCLT18], [RWC+19].
    - Conceptual usage: title-keyword mentions in body text.
    """
    try:
        from pypdf import PdfReader  # pyright: ignore[reportMissingImports]
    except Exception:
        return []

    try:
        reader = PdfReader(pdf_path)
    except Exception:
        return []

    pages: List[str] = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        if text.strip():
            pages.append(text)

    if not pages:
        return []

    full_text = _normalize_text("\n".join(pages), preserve_newlines=True)
    body_text, refs_text = _split_references_section(full_text)
    if not refs_text:
        return []

    parsed_refs = _parse_reference_entries(refs_text, max_refs=max_refs)
    if not parsed_refs:
        return []

    explicit_counts = _count_bracket_mentions(body_text)
    citations: List[Citation] = []

    for i, ref in enumerate(parsed_refs, start=1):
        ref_id = str(ref.get("index") or i).strip()
        ref_key = _normalize_ref_key(ref_id)
        title = ref.get("title", "")
        authors = ref.get("authors", [])
        year = ref.get("year")

        explicit = explicit_counts.get(ref_key, 0)
        explicit_ctx = _extract_explicit_contexts(body_text, ref_id, limit=2)
        conceptual, conceptual_ctx = _estimate_conceptual_usage(
            body_text, title, limit=2
        )

        # Explicit in-text markers are stronger than conceptual keyword overlap.
        freq = (explicit * 3) + conceptual
        if freq <= 0:
            freq = 1

        contexts = (explicit_ctx + conceptual_ctx)[:4]
        citations.append(
            Citation(
                key="pdfref:{}".format(ref_id),
                title=title,
                authors=authors,
                year=year,
                frequency=freq,
                contexts=contexts,
                explicit_count=explicit,
                conceptual_count=conceptual,
            )
        )

    citations.sort(key=lambda c: c.frequency, reverse=True)
    return citations


def merge_citation_lists(
    primary: List[Citation], secondary: List[Citation]
) -> List[Citation]:
    """Merge two citation lists, combining near-duplicate entries by title/key."""
    merged: Dict[str, Citation] = {}
    order: List[str] = []

    def _merge_key(c: Citation) -> str:
        title_key = _normalize_title_key(c.title)
        return title_key or c.key.lower()

    def _add(c: Citation) -> None:
        k = _merge_key(c)
        if k in merged:
            cur = merged[k]
            cur.frequency += c.frequency
            cur.explicit_count += c.explicit_count
            cur.conceptual_count += c.conceptual_count
            if not cur.title and c.title:
                cur.title = c.title
            if not cur.year and c.year:
                cur.year = c.year
            if not cur.authors and c.authors:
                cur.authors = list(c.authors)
            for ctx in c.contexts:
                if ctx not in cur.contexts and len(cur.contexts) < 6:
                    cur.contexts.append(ctx)
            return

        merged[k] = Citation(
            key=c.key,
            title=c.title,
            authors=list(c.authors),
            year=c.year,
            frequency=c.frequency,
            contexts=list(c.contexts[:6]),
            explicit_count=c.explicit_count,
            conceptual_count=c.conceptual_count,
        )
        order.append(k)

    for citation in primary:
        _add(citation)
    for citation in secondary:
        _add(citation)

    result = [merged[k] for k in order]
    result.sort(key=lambda c: c.frequency, reverse=True)
    return result


def _normalize_text(text: str, preserve_newlines: bool = False) -> str:
    text = text.replace("\r", "\n").replace("\x00", "")
    if preserve_newlines:
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text
    return re.sub(r"\s+", " ", text).strip()


def _split_references_section(full_text: str) -> Tuple[str, str]:
    matches = list(_PDF_REF_HEADER_RE.finditer(full_text))
    if not matches:
        return full_text, ""
    last = matches[-1]
    return full_text[: last.start()], full_text[last.end() :]


def _parse_reference_entries(
    refs_text: str, max_refs: int = 250
) -> List[Dict[str, Any]]:
    lines = [line.strip() for line in refs_text.splitlines() if line.strip()]
    entries: List[Dict[str, Any]] = []
    current_lines: List[str] = []
    current_idx: Optional[str] = None

    for line in lines:
        m = _PDF_REF_START_RE.match(line)
        if m:
            if current_lines:
                entries.append(_build_reference_entry(current_idx, current_lines))
                if len(entries) >= max_refs:
                    break
            current_idx = (m.group(1) or m.group(2) or "").strip()
            remainder = line[m.end() :].strip()
            current_lines = [remainder] if remainder else []
            continue

        if current_lines:
            current_lines.append(line)

    if current_lines and len(entries) < max_refs:
        entries.append(_build_reference_entry(current_idx, current_lines))

    return [e for e in entries if e.get("title") or e.get("authors")]


def _build_reference_entry(index: Optional[str], lines: List[str]) -> Dict[str, Any]:
    raw = _normalize_text(" ".join(lines))
    year_match = re.search(r"\b(19|20)\d{2}\b", raw)
    year = year_match.group(0) if year_match else None
    title = _extract_reference_title(raw)
    authors = _extract_reference_authors(
        raw, title, year_match.start() if year_match else -1
    )
    return {
        "index": index,
        "title": title,
        "authors": authors,
        "year": year,
        "raw": raw,
    }


def _extract_reference_title(raw: str) -> str:
    q = re.search(r"[\"“](.{12,260}?)[\"”]", raw)
    if q:
        return q.group(1).strip(" .;")

    pieces = [p.strip(" .;") for p in re.split(r"\.\s+", raw) if p.strip()]
    if len(pieces) >= 2:
        for cand in pieces[1:4]:
            if _looks_like_title(cand):
                return cand
        return pieces[1][:260]

    for cand in pieces:
        if _looks_like_title(cand):
            return cand

    return ""


def _looks_like_title(text: str) -> bool:
    lower = text.lower()
    if len(text) < 12 or len(text) > 260:
        return False
    banned = ("doi", "arxiv", "http", "www.", "vol.", "pp.", "proceedings", "journal")
    if any(b in lower for b in banned):
        return False
    return len(_WORD_RE.findall(text)) >= 3


def _extract_reference_authors(raw: str, title: str, year_pos: int) -> List[str]:
    prefix = raw
    if title and title in raw:
        prefix = raw.split(title, 1)[0]
    elif year_pos > 0:
        prefix = raw[:year_pos]
    prefix = prefix.replace("&", ",")
    prefix = re.sub(r"\bet\s+al\.?\b", "", prefix, flags=re.IGNORECASE)

    parts = [p.strip(" ,.;") for p in re.split(r",| and ", prefix) if p.strip()]
    authors: List[str] = []
    for p in parts:
        low = p.lower()
        if len(p) < 3:
            continue
        if not re.search(r"[a-z]", low):
            continue
        if any(
            tok in low
            for tok in ("doi", "arxiv", "journal", "conference", "proc", "vol", "pp")
        ):
            continue
        authors.append(p)
    return authors[:8]


def _count_bracket_mentions(body_text: str) -> Dict[str, int]:
    counts: Dict[str, int] = defaultdict(int)
    for m in _PDF_BRACKET_RE.finditer(body_text):
        chunk = m.group(1)
        for ref_key in _expand_bracket_chunk(chunk):
            counts[ref_key] += 1
    return counts


def _expand_bracket_chunk(chunk: str) -> List[str]:
    out: List[str] = []
    tokens = re.split(r"[,\s;]+", chunk)
    for token in tokens:
        token = token.strip()
        if not token:
            continue
        if "-" in token:
            bounds = token.split("-", 1)
            if len(bounds) != 2:
                continue
            if bounds[0].isdigit() and bounds[1].isdigit():
                a, b = int(bounds[0]), int(bounds[1])
                if 0 < a <= b and (b - a) <= 20:
                    out.extend([str(x) for x in range(a, b + 1)])
            continue
        norm = _normalize_ref_key(token)
        if norm:
            out.append(norm)
    return out


def _extract_explicit_contexts(
    body_text: str, ref_id: str, limit: int = 2
) -> List[str]:
    contexts: List[str] = []
    target = _normalize_ref_key(ref_id)
    for m in _PDF_BRACKET_RE.finditer(body_text):
        keys = _expand_bracket_chunk(m.group(1))
        if target not in keys:
            continue
        if len(contexts) >= limit:
            break
        start = max(0, m.start() - 140)
        end = min(len(body_text), m.end() + 140)
        ctx = _normalize_text(body_text[start:end])
        contexts.append("explicit: {}".format(ctx))
    return contexts


def _estimate_conceptual_usage(
    body_text: str, title: str, limit: int = 2
) -> Tuple[int, List[str]]:
    if not title:
        return 0, []

    body_lower = body_text.lower()
    words = [w.lower() for w in _WORD_RE.findall(title)]
    keywords = [w for w in words if len(w) >= 5 and w not in _STOPWORDS]
    keywords = sorted(set(keywords), key=len, reverse=True)[:5]
    if not keywords:
        return 0, []

    hits = 0
    contexts: List[str] = []
    for kw in keywords:
        rx = re.compile(r"\b{}\b".format(re.escape(kw)), re.IGNORECASE)
        for m in rx.finditer(body_lower):
            hits += 1
            if len(contexts) < limit:
                start = max(0, m.start() - 140)
                end = min(len(body_text), m.end() + 140)
                ctx = _normalize_text(body_text[start:end])
                contexts.append("conceptual({}): {}".format(kw, ctx))
            if hits >= 8:
                break
        if hits >= 8:
            break

    return min(hits, 6), contexts


def _normalize_ref_key(token: str) -> str:
    token = token.strip().strip("[](){}")
    if not token:
        return ""
    return re.sub(r"[^a-z0-9+.-]+", "", token.lower())


def _normalize_title_key(title: str) -> str:
    if not title:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()
