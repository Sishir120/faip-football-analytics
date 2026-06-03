from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from services.player_service import PlayerService
from services.metrics_service import MetricsService
from services.statsbomb_service import StatsBombService

router = APIRouter(prefix="/api/player", tags=["Player Analysis"])

@router.get("/radar")
def get_radar(
    player: str = Query(...),
    season: str = Query(...),
    competition: str = Query(...),
    position: str = Query("MF"),
    metrics: List[str] = Query(["Gls", "Ast", "xG", "xAG", "PrgP", "PrgC", "PrgR", "Tkl"]),
    db: Session = Depends(get_db)
):
    """Radar chart for a player vs positional peer group."""
    img = PlayerService.generate_radar(db, player, metrics, season, competition, position)
    return {"image": img}

@router.get("/compare")
def get_comparison_scatter(
    season: str = Query(...),
    competition: str = Query(...),
    x_metric: str = Query("xG"),
    y_metric: str = Query("xAG"),
    min_minutes: float = Query(900.0),
    highlight: Optional[str] = Query(None, description="Comma-separated player names to highlight"),
    db: Session = Depends(get_db)
):
    """Scatter all players on two metrics with optional highlights."""
    highlights = [h.strip() for h in highlight.split(",")] if highlight else []
    img = PlayerService.generate_comparison_scatter(
        db, season, competition, x_metric, y_metric, highlights, min_minutes
    )
    return {"image": img}

@router.get("/ppda")
def get_ppda(
    match_id: int = Query(...),
    team: str = Query(...),
    db: Session = Depends(get_db)
):
    """Calculate PPDA (pressing intensity) for a team in a match."""
    events = StatsBombService.get_events(db, match_id)
    if not events:
        raise HTTPException(status_code=404, detail="No events found for this match.")
    ppda = MetricsService.calculate_ppda(events, team)
    return {"team": team, "match_id": match_id, "ppda": ppda,
            "interpretation": "Lower = more pressing intensity"}

@router.get("/stats")
def get_player_stats(
    player: str = Query(...),
    season: str = Query(...),
    competition: str = Query(...),
    db: Session = Depends(get_db)
):
    """Fetch all cached FBRef per-90 stats for a player."""
    stats = PlayerService.get_player_stats(db, player, season, competition)
    if not stats or len(stats) <= 1:
        raise HTTPException(status_code=404, detail=f"No stats found for {player}.")
    return stats

@router.get("/similarity")
def get_player_similarity(
    player: str = Query(..., description="Target player name"),
    min_minutes: float = Query(180.0, description="Minimum minutes played"),
    strict_position: bool = Query(True, description="Strict positional group match"),
    limit: int = Query(5, description="Number of matches to return"),
    db: Session = Depends(get_db)
):
    """Find players with most similar profile using standardized Cosine Similarity on event stats."""
    from services.similarity_service import SimilarityService
    res = SimilarityService.get_similar_players(
        db, 
        target_player=player, 
        min_minutes=min_minutes, 
        strict_position=strict_position, 
        limit=limit
    )
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@router.get("/similarity/radar")
def get_similarity_radar(
    player1: str = Query(..., description="Target player"),
    player2: str = Query(..., description="Compare player"),
    db: Session = Depends(get_db)
):
    """Generate custom dual-player overlay radar chart comparing percentiles. Returns base64 PNG."""
    from services.similarity_service import SimilarityService
    img = SimilarityService.generate_comparison_radar(db, player1, player2)
    if not img:
        raise HTTPException(status_code=400, detail="Failed to generate comparison radar.")
    return {"image": img}

@router.get("/list")
def get_all_players(db: Session = Depends(get_db)):
    """Get list of unique players present in event logs."""
    from models.db_models import Event
    players = db.query(Event.player).filter(Event.player != None).distinct().order_by(Event.player).all()
    return [p[0] for p in players]


