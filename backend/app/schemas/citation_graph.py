"""Pydantic models for the citation attribution graph."""

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class CitationNodeType(str, Enum):
    PAPER = "PAPER"
    CITED_WORK = "CITED_WORK"
    AUTHOR = "AUTHOR"


class CitationNode(BaseModel):
    id: str
    type: CitationNodeType
    label: str
    metadata: Dict[str, Any] = {}


class CitationEdge(BaseModel):
    source: str
    target: str
    weight: float
    label: str = ""


class CitationGraph(BaseModel):
    nodes: List[CitationNode] = []
    edges: List[CitationEdge] = []


class CitationGraphConfig(BaseModel):
    max_depth: int = 2
    max_citations: int = 8


class TraceCitationGraphRequest(BaseModel):
    arxiv_id: str
    max_depth: Optional[int] = None
    max_citations: Optional[int] = None


class TraceCitationGraphResponse(BaseModel):
    arxiv_id: str
    title: str
    config: CitationGraphConfig
    graph: CitationGraph
    author_attribution: Dict[str, float] = {}
