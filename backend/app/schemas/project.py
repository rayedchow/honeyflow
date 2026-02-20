from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class ProjectBase(BaseModel):
    slug: str
    name: str
    category: str = "Infrastructure"
    type: str = "repo"
    summary: str = ""
    description: str = ""
    source_url: str
    raised: float = 0
    contributors: int = 0
    depth: int = 0
    graph_data: Any = {"nodes": [], "edges": []}
    attribution: Any = {}
    dependencies: Any = []
    top_contributors: Any = []


class ProjectResponse(ProjectBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]
    count: int
