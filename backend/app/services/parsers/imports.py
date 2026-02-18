"""Regex-based import frequency counting across ecosystems.

Walks a source tree, parses import statements per language, and returns a
mapping of package name -> number of source files that import it.
"""

import os
import re
from typing import Dict, Optional, Set

# ---------------------------------------------------------------------------
# Python
# ---------------------------------------------------------------------------

_PY_IMPORT_RE = re.compile(r"^\s*import\s+(\w+)", re.MULTILINE)
_PY_FROM_RE = re.compile(r"^\s*from\s+(\w+)", re.MULTILINE)
_PY_STDLIB = frozenset({
    "abc", "argparse", "ast", "asyncio", "base64", "bisect", "builtins",
    "calendar", "cmath", "collections", "colorsys", "concurrent", "configparser",
    "contextlib", "copy", "csv", "ctypes", "dataclasses", "datetime", "decimal",
    "difflib", "dis", "email", "enum", "errno", "faulthandler", "fileinput",
    "fnmatch", "fractions", "ftplib", "functools", "gc", "getpass", "gettext",
    "glob", "gzip", "hashlib", "heapq", "hmac", "html", "http", "imaplib",
    "importlib", "inspect", "io", "ipaddress", "itertools", "json", "keyword",
    "linecache", "locale", "logging", "lzma", "mailbox", "math", "mimetypes",
    "mmap", "multiprocessing", "numbers", "operator", "os", "pathlib", "pdb",
    "pickle", "pkgutil", "platform", "plistlib", "poplib", "posixpath", "pprint",
    "profile", "pstats", "queue", "quopri", "random", "re", "readline", "reprlib",
    "resource", "rlcompleter", "sched", "secrets", "select", "selectors",
    "shelve", "shlex", "shutil", "signal", "site", "smtplib", "socket",
    "socketserver", "sqlite3", "ssl", "stat", "statistics", "string",
    "stringprep", "struct", "subprocess", "sys", "sysconfig", "syslog",
    "tabnanny", "tarfile", "tempfile", "test", "textwrap", "threading", "time",
    "timeit", "tkinter", "token", "tokenize", "tomllib", "trace", "traceback",
    "tracemalloc", "tty", "turtle", "turtledemo", "types", "typing",
    "unicodedata", "unittest", "urllib", "uuid", "venv", "warnings", "wave",
    "weakref", "webbrowser", "wsgiref", "xml", "xmlrpc", "zipapp", "zipfile",
    "zipimport", "zlib", "_thread",
})


def _parse_python_imports(content: str) -> Set[str]:
    imports: Set[str] = set()
    for m in _PY_IMPORT_RE.finditer(content):
        imports.add(m.group(1))
    for m in _PY_FROM_RE.finditer(content):
        imports.add(m.group(1))
    return imports - _PY_STDLIB


# ---------------------------------------------------------------------------
# JavaScript / TypeScript
# ---------------------------------------------------------------------------

_JS_IMPORT_FROM_RE = re.compile(
    r"""(?:import|export)\s+.*?\s+from\s*['"]([^'"]+)['"]""", re.MULTILINE
)
_JS_IMPORT_BARE_RE = re.compile(
    r"""import\s*['"]([^'"]+)['"]""", re.MULTILINE
)
_JS_REQUIRE_RE = re.compile(
    r"""require\s*\(\s*['"]([^'"]+)['"]\s*\)"""
)


def _extract_js_package(raw: str) -> Optional[str]:
    """Normalize an import specifier to a package name, skipping relative paths."""
    if raw.startswith(".") or raw.startswith("/"):
        return None
    parts = raw.split("/")
    if raw.startswith("@") and len(parts) >= 2:
        return "{}/{}".format(parts[0], parts[1])
    return parts[0]


_JS_BUILTINS = frozenset({
    "fs", "path", "os", "http", "https", "url", "util", "stream", "events",
    "crypto", "zlib", "net", "tls", "dns", "child_process", "cluster",
    "readline", "repl", "vm", "assert", "buffer", "console", "process",
    "querystring", "string_decoder", "timers", "tty", "dgram", "v8",
    "worker_threads", "perf_hooks", "async_hooks", "module",
    "node:fs", "node:path", "node:os", "node:http", "node:https",
    "node:url", "node:util", "node:stream", "node:events", "node:crypto",
})


def _parse_js_imports(content: str) -> Set[str]:
    imports: Set[str] = set()
    for regex in (_JS_IMPORT_FROM_RE, _JS_IMPORT_BARE_RE, _JS_REQUIRE_RE):
        for m in regex.finditer(content):
            pkg = _extract_js_package(m.group(1))
            if pkg and pkg not in _JS_BUILTINS:
                imports.add(pkg)
    return imports


# ---------------------------------------------------------------------------
# Rust
# ---------------------------------------------------------------------------

_RUST_USE_RE = re.compile(r"^\s*use\s+(\w+)::", re.MULTILINE)
_RUST_EXTERN_RE = re.compile(r"^\s*extern\s+crate\s+(\w+)", re.MULTILINE)
_RUST_SKIP = frozenset({"std", "core", "alloc", "self", "super", "crate"})


def _parse_rust_imports(content: str) -> Set[str]:
    imports: Set[str] = set()
    for m in _RUST_USE_RE.finditer(content):
        name = m.group(1)
        if name not in _RUST_SKIP:
            imports.add(name)
    for m in _RUST_EXTERN_RE.finditer(content):
        name = m.group(1)
        if name not in _RUST_SKIP:
            imports.add(name)
    return imports


# ---------------------------------------------------------------------------
# Go
# ---------------------------------------------------------------------------

_GO_IMPORT_RE = re.compile(r'"([^"]+)"')


def _parse_go_imports(content: str) -> Set[str]:
    imports: Set[str] = set()
    for m in _GO_IMPORT_RE.finditer(content):
        pkg = m.group(1)
        top_segment = pkg.split("/")[0]
        if "." not in top_segment:
            continue
        parts = pkg.split("/")
        module_path = "/".join(parts[:3]) if len(parts) >= 3 else pkg
        imports.add(module_path)
    return imports


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_ECOSYSTEM_CONFIG = {
    "npm":    ((".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"), _parse_js_imports),
    "pypi":   ((".py",), _parse_python_imports),
    "crates": ((".rs",), _parse_rust_imports),
    "go":     ((".go",), _parse_go_imports),
}

_SKIP_DIRS = frozenset({
    "node_modules", ".git", "vendor", "target", "__pycache__",
    ".venv", "venv", ".tox", "dist", "build", ".next", ".nuxt",
})


def count_import_frequency(source_dir: str, ecosystem: str) -> Dict[str, int]:
    """Walk source files and count how many files import each external package."""
    config = _ECOSYSTEM_CONFIG.get(ecosystem)
    if not config:
        return {}

    extensions, parser_fn = config
    frequency: Dict[str, int] = {}

    for root, dirs, files in os.walk(source_dir):
        dirs[:] = [d for d in dirs if d not in _SKIP_DIRS]

        for fname in files:
            if not fname.endswith(extensions):
                continue
            filepath = os.path.join(root, fname)
            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read(500_000)
                for pkg in parser_fn(content):
                    frequency[pkg] = frequency.get(pkg, 0) + 1
            except Exception:
                continue

    return frequency
