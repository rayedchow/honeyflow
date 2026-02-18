"""Parse dependency manifests across ecosystems.

Supports: package.json, requirements.txt, pyproject.toml, Cargo.toml, go.mod.
"""

import json
import os
import re
from typing import List, Optional, Tuple

try:
    import tomllib  # Python 3.11+
except ImportError:
    import tomli as tomllib  # type: ignore[no-redef]


class Dependency:
    __slots__ = ("name", "version", "dev_only")

    def __init__(self, name: str, version: Optional[str] = None, dev_only: bool = False):
        self.name = name
        self.version = version
        self.dev_only = dev_only

    def __repr__(self) -> str:
        tag = " (dev)" if self.dev_only else ""
        ver = f"@{self.version}" if self.version else ""
        return f"Dependency({self.name}{ver}{tag})"


MANIFEST_FILES = {
    "package.json": "npm",
    "requirements.txt": "pypi",
    "pyproject.toml": "pypi",
    "Pipfile": "pypi",
    "Cargo.toml": "crates",
    "go.mod": "go",
}

_REQ_LINE_RE = re.compile(
    r"^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[.*?\])?\s*(.*?)(?:\s*#.*)?$"
)

_GO_REQUIRE_RE = re.compile(
    r"^\s*(\S+)\s+(v\S+)", re.MULTILINE
)


def find_manifests(source_dir: str) -> List[Tuple[str, str]]:
    """Return (filepath, ecosystem) pairs for manifests found in the repo root."""
    found = []
    for filename, ecosystem in MANIFEST_FILES.items():
        path = os.path.join(source_dir, filename)
        if os.path.isfile(path):
            found.append((path, ecosystem))
    return found


def parse_manifest(path: str, ecosystem: str) -> List[Dependency]:
    """Dispatch to the right parser based on ecosystem and filename."""
    basename = os.path.basename(path)
    try:
        if basename == "package.json":
            return _parse_package_json(path)
        if basename == "requirements.txt":
            return _parse_requirements_txt(path)
        if basename == "pyproject.toml":
            return _parse_pyproject_toml(path)
        if basename == "Pipfile":
            return _parse_pipfile(path)
        if basename == "Cargo.toml":
            return _parse_cargo_toml(path)
        if basename == "go.mod":
            return _parse_go_mod(path)
    except Exception:
        return []
    return []


def parse_all_manifests(source_dir: str) -> Tuple[str, List[Dependency]]:
    """Find and parse all manifests. Returns (primary_ecosystem, merged deps)."""
    manifests = find_manifests(source_dir)
    if not manifests:
        return ("unknown", [])

    all_deps: List[Dependency] = []
    seen_names: set = set()
    primary_ecosystem = manifests[0][1]

    for path, eco in manifests:
        for dep in parse_manifest(path, eco):
            if dep.name not in seen_names:
                seen_names.add(dep.name)
                all_deps.append(dep)

    return (primary_ecosystem, all_deps)


# ---------------------------------------------------------------------------
# Individual parsers
# ---------------------------------------------------------------------------

def _parse_package_json(path: str) -> List[Dependency]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    deps: List[Dependency] = []
    for name, ver in (data.get("dependencies") or {}).items():
        deps.append(Dependency(name=name, version=ver, dev_only=False))
    for name, ver in (data.get("devDependencies") or {}).items():
        deps.append(Dependency(name=name, version=ver, dev_only=True))
    return deps


def _parse_requirements_txt(path: str) -> List[Dependency]:
    deps: List[Dependency] = []
    with open(path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith(("#", "-", ".", "/")):
                continue
            if line.startswith("git+") or line.startswith("hg+"):
                continue
            m = _REQ_LINE_RE.match(line)
            if m:
                deps.append(Dependency(name=m.group(1), version=m.group(2) or None))
    return deps


def _parse_pyproject_toml(path: str) -> List[Dependency]:
    with open(path, "rb") as f:
        data = tomllib.load(f)

    deps: List[Dependency] = []

    # PEP 621 style
    for entry in data.get("project", {}).get("dependencies", []):
        name = re.split(r"[><=!~;\s\[]", entry)[0].strip()
        if name:
            deps.append(Dependency(name=name))

    for group_deps in (data.get("project", {}).get("optional-dependencies") or {}).values():
        for entry in group_deps:
            name = re.split(r"[><=!~;\s\[]", entry)[0].strip()
            if name:
                deps.append(Dependency(name=name, dev_only=True))

    # Poetry style
    for name in (data.get("tool", {}).get("poetry", {}).get("dependencies") or {}):
        if name.lower() != "python":
            deps.append(Dependency(name=name))

    for name in (data.get("tool", {}).get("poetry", {}).get("dev-dependencies") or {}):
        deps.append(Dependency(name=name, dev_only=True))

    return deps


def _parse_pipfile(path: str) -> List[Dependency]:
    deps: List[Dependency] = []
    section = None
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if stripped == "[packages]":
                section = "prod"
            elif stripped == "[dev-packages]":
                section = "dev"
            elif stripped.startswith("["):
                section = None
            elif section and "=" in stripped:
                name = stripped.split("=")[0].strip().strip('"')
                deps.append(Dependency(name=name, dev_only=(section == "dev")))
    return deps


def _parse_cargo_toml(path: str) -> List[Dependency]:
    with open(path, "rb") as f:
        data = tomllib.load(f)

    deps: List[Dependency] = []
    for name, val in (data.get("dependencies") or {}).items():
        ver = val if isinstance(val, str) else (val.get("version") if isinstance(val, dict) else None)
        deps.append(Dependency(name=name, version=ver))

    for name, val in (data.get("dev-dependencies") or {}).items():
        ver = val if isinstance(val, str) else (val.get("version") if isinstance(val, dict) else None)
        deps.append(Dependency(name=name, version=ver, dev_only=True))

    return deps


def _parse_go_mod(path: str) -> List[Dependency]:
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    deps: List[Dependency] = []
    in_require = False
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("require ("):
            in_require = True
            continue
        if in_require and stripped == ")":
            in_require = False
            continue
        if in_require:
            m = _GO_REQUIRE_RE.match(stripped)
            if m:
                deps.append(Dependency(name=m.group(1), version=m.group(2)))
        elif stripped.startswith("require "):
            parts = stripped.split()
            if len(parts) >= 3:
                deps.append(Dependency(name=parts[1], version=parts[2]))

    return deps
