from pydantic import BaseModel
from datetime import datetime

class CommunityFeedbackRequest(BaseModel):
    project_id: str
    feedback: str

class CommunityFeedbackResponse(BaseModel):
    id: int
    project_id: str
    feedback: str
    created_at: datetime

    class Config:
        from_attributes = True