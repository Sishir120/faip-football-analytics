from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import pandas as pd
import io
from database import get_db
from models.db_models import PlayerStats
from services.fbref_scraper import FBRefScraper, STAT_TYPES_CONFIG

router = APIRouter(prefix="/api/scrape", tags=["Scraping Control"])

# Global dictionary to track background scraping status
scraping_state = {
    "is_running": False,
    "league": None,
    "season": None,
    "current_type": None,
    "completed_types": [],
    "total_records": 0,
    "error": None
}

def run_fbref_scrape_task(league: str, season: str, db_session_factory, force: bool = False):
    global scraping_state
    scraping_state["is_running"] = True
    scraping_state["league"] = league
    scraping_state["season"] = season
    scraping_state["completed_types"] = []
    scraping_state["total_records"] = 0
    scraping_state["error"] = None
    
    # We open a dedicated DB session for the background thread
    db: Session = db_session_factory()
    try:
        # Loop over all 8 stats types
        all_types = list(STAT_TYPES_CONFIG.keys())
        for stat_type in all_types:
            scraping_state["current_type"] = stat_type
            print(f"Background Scraper: Scraping {league} {season} {stat_type}...")
            
            result = FBRefScraper.scrape_player_stats(db, league, season, stat_type, force=force)
            
            if result >= 0:
                scraping_state["completed_types"].append(stat_type)
                scraping_state["total_records"] += result
            else:
                print(f"Background Scraper: Failed for type {stat_type}")
                
        print("Background Scraper: Scrape completed successfully!")
    except Exception as e:
        scraping_state["error"] = str(e)
        print(f"Background Scraper Exception: {e}")
    finally:
        scraping_state["is_running"] = False
        db.close()

@router.post("/fbref")
def trigger_fbref_scrape(
    league: str = Query(..., description="e.g., premier-league, la-liga, serie-a, bundesliga, ligue-1"),
    season: str = Query(..., description="e.g., 2023-2024, 2024-2025, 2025-2026"),
    force: bool = Query(False, description="Force scraping even if cached data is fresh"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """Trigger a multi-page scraping process for a league and season in the background."""
    global scraping_state
    if scraping_state["is_running"]:
        raise HTTPException(
            status_code=400, 
            detail=f"A scraping task is already running for {scraping_state['league']} {scraping_state['season']}."
        )
        
    # Trigger background execution
    from database import SessionLocal
    background_tasks.add_task(
        run_fbref_scrape_task, 
        league=league, 
        season=season, 
        db_session_factory=SessionLocal, 
        force=force
    )
    
    return {
        "message": "Scrape task triggered in the background.",
        "league": league,
        "season": season
    }

@router.get("/status")
def get_scrape_status():
    """Retrieve the progress status of the current scraping task."""
    return scraping_state

@router.get("/cached")
def get_cached_datasets(db: Session = Depends(get_db)):
    """Retrieve lists of cached player stats datasets and their record counts."""
    results = db.query(
        PlayerStats.competition,
        PlayerStats.season,
        PlayerStats.stat_type,
        PlayerStats.last_updated
    ).group_by(
        PlayerStats.competition,
        PlayerStats.season,
        PlayerStats.stat_type
    ).all()
    
    cached_list = []
    for comp, season, stat_type, last_updated in results:
        # Get count
        cnt = db.query(PlayerStats).filter(
            PlayerStats.competition == comp,
            PlayerStats.season == season,
            PlayerStats.stat_type == stat_type
        ).count()
        
        cached_list.append({
            "league": comp,
            "season": season,
            "stat_type": stat_type,
            "record_count": cnt,
            "last_updated": last_updated.strftime("%Y-%m-%d %H:%M:%S") if last_updated else None
        })
        
    return cached_list

@router.get("/export")
def export_dataset_csv(
    league: str = Query(..., description="League Name"),
    season: str = Query(..., description="Season"),
    stat_type: str = Query(..., description="Stat Type"),
    db: Session = Depends(get_db)
):
    """Exports a cached player stats dataset as a downloadable CSV file."""
    records = db.query(PlayerStats).filter(
        PlayerStats.competition == league,
        PlayerStats.season == season,
        PlayerStats.stat_type == stat_type
    ).all()
    
    if not records:
        raise HTTPException(status_code=404, detail="No cached data found matching these parameters.")
        
    # Flatten records stats dict
    stats_list = [r.stats for r in records]
    df = pd.DataFrame(stats_list)
    
    # Save to a memory stream
    stream = io.StringIO()
    df.to_csv(stream, index=False)
    response = StreamingResponse(
        iter([stream.getvalue()]), 
        media_type="text/csv"
    )
    filename = f"fbref_{league}_{season}_{stat_type}.csv"
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response
