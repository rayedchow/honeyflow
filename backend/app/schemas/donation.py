from typing import Optional
from pydantic import BaseModel


class DonationOut(BaseModel):
    id: int
    project_id: str
    donator_address: str
    amount_eth: float
    tx_hash: Optional[str] = None
    created_at: str


class DonationsResponse(BaseModel):
    donations: list[DonationOut]
    total_eth: float
    count: int
