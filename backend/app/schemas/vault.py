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
    tx_hash: Optional[str] = None


class ConfirmDonateResponse(BaseModel):
    confirmed: bool
    transaction_hash: Optional[str] = None
    status: Optional[str] = None
    amount_wei: Optional[str] = None


class DisburseRequest(BaseModel):
    project_id: str
    to_address: str
    amount_eth: float


class DisburseResponse(BaseModel):
    project_id: str
    to_address: str
    amount_eth: float
    transaction_hash: Optional[str] = None
    caip2: Optional[str] = None
