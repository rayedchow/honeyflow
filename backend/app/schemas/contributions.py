from typing import List

from pydantic import BaseModel, HttpUrl


class TraceContributionsRequest(BaseModel):
    repo_url: HttpUrl


class Contributor(BaseModel):
    username: str
    contributions: int


class TraceContributionsResponse(BaseModel):
    repo: str
    top_contributors: List[Contributor]
