from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models.db_models import Match
from services.statsbomb_service import StatsBombService
from services.viz_service import VizService

router = APIRouter(prefix="/api/viz", tags=["Visualizations"])

@router.get("/shot-map")
def get_shot_map(
    match_id: int = Query(..., description="Match ID"),
    team: str = Query(..., description="Team Name"),
    db: Session = Depends(get_db)
):
    """Generate shot map for a team in a match. Returns base64 PNG."""
    events = StatsBombService.get_events(db, match_id)
    if not events:
        raise HTTPException(status_code=404, detail="No events found for this match.")
    
    try:
        img_base64 = VizService.generate_shot_map(events, team)
        return {"image": img_base64}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate shot map: {e}")

@router.get("/pass-map")
def get_pass_map(
    match_id: int = Query(..., description="Match ID"),
    player: str = Query(None, description="Player Name (Optional)"),
    team: str = Query(None, description="Team Name (Optional)"),
    db: Session = Depends(get_db)
):
    """Generate pass map for a player or team in a match. Returns base64 PNG."""
    if not player and not team:
        raise HTTPException(status_code=400, detail="Must provide either player or team query parameter.")
    
    events = StatsBombService.get_events(db, match_id)
    if not events:
        raise HTTPException(status_code=404, detail="No events found for this match.")
    
    try:
        img_base64 = VizService.generate_pass_map(events, player=player, team=team)
        return {"image": img_base64}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate pass map: {e}")

@router.get("/heatmap")
def get_heatmap(
    match_id: int = Query(..., description="Match ID"),
    player: str = Query(..., description="Player Name"),
    db: Session = Depends(get_db)
):
    """Generate touch heatmap for a player in a match. Returns base64 PNG."""
    events = StatsBombService.get_events(db, match_id)
    if not events:
        raise HTTPException(status_code=404, detail="No events found for this match.")
    
    try:
        img_base64 = VizService.generate_heatmap(events, player)
        return {"image": img_base64}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate heatmap: {e}")

@router.get("/xg-timeline")
def get_xg_timeline(
    match_id: int = Query(..., description="Match ID"),
    db: Session = Depends(get_db)
):
    """Generate cumulative xG timeline for a match. Returns Plotly JSON."""
    events = StatsBombService.get_events(db, match_id)
    if not events:
        raise HTTPException(status_code=404, detail="No events found for this match.")
    
    # Get match details for team names
    match = db.query(Match).filter(Match.match_id == match_id).first()
    home_team = match.home_team if match else "Home Team"
    away_team = match.away_team if match else "Away Team"
    
    try:
        plotly_dict = VizService.generate_xg_timeline(events, home_team, away_team)
        return plotly_dict
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate xG timeline: {e}")

@router.get("/pass-network")
def get_pass_network(
    match_id: int = Query(..., description="Match ID"),
    team: str = Query(..., description="Team Name"),
    db: Session = Depends(get_db)
):
    """Generate average position pass network for a team in a match. Returns base64 PNG."""
    events = StatsBombService.get_events(db, match_id)
    if not events:
        raise HTTPException(status_code=404, detail="No events found for this match.")
    
    try:
        img_base64 = VizService.generate_pass_network(events, team)
        return {"image": img_base64}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate pass network: {e}")
