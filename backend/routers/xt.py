from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from services.statsbomb_service import StatsBombService
from services.xt_service import XTService

router = APIRouter(prefix="/api/xt", tags=["Expected Threat (xT)"])

@router.get("/match/{match_id}")
def get_match_xt(
    match_id: int,
    db: Session = Depends(get_db)
):
    """Get player expected threat (xT) leaderboards and top actions for a match."""
    try:
        data = XTService.get_match_xt_details(db, match_id)
        if not data["player_rankings"]:
            # Seed events if db cache empty
            StatsBombService.get_events(db, match_id)
            data = XTService.get_match_xt_details(db, match_id)
            
        if not data["player_rankings"]:
            raise HTTPException(status_code=404, detail="No xT actions recorded for this match.")
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch match xT: {e}")

@router.get("/heatmap")
def get_xt_heatmap(
    match_id: int = Query(..., description="Match ID"),
    team: str = Query(..., description="Team Name"),
    db: Session = Depends(get_db)
):
    """Generate expected threat heatmap for a team in a match. Returns base64 PNG."""
    events = StatsBombService.get_events(db, match_id)
    if not events:
        raise HTTPException(status_code=404, detail="No events found for this match.")
    
    try:
        img_base64 = XTService.generate_xt_heatmap(events, team)
        return {"image": img_base64}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate xT heatmap: {e}")

@router.get("/grid")
def get_xt_grid():
    """Retrieve the 12x8 Karun Singh Expected Threat (xT) grid matrix."""
    try:
        from services.chain_service import get_xt_grid_as_list
        return get_xt_grid_as_list()
    except Exception as e:
        from services.xt_service import XT_GRID
        return XT_GRID.tolist()
