from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class EdgeVote(Base):
    __tablename__ = "edge_votes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    wallet_address: Mapped[str] = mapped_column(String, nullable=False)
    edge_source: Mapped[str] = mapped_column(String, nullable=False)
    edge_target: Mapped[str] = mapped_column(String, nullable=False)
    ai_weight: Mapped[float] = mapped_column(Float, nullable=False)
    human_weight: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    question_type: Mapped[str] = mapped_column(String, nullable=False, default="edge")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
