from sqlalchemy import Column, DateTime, Float, Integer, String, func
from app.models.base import Base


class Donation(Base):
    __tablename__ = "donations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, nullable=False, index=True)
    donator_address = Column(String, nullable=False)
    amount_eth = Column(Float, nullable=False)
    tx_hash = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
