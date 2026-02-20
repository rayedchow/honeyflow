from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel

from app.schemas.graph import Graph, GraphConfig


class PackageEcosystem(str, Enum):
    NPM = "npm"
    PYPI = "pypi"


class TracePackageRequest(BaseModel):
    package_name: str
    ecosystem: PackageEcosystem
    max_depth: Optional[int] = None
    max_children: Optional[int] = None


class TracePackageResponse(BaseModel):
    package: str
    ecosystem: str
    config: GraphConfig
    graph: Graph
    user_attribution: Dict[str, float] = {}
