"""Pydantic models for vault and donation endpoints."""

from typing import Optional

from pydantic import BaseModel


class GetVaultRequest(BaseModel):
    project_id: str


class GetVaultResponse(BaseModel):
    project_id: str
    wallet_address: str
    created: bool


class ConfirmDonateRequest(BaseModel):
    project_id: str
    donator_wallet: str
    amount_eth: float


class ConfirmDonateResponse(BaseModel):
    confirmed: bool
    transaction_hash: Optional[str] = None
    status: Optional[str] = None
    amount_wei: Optional[str] = None
