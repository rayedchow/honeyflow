from typing import List, Optional

from pydantic import BaseModel, Field


class JuryPeer(BaseModel):
    name: str
    ai_pct: float
    detail: str = ""
    is_subject: bool = False


class JuryCodeSample(BaseModel):
    filename: str = ""
    patch: str = ""
    commit_message: str = ""
    commit_url: str = ""


class JuryLink(BaseModel):
    label: str
    url: str


class JuryEdgeRef(BaseModel):
    source_id: str
    target_id: str
    ai_weight: float
    ai_percentage: float
    question_type: str


class JuryQuestion(BaseModel):
    question_id: str
    prompt: str

    project_name: str
    project_id: int
    project_slug: str
    project_description: str
    project_url: Optional[str] = None

    subject_name: str
    subject_summary: str

    peers: List[JuryPeer] = []
    total_peers: int = 0

    links: List[JuryLink] = []
    code_samples: List[JuryCodeSample] = []

    edge: JuryEdgeRef


class JuryQuestionsResponse(BaseModel):
    questions: List[JuryQuestion] = []


class JuryAnswer(BaseModel):
    question_id: Optional[str] = None
    project_id: int
    edge_source: str
    edge_target: str
    human_percentage: float = Field(ge=0.0, le=100.0)
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)


class SubmitJuryAnswersRequest(BaseModel):
    wallet_address: str = Field(min_length=3, max_length=256)
    answers: List[JuryAnswer] = Field(min_length=1, max_length=20)


class SubmitJuryAnswersResponse(BaseModel):
    accepted: int
    updated_projects: int
    reward_eth: float
