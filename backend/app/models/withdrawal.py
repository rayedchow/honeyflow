from sqlalchemy import Column, DateTime, Float, Integer, String, func
from app.models.base import Base


class Withdrawal(Base):
    __tablename__ = "withdrawals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, nullable=False, index=True)
    wallet_address = Column(String, nullable=False)
    amount_eth = Column(Float, nullable=False)
    source = Column(String, nullable=False)  # "contribution" or "juror"
    project_slug = Column(String, nullable=True)
    tx_hash = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
