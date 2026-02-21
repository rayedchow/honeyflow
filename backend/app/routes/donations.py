from fastapi import APIRouter

from app.schemas.donation import DonationsResponse
from app.services.donation_db import get_donations, get_donation_totals

router = APIRouter(tags=["donations"])


@router.get("/donations/{project_id}", response_model=DonationsResponse)
async def list_donations(project_id: str):
    """Return all donations for a project with totals."""
    donations = await get_donations(project_id)
    totals = await get_donation_totals(project_id)
    return DonationsResponse(
        donations=donations,
        total_eth=totals["total_eth"],
        count=totals["count"],
    )
