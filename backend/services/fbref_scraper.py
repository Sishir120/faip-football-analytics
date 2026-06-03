import time
import datetime
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import pandas as pd
import numpy as np
from sqlalchemy.orm import Session
from models.db_models import PlayerStats, TeamStats

LEAGUES_CONFIG = {
    "premier-league": {"id": 9, "name": "Premier-League"},
    "la-liga": {"id": 12, "name": "La-Liga"},
    "serie-a": {"id": 11, "name": "Serie-A"},
    "bundesliga": {"id": 20, "name": "Bundesliga"},
    "ligue-1": {"id": 13, "name": "Ligue-1"}
}

STAT_TYPES_CONFIG = {
    "standard": {"path": "stats", "table_id": "stats_standard"},
    "shooting": {"path": "shooting", "table_id": "stats_shooting"},
    "passing": {"path": "passing", "table_id": "stats_passing"},
    "passing_types": {"path": "passing_types", "table_id": "stats_passing_types"},
    "gca": {"path": "gca", "table_id": "stats_gca"},
    "defense": {"path": "defense", "table_id": "stats_defense"},
    "possession": {"path": "possession", "table_id": "stats_possession"},
    "misc": {"path": "misc", "table_id": "stats_misc"}
}

class FBRefScraper:
    @staticmethod
    def get_url(league: str, season: str, stat_type: str) -> str:
        """Construct the FBRef statistics page URL."""
        league_info = LEAGUES_CONFIG.get(league.lower())
        stat_info = STAT_TYPES_CONFIG.get(stat_type.lower())
        
        if not league_info or not stat_info:
            raise ValueError(f"Invalid league ({league}) or stat type ({stat_type})")
            
        comp_id = league_info["id"]
        league_name = league_info["name"]
        stat_path = stat_info["path"]
        
        # Determine current vs historic season (assuming current is e.g. 2025-2026 or latest)
        # FBRef format for historic is e.g., 2023-2024
        is_current = (season == "2025-2026" or season is None or season == "")
        
        if is_current:
            if stat_type.lower() == "standard":
                return f"https://fbref.com/en/comps/{comp_id}/stats/{league_name}-Stats"
            else:
                return f"https://fbref.com/en/comps/{comp_id}/{stat_path}/stats/{league_name}-Stats"
        else:
            if stat_type.lower() == "standard":
                return f"https://fbref.com/en/comps/{comp_id}/{season}/stats/{season}-{league_name}-Stats"
            else:
                return f"https://fbref.com/en/comps/{comp_id}/{season}/{stat_path}/stats/{season}-{league_name}-Stats"

    @classmethod
    def clean_fbref_table(cls, df: pd.DataFrame) -> pd.DataFrame:
        """Clean repeating headers and flatten MultiIndex columns from FBRef table."""
        # Flatten MultiIndex columns
        if isinstance(df.columns, pd.MultiIndex):
            new_cols = []
            for col in df.columns:
                level_0 = col[0]
                level_1 = col[1]
                if "Unnamed" in level_0 or "Level" in level_0:
                    new_cols.append(level_1)
                else:
                    new_cols.append(f"{level_0}_{level_1}")
            df.columns = new_cols
            
        # Clean rows repeating column headers
        if "Player" in df.columns:
            df = df[df["Player"] != "Player"].copy()
            
        # Reset index
        df = df.reset_index(drop=True)
        return df

    @classmethod
    def normalize_per_90(cls, df: pd.DataFrame) -> pd.DataFrame:
        """Normalizes absolute numeric stats to Per-90 minutes."""
        if "Min" not in df.columns or "Player" not in df.columns:
            return df
            
        # Convert Min to float, filling NaN with 0
        df["Min"] = pd.to_numeric(df["Min"].astype(str).str.replace(",", ""), errors="coerce").fillna(0.0)
        
        # Exclude columns that shouldn't be normalized (meta, percentages, identifiers)
        non_normalized_cols = ["Rk", "Player", "Nation", "Pos", "Squad", "Age", "Born", "Min", "Matches"]
        
        for col in df.columns:
            # Skip if explicitly excluded
            if col in non_normalized_cols:
                continue
                
            # Skip if it is already a per-90, percentage, or rate column
            col_lower = col.lower()
            if any(x in col_lower for x in ["90", "pct", "%", "per", "age", "born", "matches"]):
                continue
                
            # Try to convert to numeric
            original_series = pd.to_numeric(df[col], errors="coerce")
            if pd.api.types.is_numeric_dtype(original_series):
                # Calculate per 90: stat / (minutes / 90.0)
                # Safeguard: if Min is 0, set normalized stat to 0
                normalized_series = original_series.copy()
                mask = df["Min"] > 0
                normalized_series[mask] = (original_series[mask] / (df.loc[mask, "Min"] / 90.0)).round(3)
                normalized_series[~mask] = 0.0
                
                # Update column (keep original raw column under standard suffix or replace)
                # To maintain consistency, we replace the column with per-90 and name it
                df[col] = normalized_series
                
        return df

    @classmethod
    def check_cache_freshness(cls, db: Session, league: str, season: str, stat_type: str, is_player: bool = True) -> bool:
        """Checks if cached stats exist and are fresher than 7 days."""
        table = PlayerStats if is_player else TeamStats
        query = db.query(table).filter(
            table.competition == league,
            table.season == season,
            table.stat_type == stat_type
        )
        
        # Check the newest update timestamp
        newest = query.order_by(table.last_updated.desc()).first()
        if not newest:
            return False
            
        age = datetime.datetime.now() - newest.last_updated
        return age.days < 7

    @classmethod
    def scrape_player_stats(cls, db: Session, league: str, season: str, stat_type: str, force: bool = False) -> int:
        """Scrapes FBRef player stats and caches them in the database. Respects 3s rate limiting."""
        league = league.lower().strip()
        stat_type = stat_type.lower().strip()
        
        # Check cache freshness
        if not force and cls.check_cache_freshness(db, league, season, stat_type, is_player=True):
            print(f"Skipping scrape: Player stats cached and fresh for {league} {season} {stat_type}.")
            return 0
            
        url = cls.get_url(league, season, stat_type)
        print(f"Scraping FBRef Player Stats from: {url}")
        
        # Respect 3s rate limiting between requests
        time.sleep(3.0)
        
        # Use a persistent session with browser-like headers
        session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=2,
            status_forcelist=[429, 500, 502, 503, 504]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            "Referer": "https://fbref.com/",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "DNT": "1"
        }
        
        try:
            response = session.get(url, headers=headers, timeout=30)
        except Exception as req_err:
            print(f"Request error for {url}: {req_err}")
            return -1
            
        if response.status_code == 403:
            print(f"FBRef returned 403 Forbidden. The server may require browser cookies or Cloudflare challenge. Status: {response.status_code}")
            print(f"TIP: For automated scraping, consider using selenium with a headless browser and proper cookie management.")
            return -1
        elif response.status_code != 200:
            print(f"Failed to fetch FBRef page. Status: {response.status_code}")
            return -1
            
        try:
            # Parse all tables on the page
            dfs = pd.read_html(response.text)
            
            # Find the player stats table (must contain Player column)
            target_df = None
            table_id_config = STAT_TYPES_CONFIG.get(stat_type, {}).get("table_id")
            
            # Try to match by ID first in response text, or search by column contents
            for df in dfs:
                # FBRef MultiIndex flattening
                cleaned_df = cls.clean_fbref_table(df)
                if "Player" in cleaned_df.columns:
                    target_df = cleaned_df
                    break
                    
            if target_df is None:
                print("Could not find player stats table on the FBRef page.")
                return -1
                
            # Perform Per-90 normalization
            normalized_df = cls.normalize_per_90(target_df)
            
            # Replace NaNs with None for SQL insertion safety
            normalized_df = normalized_df.replace({np.nan: None})
            
            # Delete old cached stats for this specific comp/season/type
            db.query(PlayerStats).filter(
                PlayerStats.competition == league,
                PlayerStats.season == season,
                PlayerStats.stat_type == stat_type
            ).delete()
            
            # Insert new rows
            count = 0
            for _, row in normalized_df.iterrows():
                player_name = row.get("Player")
                if not player_name:
                    continue
                    
                squad = row.get("Squad", "Unknown")
                
                db_stats = PlayerStats(
                    player=player_name,
                    team=squad,
                    season=season,
                    competition=league,
                    stat_type=stat_type,
                    stats=row.to_dict()
                )
                db.add(db_stats)
                count += 1
                
            db.commit()
            print(f"Successfully scraped and cached {count} players.")
            return count
            
        except Exception as e:
            db.rollback()
            print(f"Error parsing FBRef table: {e}")
            return -1
