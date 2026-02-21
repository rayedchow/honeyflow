"""Aggregated human correction priors from jury feedback.

Each row captures how human jurors collectively correct the AI's weight
for a specific entity (contributor, dependency, or citation). The
correction factor is used to adjust future AI decisions during tracing.
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class JuryPrior(Base):
    __tablename__ = "jury_priors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_name: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    avg_human_weight: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    avg_ai_weight: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    avg_correction: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    vote_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("entity_name", "entity_type", name="uq_jury_priors_entity"),
    )
