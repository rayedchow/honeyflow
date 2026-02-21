"""Seed script: generates 7-8 mock donations per project.

Run from the backend/ directory:
    python -m scripts.seed_donations
"""

import asyncio
import os
import random

from dotenv import load_dotenv

load_dotenv()

from app.services.donation_db import (
    clear_seeded_donations,
    init_donations_db,
    insert_donation,
)

# All project slugs (must match frontend/lib/projects.ts)
PROJECT_SLUGS = [
    "zero-knowledge-ml",
    "depin-mesh-network",
    "agent-framework",
    "recursive-stark-verifier",
    "solidity-fuzzer",
    "opengraph-protocol",
    "cross-chain-indexer",
    "dao-governance-kit",
    "fhe-analytics",
    "mev-shield",
    "self-sovereign-id",
    "audit-ai",
]


def random_address() -> str:
    """Generate a random Ethereum-style address."""
    return "0x" + os.urandom(20).hex()


def random_eth_amount() -> float:
    """Generate a random ETH amount weighted toward smaller values (0.01–2.0)."""
    # Use exponential distribution to skew toward smaller amounts
    raw = random.expovariate(3.0)  # lambda=3 → mean ~0.33
    amount = max(0.01, min(raw, 2.0))
    return round(amount, 4)


async def seed() -> None:
    await init_donations_db()

    print("Clearing existing seeded donations (tx_hash IS NULL)...")
    await clear_seeded_donations()

    total_inserted = 0

    for slug in PROJECT_SLUGS:
        num_donations = random.randint(7, 8)
        project_total = 0.0

        for _ in range(num_donations):
            addr = random_address()
            amount = random_eth_amount()
            await insert_donation(
                project_id=slug,
                donator_address=addr,
                amount_eth=amount,
                tx_hash=None,  # null marks these as seeded
            )
            project_total += amount
            total_inserted += 1

        print(f"  {slug}: {num_donations} donations, total {project_total:.4f} ETH")

    print(f"\nDone! Seeded {total_inserted} donations across {len(PROJECT_SLUGS)} projects.")


if __name__ == "__main__":
    asyncio.run(seed())
