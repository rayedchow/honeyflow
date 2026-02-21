from sqlalchemy import Column, Integer, String, DateTime, func
from app.models.base import Base

class CommunityFeedback(Base):
    __tablename__ = "community_feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, nullable=False)
    feedback = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)