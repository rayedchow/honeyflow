"""Privy REST API client.

Creates and manages server-owned Ethereum wallets, and queries wallet
transactions for donation confirmation.
"""

import base64
import logging
from typing import Any, Dict, List, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
_BASE = "https://api.privy.io/v1"


def _headers() -> Dict[str, str]:
    app_id = settings.privy_app_id
    app_secret = settings.privy_app_secret
    encoded = base64.b64encode("{}:{}".format(app_id, app_secret).encode()).decode()
    return {
        "Authorization": "Basic {}".format(encoded),
        "privy-app-id": app_id,
        "Content-Type": "application/json",
    }


async def create_ethereum_wallet() -> Dict[str, str]:
    """Create a new ownerless Ethereum wallet via Privy.

    Returns {"id": "...", "address": "0x..."}.
    """
    logger.info("[PRIVY] Creating new Ethereum wallet")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            "{}/wallets".format(_BASE),
            headers=_headers(),
            json={"chain_type": "ethereum"},
        )
        resp.raise_for_status()

    data = resp.json()
    logger.info("[PRIVY] Created wallet id=%s address=%s", data["id"], data["address"])
    return {"id": data["id"], "address": data["address"]}


async def get_wallet_balance(wallet_id: str) -> Optional[Dict[str, Any]]:
    """Fetch the balance of a wallet by wallet ID."""
    logger.info("[PRIVY] Fetching balance for wallet %s", wallet_id)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            "{}/wallets/{}/balance".format(_BASE, wallet_id),
            headers=_headers(),
        )
        if resp.status_code != 200:
            logger.warning("[PRIVY] Balance fetch failed: %d", resp.status_code)
            return None
    return resp.json()


async def get_wallet_transactions(
    wallet_id: str,
    chain: Optional[str] = None,
    asset: str = "eth",
) -> List[Dict[str, Any]]:
    """Fetch incoming and outgoing transactions for a wallet.

    Returns the full list of transaction objects from Privy.
    """
    chain = chain or settings.eth_chain
    logger.info("[PRIVY] Fetching transactions for wallet %s on %s", wallet_id, chain)

    all_txns: List[Dict[str, Any]] = []
    cursor: Optional[str] = None

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        while True:
            params: Dict[str, Any] = {
                "chain": chain,
                "asset": asset,
                "limit": 100,
            }
            if cursor:
                params["cursor"] = cursor

            resp = await client.get(
                "{}/wallets/{}/transactions".format(_BASE, wallet_id),
                headers=_headers(),
                params=params,
            )
            if resp.status_code != 200:
                logger.warning(
                    "[PRIVY] Transaction fetch failed: %d %s",
                    resp.status_code,
                    resp.text[:200],
                )
                break

            data = resp.json()
            txns = data.get("transactions", [])
            all_txns.extend(txns)

            next_cursor = data.get("next_cursor")
            if not next_cursor:
                break
            cursor = next_cursor

    logger.info("[PRIVY] Got %d transactions for wallet %s", len(all_txns), wallet_id)
    return all_txns


async def send_from_vault(
    wallet_id: str,
    to_address: str,
    amount_eth: float,
    chain: Optional[str] = None,
) -> Dict[str, Any]:
    """Sign and broadcast an ETH transfer FROM a Privy server wallet.

    Privy holds the key — no private key ever leaves their infrastructure.
    Returns {"hash": "0x...", "caip2": "eip155:..."}.
    """
    chain = chain or settings.eth_chain
    chain_ids = {"sepolia": 11155111, "mainnet": 1, "ethereum": 1}
    chain_id = chain_ids.get(chain.lower(), 11155111)
    caip2 = "eip155:{}".format(chain_id)

    amount_wei_hex = hex(int(amount_eth * 10**18))

    logger.info(
        "[PRIVY] Sending %.6f ETH from wallet %s to %s on %s",
        amount_eth,
        wallet_id,
        to_address,
        caip2,
    )

    body = {
        "method": "eth_sendTransaction",
        "caip2": caip2,
        "params": {
            "transaction": {
                "to": to_address,
                "value": amount_wei_hex,
            }
        },
    }

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            "{}/wallets/{}/rpc".format(_BASE, wallet_id),
            headers=_headers(),
            json=body,
        )
        resp.raise_for_status()

    data = resp.json()
    tx_hash = data.get("data", {}).get("hash") or data.get("hash")
    logger.info("[PRIVY] Sent tx hash=%s", tx_hash)
    return {"hash": tx_hash, "caip2": caip2}


async def find_donation(
    wallet_id: str,
    donator_address: str,
    amount_wei: int,
    tolerance_wei: int = 1000,
) -> Optional[Dict[str, Any]]:
    """Search for a confirmed incoming transfer matching the donator and amount.

    Returns the matching transaction dict or None.
    """
    txns = await get_wallet_transactions(wallet_id)
    donator_lower = donator_address.lower()

    for tx in txns:
        details = tx.get("details")
        if not details:
            continue
        if details.get("type") != "transfer_received":
            continue
        if tx.get("status") != "confirmed":
            continue

        sender = (details.get("sender") or "").lower()
        if sender != donator_lower:
            continue

        raw_value = int(details.get("raw_value", "0"))
        if abs(raw_value - amount_wei) <= tolerance_wei:
            return {
                "transaction_hash": tx.get("transaction_hash"),
                "status": tx.get("status"),
                "amount_wei": str(raw_value),
                "caip2": tx.get("caip2", ""),
            }

    return None
