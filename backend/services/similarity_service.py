import io
import base64
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mplsoccer import Radar
from sqlalchemy.orm import Session
from models.db_models import Event, Match
from services.statsbomb_service import StatsBombService
from services.xt_service import XTService
from sklearn.preprocessing import StandardScaler
from sklearn.metrics.pairwise import cosine_similarity

# Chunk size for streaming event queries — keeps peak RAM well below 512 MB
_CHUNK_SIZE = 2000

def _fig_to_base64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=150, facecolor="#0e1117")
    buf.seek(0)
    img_str = base64.b64encode(buf.read()).decode("utf-8")
    plt.close(fig)
    return img_str

class SimilarityService:
    
    @staticmethod
    def calculate_player_minutes(db: Session) -> dict:
        """
        Calculate exact minutes played for all players across cached matches.

        Uses a single bulk query for Starting XI and Substitution events only
        (instead of one query per match) to avoid the N+1 memory problem.
        """
        # ── 1. One query for all Starting XI events ─────────────────────────
        xi_events = (
            db.query(Event.match_id, Event.details)
            .filter(Event.type == "Starting XI")
            .all()
        )

        # match_id -> set of starter names
        match_starters: dict = {}
        for match_id, details in xi_events:
            details = details or {}
            lineup = (details.get("tactics") or {}).get("lineup") or []
            starters = match_starters.setdefault(match_id, set())
            for entry in lineup:
                name = entry.get("player", {}).get("name")
                if name:
                    starters.add(name)

        # ── 2. One query for all Substitution events ─────────────────────────
        sub_events = (
            db.query(Event.match_id, Event.player, Event.details)
            .filter(Event.type == "Substitution")
            .all()
        )

        # match_id -> {player_name -> sub_minute (positive=off, negative=on_minute)}
        match_subs: dict = {}
        for match_id, off_player, details in sub_events:
            details = details or {}
            minute = details.get("minute") or 90
            subs = match_subs.setdefault(match_id, {})
            if off_player:
                subs[off_player] = minute
            on_player = details.get("substitution_replacement")
            if on_player:
                subs[on_player] = -minute  # negative = came ON at this minute

        # ── 3. One lightweight query for all (match_id, player) pairs ────────
        player_match_pairs = (
            db.query(Event.match_id, Event.player)
            .filter(Event.player.isnot(None))
            .distinct()
            .all()
        )

        # ── 4. Accumulate minutes ─────────────────────────────────────────────
        player_minutes: dict = {}
        for match_id, player in player_match_pairs:
            starters = match_starters.get(match_id, set())
            subs = match_subs.get(match_id, {})

            if player in starters:
                mins = subs.get(player, 90)
            elif player in subs:
                on_min = -subs[player]
                mins = max(0, 90 - on_min)
            else:
                mins = 15  # fallback for minor-role appearances

            player_minutes[player] = player_minutes.get(player, 0) + mins

        return player_minutes

    @classmethod
    def compile_player_stats(cls, db: Session) -> pd.DataFrame:
        """
        Compile a rich player profile DataFrame from event logs.

        Streams events in chunks of _CHUNK_SIZE using yield_per() and flushes
        the SQLAlchemy identity map after each chunk to cap peak RAM usage.
        """
        # Quick count check — avoids loading anything if table is empty
        if db.query(Event.event_id).limit(1).first() is None:
            return pd.DataFrame()
            
        # Calculate minutes (single bulk query — no N+1)
        minutes_map = cls.calculate_player_minutes(db)

        # Aggregate stats — stream events in chunks to stay under 512 MB
        raw_stats = {}
        query = db.query(Event).yield_per(_CHUNK_SIZE).enable_eagerloads(False)
        for e in query:
            player = e.player
            team = e.team
            if not player or not team:
                continue
                
            if player not in raw_stats:
                raw_stats[player] = {
                    "player": player,
                    "team": team,
                    "position": "Unknown",
                    "position_counts": {},
                    "goals": 0,
                    "shots": 0,
                    "xg": 0.0,
                    "passes": 0,
                    "passes_completed": 0,
                    "key_passes": 0,
                    "assists": 0,
                    "carries": 0,
                    "pass_xt": 0.0,
                    "carry_xt": 0.0,
                    "tackles": 0,
                    "interceptions": 0,
                    "progressive_passes": 0,
                    "progressive_carries": 0,
                    "touches": 0
                }
                
            p = raw_stats[player]
            p["touches"] += 1
            
            # Position tracking
            pos = e.details.get("position") if e.details else None
            if pos:
                p["position_counts"][pos] = p["position_counts"].get(pos, 0) + 1
                
            etype = e.type
            outcome = e.outcome
            details = e.details or {}
            
            if etype == "Shot":
                p["shots"] += 1
                p["xg"] += (e.xg or 0.0)
                if outcome == "Goal":
                    p["goals"] += 1
            elif etype == "Pass":
                p["passes"] += 1
                is_completed = (outcome is None or outcome == "")
                if is_completed:
                    p["passes_completed"] += 1
                    # xT
                    xt_val = XTService.calculate_event_xt("Pass", e.x, e.y, outcome, details)
                    p["pass_xt"] += xt_val
                    # Progressive pass
                    if e.x is not None and "pass_end_location" in details:
                        end_x = details["pass_end_location"][0]
                        if end_x > 40 and (end_x - e.x) >= 10:
                            p["progressive_passes"] += 1
                # Key pass / Assist
                if details.get("pass_shot_assist") or details.get("pass_goal_assist"):
                    p["key_passes"] += 1
                if details.get("pass_goal_assist"):
                    p["assists"] += 1
            elif etype == "Carry":
                p["carries"] += 1
                # xT
                xt_val = XTService.calculate_event_xt("Carry", e.x, e.y, outcome, details)
                p["carry_xt"] += xt_val
                # Progressive carry
                if e.x is not None and "carry_end_location" in details:
                    end_x = details["carry_end_location"][0]
                    if end_x > 40 and (end_x - e.x) >= 10:
                        p["progressive_carries"] += 1
            elif etype == "Interception":
                p["interceptions"] += 1
            elif etype == "Duel" and details.get("duel_type") == "Tackle":
                p["tackles"] += 1

        # Flush the SQLAlchemy identity map periodically so GC can reclaim ORM
        # objects that are no longer referenced (yield_per batches them internally,
        # but expunge_all ensures no lingering references after the loop).
        db.expunge_all()

        # Resolve primary position and map to groups
        # DF = Defender, MF = Midfielder, FW = Forward, GK = Goalkeeper
        for player, p in raw_stats.items():
            counts = p["position_counts"]
            if counts:
                primary = max(counts, key=counts.get)
                p["position"] = primary
            else:
                p["position"] = "Unknown"
                
            # Clean counts
            del p["position_counts"]
            
        df = pd.DataFrame(list(raw_stats.values()))
        
        # Merge minutes
        df["minutes"] = df["player"].map(minutes_map).fillna(15.0)
        df["minutes"] = df["minutes"].clip(lower=15.0) # avoid division by zero
        
        # Position mapping
        def get_pos_group(pos_name):
            p_lower = str(pos_name).lower()
            if "goalkeeper" in p_lower:
                return "GK"
            if any(x in p_lower for x in ["back", "center back", "defender"]):
                return "DF"
            if any(x in p_lower for x in ["midfield", "wing back"]):
                return "MF"
            if any(x in p_lower for x in ["forward", "striker", "wing", "wing", "center forward"]):
                return "FW"
            return "MF" # default
            
        df["position_group"] = df["position"].apply(get_pos_group)
        
        # Calculate Per-90 and rate stats
        df["goals_per90"] = (df["goals"] / (df["minutes"] / 90.0)).round(3)
        df["shots_per90"] = (df["shots"] / (df["minutes"] / 90.0)).round(3)
        df["xg_per90"] = (df["xg"] / (df["minutes"] / 90.0)).round(3)
        df["passes_per90"] = (df["passes"] / (df["minutes"] / 90.0)).round(3)
        df["pass_accuracy"] = (df["passes_completed"] / df["passes"].replace(0, 1) * 100.0).round(1)
        df["key_passes_per90"] = (df["key_passes"] / (df["minutes"] / 90.0)).round(3)
        df["assists_per90"] = (df["assists"] / (df["minutes"] / 90.0)).round(3)
        df["carries_per90"] = (df["carries"] / (df["minutes"] / 90.0)).round(3)
        df["pass_xt_per90"] = (df["pass_xt"] / (df["minutes"] / 90.0)).round(3)
        df["carry_xt_per90"] = (df["carry_xt"] / (df["minutes"] / 90.0)).round(3)
        df["total_xt_per90"] = ((df["pass_xt"] + df["carry_xt"]) / (df["minutes"] / 90.0)).round(3)
        df["tackles_per90"] = (df["tackles"] / (df["minutes"] / 90.0)).round(3)
        df["interceptions_per90"] = (df["interceptions"] / (df["minutes"] / 90.0)).round(3)
        df["progressive_passes_per90"] = (df["progressive_passes"] / (df["minutes"] / 90.0)).round(3)
        df["progressive_carries_per90"] = (df["progressive_carries"] / (df["minutes"] / 90.0)).round(3)
        df["touches_per90"] = (df["touches"] / (df["minutes"] / 90.0)).round(3)
        
        return df

    @classmethod
    def get_similar_players(cls, db: Session, target_player: str, min_minutes: float = 180.0,
                            strict_position: bool = True, limit: int = 5) -> dict:
        """Find players with most similar statistical profile using standardized Cosine Similarity."""
        df = cls.compile_player_stats(db)
        if df.empty:
            return {"error": "No event logs present in database. Seed matches first."}
            
        # Try to find target player (exact or substring)
        target_row = df[df["player"].str.lower().str.contains(target_player.lower())]
        if target_row.empty:
            return {"error": f"Target player '{target_player}' not found in database."}
            
        target_row = target_row.iloc[0]
        target_name = target_row["player"]
        target_group = target_row["position_group"]
        
        # Apply filters
        # Keep target player in candidates for distance check, then filter out
        candidates = df[df["minutes"] >= min_minutes].copy()
        if target_name not in candidates["player"].values:
            # force include target player if minutes are low
            candidates = pd.concat([candidates, pd.DataFrame([target_row])]).drop_duplicates(subset=["player"])
            
        if strict_position:
            candidates = candidates[candidates["position_group"] == target_group].copy()
            
        if len(candidates) < 2:
            return {"error": "Insufficient candidates matching positional/minutes criteria."}
            
        # Metric columns to use for comparison vector
        feature_cols = [
            "goals_per90", "shots_per90", "xg_per90", "passes_per90", "pass_accuracy",
            "key_passes_per90", "assists_per90", "carries_per90", "pass_xt_per90",
            "carry_xt_per90", "tackles_per90", "interceptions_per90",
            "progressive_passes_per90", "progressive_carries_per90", "touches_per90"
        ]
        
        X = candidates[feature_cols].fillna(0.0).values
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # Cosine Similarity Matrix
        sim_matrix = cosine_similarity(X_scaled)
        
        # Find target player index in candidates
        candidates = candidates.reset_index(drop=True)
        target_idx = candidates[candidates["player"] == target_name].index[0]
        
        # Similarity array
        sim_scores = sim_matrix[target_idx]
        candidates["similarity"] = sim_scores
        
        # Sort and filter out target
        results = candidates[candidates["player"] != target_name].copy()
        results = results.sort_values(by="similarity", ascending=False)
        
        top_matches = []
        for _, row in results.head(limit).iterrows():
            top_matches.append({
                "player": row["player"],
                "team": row["team"],
                "position": row["position"],
                "position_group": row["position_group"],
                "minutes": int(row["minutes"]),
                "similarity_score": round(float(row["similarity"] * 100.0), 1),
                "stats": {col: float(row[col]) for col in feature_cols}
            })
            
        return {
            "target_player": {
                "player": target_name,
                "team": target_row["team"],
                "position": target_row["position"],
                "position_group": target_group,
                "minutes": int(target_row["minutes"]),
                "stats": {col: float(target_row[col]) for col in feature_cols}
            },
            "similarity_metrics": feature_cols,
            "similar_players": top_matches
        }

    @classmethod
    def generate_comparison_radar(cls, db: Session, player1: str, player2: str) -> str:
        """Generate a comparison radar chart overlaying two players' percentile ranks."""
        df = cls.compile_player_stats(db)
        if df.empty:
            return ""
            
        row1 = df[df["player"].str.lower().str.contains(player1.lower())]
        row2 = df[df["player"].str.lower().str.contains(player2.lower())]
        
        if row1.empty or row2.empty:
            fig, ax = plt.subplots(figsize=(8, 8), facecolor="#0e1117")
            ax.text(0.5, 0.5, "Player not found in database.", color="#ffffff", ha="center", va="center")
            ax.axis("off")
            return _fig_to_base64(fig)
            
        row1 = row1.iloc[0]
        row2 = row2.iloc[0]
        
        # Metrics to display on the radar (abbreviated labels)
        metrics_map = {
            "xg_per90": "xG",
            "goals_per90": "Goals",
            "passes_per90": "Passes",
            "pass_accuracy": "Pass %",
            "key_passes_per90": "Key Pass",
            "total_xt_per90": "xT",
            "progressive_passes_per90": "Prog Pass",
            "progressive_carries_per90": "Prog Carry",
            "touches_per90": "Touches",
            "tackles_per90": "Tackles",
            "interceptions_per90": "Intercept"
        }
        
        metrics = list(metrics_map.keys())
        labels = list(metrics_map.values())
        
        val1, val2 = [], []
        low_vals, high_vals = [], []
        
        for m in metrics:
            val1.append(float(row1[m]))
            val2.append(float(row2[m]))
            
            # Min/max ranges from the entire population
            col_series = pd.to_numeric(df[m], errors="coerce").dropna()
            low_vals.append(float(col_series.min()))
            high_vals.append(float(col_series.max() if col_series.max() > col_series.min() else col_series.min() + 1.0))
            
        # Draw Radar
        radar = Radar(
            params=labels,
            min_range=low_vals,
            max_range=high_vals,
            num_rings=5,
            ring_width=1,
            center_circle_radius=1
        )
        
        fig, ax = radar.setup_axis(figsize=(8, 8), facecolor="#0e1117")
        fig.patch.set_facecolor('#0e1117')
        
        radar.draw_circles(ax=ax, facecolor="#181d28", edgecolor="#2d3748")
        
        # Overlay Player 1 (Target: Blue)
        radar.draw_radar(
            val1, 
            ax=ax, 
            kwargs_radar={"facecolor": "#38bdf840", "edgecolor": "#38bdf8", "linewidth": 2, "label": row1["player"]},
            kwargs_rings={"facecolor": "none", "edgecolor": "none"}
        )
        
        # Overlay Player 2 (Similar Match: Pink/Red)
        radar.draw_radar(
            val2, 
            ax=ax, 
            kwargs_radar={"facecolor": "#f43f5e40", "edgecolor": "#f43f5e", "linewidth": 2, "label": row2["player"]},
            kwargs_rings={"facecolor": "none", "edgecolor": "none"}
        )
        
        radar.draw_param_labels(ax=ax, color="#c1c9d2", fontsize=10)
        radar.draw_range_labels(ax=ax, color="#718096", fontsize=8)
        
        # Set Title and Legend
        ax.set_title(f"Scouting Comparison Profile", color='#ffffff', fontsize=14, weight='bold', pad=25)
        
        # Custom legend
        import matplotlib.patches as mpatches
        patch1 = mpatches.Patch(color='#38bdf8', label=f"{row1['player']} ({row1['team']})")
        patch2 = mpatches.Patch(color='#f43f5e', label=f"{row2['player']} ({row2['team']})")
        legend = ax.legend(handles=[patch1, patch2], loc='lower center', bbox_to_anchor=(0.5, -0.1), ncol=2, frameon=True, facecolor='#0e1117', edgecolor='#2d3748')
        for text in legend.get_texts():
            text.set_color('#ffffff')
            text.set_size(9)
            
        return _fig_to_base64(fig)
