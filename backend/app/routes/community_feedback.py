from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.community_feedback import (
    CommunityFeedbackRequest,
    CommunityFeedbackResponse,
)

from app.database import get_db
from app.models.community_feedback import CommunityFeedback

router = APIRouter(tags=["community_feedback"])

@router.post("/community_feedback", response_model=CommunityFeedbackResponse, status_code=201)
async def submit_community_feedback(body: CommunityFeedbackRequest, db: AsyncSession = Depends(get_db)):
    """Submit community feedback for a project."""
    record = CommunityFeedback(
        project_id=body.project_id,
        feedback=body.feedback,
    )

    db.add(record)
    await db.commit()
    await db.refresh(record)

    return record