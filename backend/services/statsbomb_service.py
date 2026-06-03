import numpy as np
import pandas as pd
from statsbombpy import sb
from sqlalchemy.orm import Session
from models.db_models import Match, Event

def clean_value(val):
    if isinstance(val, (list, tuple, np.ndarray)):
        return [clean_value(x) for x in val]
    if isinstance(val, dict):
        return {k: clean_value(v) for k, v in val.items()}
    if pd.isna(val) or (isinstance(val, float) and (np.isnan(val) or np.isinf(val))):
        return None
    return val

def clean_row(row_dict):
    return {k: clean_value(v) for k, v in row_dict.items()}

class StatsBombService:
    @staticmethod
    def get_competitions():
        """Fetch all available free competitions from StatsBomb."""
        try:
            df = sb.competitions()
            # Convert to list of dicts
            return df.to_dict(orient="records")
        except Exception as e:
            print(f"Error fetching competitions: {e}")
            return []

    @staticmethod
    def get_matches(db: Session, competition_id: int, season_id: int):
        """Fetch matches for competition/season from database, or cache from API if missing."""
        # Query cache
        cached_matches = db.query(Match).filter(
            Match.competition_id == competition_id,
            Match.season_id == season_id
        ).all()

        if cached_matches:
            return [
                {
                    "match_id": m.match_id,
                    "competition_id": m.competition_id,
                    "season_id": m.season_id,
                    "competition": m.competition,
                    "season": m.season,
                    "home_team": m.home_team,
                    "away_team": m.away_team,
                    "date": m.date,
                    "home_score": m.home_score,
                    "away_score": m.away_score
                }
                for m in cached_matches
            ]

        # Fetch from API
        try:
            df = sb.matches(competition_id=competition_id, season_id=season_id)
            if df.empty:
                return []
            
            matches_list = []
            for _, row in df.iterrows():
                row_dict = clean_row(row.to_dict())
                match_id = int(row_dict["match_id"])
                
                # Create DB instance
                db_match = Match(
                    match_id=match_id,
                    competition_id=competition_id,
                    season_id=season_id,
                    competition=row_dict.get("competition"),
                    season=row_dict.get("season"),
                    home_team=row_dict.get("home_team"),
                    away_team=row_dict.get("away_team"),
                    date=row_dict.get("match_date"),
                    home_score=row_dict.get("home_score", 0),
                    away_score=row_dict.get("away_score", 0)
                )
                db.merge(db_match)
                matches_list.append({
                    "match_id": db_match.match_id,
                    "competition_id": db_match.competition_id,
                    "season_id": db_match.season_id,
                    "competition": db_match.competition,
                    "season": db_match.season,
                    "home_team": db_match.home_team,
                    "away_team": db_match.away_team,
                    "date": db_match.date,
                    "home_score": db_match.home_score,
                    "away_score": db_match.away_score
                })
            
            db.commit()
            return matches_list
        except Exception as e:
            db.rollback()
            print(f"Error fetching matches for comp {competition_id} season {season_id}: {e}")
            return []

    @staticmethod
    def get_events(db: Session, match_id: int):
        """Fetch all events for a match. Retrieve from DB cache or load from API."""
        # Query DB cache
        cached_events = db.query(Event).filter(Event.match_id == match_id).all()
        if cached_events:
            return [
                {
                    "event_id": e.event_id,
                    "match_id": e.match_id,
                    "type": e.type,
                    "player": e.player,
                    "team": e.team,
                    "x": e.x,
                    "y": e.y,
                    "timestamp": e.timestamp,
                    "outcome": e.outcome,
                    "xg": e.xg,
                    "details": e.details
                }
                for e in cached_events
            ]

        # Fetch from API
        try:
            df = sb.events(match_id=match_id)
            if df.empty:
                return []
            
            events_list = []
            for _, row in df.iterrows():
                row_dict = clean_row(row.to_dict())
                
                # Location handling
                location = row_dict.get("location")
                x, y = None, None
                if isinstance(location, list) and len(location) >= 2:
                    x, y = location[0], location[1]
                
                event_id = str(row_dict.get("id"))
                event_type = str(row_dict.get("type", "Unknown"))
                
                # Determine outcome
                outcome = (
                    row_dict.get("shot_outcome") or 
                    row_dict.get("pass_outcome") or 
                    row_dict.get("interception_outcome") or 
                    row_dict.get("duel_outcome") or 
                    row_dict.get("goalkeeper_outcome") or 
                    row_dict.get("clearance_outcome")
                )
                
                # Extract StatsBomb xG
                xg = row_dict.get("shot_statsbomb_xg")
                
                # Store all other properties in a JSON details column
                details = {}
                for k, v in row_dict.items():
                    if k not in ["id", "match_id", "type", "player", "team", "location", "timestamp"]:
                        details[k] = v
                
                db_event = Event(
                    event_id=event_id,
                    match_id=match_id,
                    type=event_type,
                    player=row_dict.get("player"),
                    team=row_dict.get("team"),
                    x=x,
                    y=y,
                    timestamp=row_dict.get("timestamp"),
                    outcome=outcome,
                    xg=xg,
                    details=details
                )
                db.merge(db_event)
                events_list.append({
                    "event_id": db_event.event_id,
                    "match_id": db_event.match_id,
                    "type": db_event.type,
                    "player": db_event.player,
                    "team": db_event.team,
                    "x": db_event.x,
                    "y": db_event.y,
                    "timestamp": db_event.timestamp,
                    "outcome": db_event.outcome,
                    "xg": db_event.xg,
                    "details": db_event.details
                })
            
            db.commit()
            return events_list
        except Exception as e:
            db.rollback()
            print(f"Error fetching events for match {match_id}: {e}")
            return []
