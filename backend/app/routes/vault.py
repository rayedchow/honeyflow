"""Vault and donation confirmation endpoints."""

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.vault import (
    ConfirmDonateRequest,
    ConfirmDonateResponse,
    DisburseRequest,
    DisburseResponse,
    GetVaultRequest,
    GetVaultResponse,
)
from app.services.privy import create_ethereum_wallet, find_donation, send_from_vault
from app.services.vault_db import create_vault, get_vault
from app.services.donation_db import insert_donation

logger = logging.getLogger(__name__)

router = APIRouter(tags=["vault"])


@router.post("/get_vault", response_model=GetVaultResponse)
async def get_vault_endpoint(body: GetVaultRequest):
    """Get or create a Privy-managed ETH vault wallet for a project.

    If the project already has a vault, returns the existing address.
    Otherwise creates a new Ethereum wallet via Privy and stores it.
    """
    existing = await get_vault(body.project_id)
    if existing:
        _, address = existing
        return GetVaultResponse(
            project_id=body.project_id,
            wallet_address=address,
            created=False,
        )

    try:
        wallet = await create_ethereum_wallet()
    except Exception as exc:
        logger.error("Failed to create Privy wallet for %s: %s", body.project_id, exc)
        raise HTTPException(
            status_code=502,
            detail="Failed to create vault wallet: {}".format(str(exc)),
        )

    await create_vault(body.project_id, wallet["id"], wallet["address"])

    return GetVaultResponse(
        project_id=body.project_id,
        wallet_address=wallet["address"],
        created=True,
    )


@router.post("/confirm_donate", response_model=ConfirmDonateResponse)
async def confirm_donate_endpoint(body: ConfirmDonateRequest):
    """Confirm that a project's vault received a specific ETH donation.

    Looks up the project's Privy wallet, then queries Privy's transaction
    history for a confirmed incoming transfer matching the donator address
    and amount.
    """
    existing = await get_vault(body.project_id)
    if not existing:
        raise HTTPException(
            status_code=404,
            detail="No vault found for project '{}'".format(body.project_id),
        )

    wallet_id, _ = existing
    amount_wei = int(body.amount_eth * 10**18)

    try:
        match = await find_donation(
            wallet_id=wallet_id,
            donator_address=body.donator_wallet,
            amount_wei=amount_wei,
        )
    except Exception as exc:
        logger.error("Failed to query donations for %s: %s", body.project_id, exc)
        raise HTTPException(
            status_code=502,
            detail="Failed to query wallet transactions: {}".format(str(exc)),
        )

    if match:
        await insert_donation(
            project_id=body.project_id,
            donator_address=body.donator_wallet,
            amount_eth=body.amount_eth,
            tx_hash=match["transaction_hash"],
        )
        return ConfirmDonateResponse(
            confirmed=True,
            transaction_hash=match["transaction_hash"],
            status=match["status"],
            amount_wei=match["amount_wei"],
        )

    return ConfirmDonateResponse(confirmed=False)


@router.post("/disburse", response_model=DisburseResponse)
async def disburse_endpoint(body: DisburseRequest):
    """Send ETH from a project's Privy vault wallet to any address.

    Privy signs the transaction server-side — no private key is ever
    exposed. The vault must hold enough ETH to cover the transfer + gas.
    """
    existing = await get_vault(body.project_id)
    if not existing:
        raise HTTPException(
            status_code=404,
            detail="No vault found for project '{}'".format(body.project_id),
        )

    wallet_id, vault_address = existing
    logger.info(
        "[VAULT] Disbursing %.6f ETH from project=%s vault=%s to=%s",
        body.amount_eth,
        body.project_id,
        vault_address,
        body.to_address,
    )

    try:
        result = await send_from_vault(
            wallet_id=wallet_id,
            to_address=body.to_address,
            amount_eth=body.amount_eth,
        )
    except Exception as exc:
        logger.error("Disburse failed for %s: %s", body.project_id, exc)
        raise HTTPException(
            status_code=502,
            detail="Failed to send transaction: {}".format(str(exc)),
        )

    return DisburseResponse(
        project_id=body.project_id,
        to_address=body.to_address,
        amount_eth=body.amount_eth,
        transaction_hash=result["hash"],
        caip2=result["caip2"],
    )
