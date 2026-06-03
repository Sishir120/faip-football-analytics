import os
import sys

# Add backend directory to system path for importing modules
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.append(backend_dir)

from database import engine, SessionLocal, Base
import models.db_models
from services.statsbomb_service import StatsBombService

def seed():
    print("Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        print("Fetching competitions...")
        competitions = StatsBombService.get_competitions()
        print(f"Found {len(competitions)} competitions.")
        
        # We will seed matches for La Liga 2018/2019 (comp: 11, season: 4)
        comp_id = 11
        season_id = 4
        
        print(f"Caching matches for La Liga 2018/2019 (Competition ID: {comp_id}, Season ID: {season_id})...")
        matches = StatsBombService.get_matches(db, comp_id, season_id)
        print(f"Cached {len(matches)} matches.")
        
        if not matches:
            print("No matches returned. Make sure you have an internet connection.")
            return
            
        # Cache events for the first 15 matches to provide a rich dataset for ML model training
        num_matches_to_cache_events = 15
        for i in range(min(num_matches_to_cache_events, len(matches))):
            m = matches[i]
            # Check database directly first to optimize print logs
            from models.db_models import Event
            is_cached = db.query(Event).filter(Event.match_id == m["match_id"]).first() is not None
            
            if is_cached:
                print(f"[{i+1}/{num_matches_to_cache_events}] Match ID {m['match_id']} ({m['home_team']} vs {m['away_team']}) is already cached. Skipping.")
            else:
                print(f"[{i+1}/{num_matches_to_cache_events}] Caching events for match ID {m['match_id']} ({m['home_team']} vs {m['away_team']})...")
                events = StatsBombService.get_events(db, m["match_id"])
                print(f"Successfully cached {len(events)} events.")
            
        print("Seeding completed successfully!")
        
    except Exception as e:
        print(f"Error during seeding: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
