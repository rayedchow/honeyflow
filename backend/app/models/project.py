from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    canonical_key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False, default="Infrastructure")
    type: Mapped[str] = mapped_column(String, nullable=False, default="repo")
    summary: Mapped[str] = mapped_column(String, nullable=False, default="")
    description: Mapped[str] = mapped_column(String, nullable=False, default="")
    source_url: Mapped[str] = mapped_column(
        "source_url", String, unique=True, nullable=False
    )
    raised: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    contributors: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    graph_data: Mapped[dict] = mapped_column(
        "graph_data", JSONB, nullable=False, default=dict
    )
    attribution: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    dependencies: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list
    )
    top_contributors: Mapped[list] = mapped_column(
        "top_contributors", JSONB, nullable=False, default=list
    )
    cover_image_url: Mapped[Optional[str]] = mapped_column(
        String, nullable=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        "created_at", DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updated_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
