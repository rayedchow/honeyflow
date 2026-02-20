from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, HttpUrl


class NodeType(str, Enum):
    REPO = "REPO"
    PACKAGE = "PACKAGE"
    BODY_OF_WORK = "BODY_OF_WORK"
    CONTRIBUTOR = "CONTRIBUTOR"


class Node(BaseModel):
    id: str
    type: NodeType
    label: str
    metadata: Dict[str, Any] = {}


class Edge(BaseModel):
    source: str
    target: str
    weight: float
    label: str = ""


class Graph(BaseModel):
    nodes: List[Node] = []
    edges: List[Edge] = []


class GraphConfig(BaseModel):
    max_depth: int = 3
    max_children: int = 10


class TraceGraphRequest(BaseModel):
    repo_url: HttpUrl
    max_depth: Optional[int] = None
    max_children: Optional[int] = None


class TraceGraphResponse(BaseModel):
    repo: str
    config: GraphConfig
    graph: Graph
    user_attribution: Dict[str, float] = {}
