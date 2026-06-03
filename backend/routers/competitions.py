from fastapi import APIRouter
from services.statsbomb_service import StatsBombService

router = APIRouter(prefix="/api/competitions", tags=["Competitions"])

@router.get("")
def get_competitions():
    """Retrieve all open/free competitions and seasons available on StatsBomb."""
    return StatsBombService.get_competitions()
