import io
import base64
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mplsoccer import Pitch
from sqlalchemy.orm import Session
from models.db_models import Match, Event
from services.statsbomb_service import StatsBombService

# Karun Singh 12x8 Expected Threat (xT) Grid
# Rows represent y-axis zones (8 rows, each 10 units high, from y=0 to y=80)
# Columns represent x-axis zones (12 columns, each 10 units wide, from x=0 to x=120)
XT_GRID = np.array([
    [0.00638303, 0.00779601, 0.00840585, 0.0094332 , 0.0108872 , 0.0125403 , 0.0142340 , 0.0168611 , 0.0195540 , 0.0245222 , 0.0332687 , 0.0410669],
    [0.00750111, 0.00877940, 0.00942430, 0.0105947 , 0.0121471 , 0.0138458 , 0.0160181 , 0.0180376 , 0.0220950 , 0.0270638 , 0.0390046 , 0.0490609],
    [0.00887994, 0.00977745, 0.01001300, 0.0111053 , 0.0126920 , 0.0145213 , 0.0168223 , 0.0220017 , 0.0267866 , 0.0346890 , 0.0530087 , 0.0664456],
    [0.00941056, 0.01083110, 0.01016540, 0.0113247 , 0.0128926 , 0.0150359 , 0.0174262 , 0.0227566 , 0.0296019 , 0.0406838 , 0.0638759 , 0.0815645],
    [0.00941056, 0.01083110, 0.01016540, 0.0113247 , 0.0128926 , 0.0150359 , 0.0174262 , 0.0227566 , 0.0296019 , 0.0406838 , 0.0638759 , 0.0815645],
    [0.00887994, 0.00977745, 0.01001300, 0.0111053 , 0.0126920 , 0.0145213 , 0.0168223 , 0.0220017 , 0.0267866 , 0.0346890 , 0.0530087 , 0.0664456],
    [0.00750111, 0.00877940, 0.00942430, 0.0105947 , 0.0121471 , 0.0138458 , 0.0160181 , 0.0180376 , 0.0220950 , 0.0270638 , 0.0390046 , 0.0490609],
    [0.00638303, 0.00779601, 0.00840585, 0.0094332 , 0.0108872 , 0.0125403 , 0.0142340 , 0.0168611 , 0.0195540 , 0.0245222 , 0.0332687 , 0.0410669]
])

class XTService:

    @staticmethod
    def get_cell_xt(x: float, y: float) -> float:
        """Map standard coordinates (x: 0-120, y: 0-80) to cell xT value."""
        if x is None or y is None or pd.isna(x) or pd.isna(y):
            return 0.0
        # Determine 10-yard columns and rows
        col = int(x / 10)
        row = int(y / 10)
        # Clamping to valid range
        col = max(0, min(col, 11))
        row = max(0, min(row, 7))
        return float(XT_GRID[row][col])

    @classmethod
    def calculate_event_xt(cls, event_type: str, x: float, y: float, outcome: str, details: dict) -> float:
        """Calculate the change in Expected Threat (xT) for a given event."""
        if x is None or y is None or pd.isna(x) or pd.isna(y):
            return 0.0
        
        details = details or {}
        
        if event_type == "Pass":
            # Only count completed passes
            if outcome is not None and outcome != "":
                return 0.0
            
            end_loc = details.get("pass_end_location")
            if isinstance(end_loc, list) and len(end_loc) >= 2:
                ex, ey = end_loc[0], end_loc[1]
                start_xt = cls.get_cell_xt(x, y)
                end_xt = cls.get_cell_xt(ex, ey)
                return end_xt - start_xt
                
        elif event_type == "Carry":
            end_loc = details.get("carry_end_location")
            if isinstance(end_loc, list) and len(end_loc) >= 2:
                ex, ey = end_loc[0], end_loc[1]
                start_xt = cls.get_cell_xt(x, y)
                end_xt = cls.get_cell_xt(ex, ey)
                return end_xt - start_xt
                
        return 0.0

    @classmethod
    def get_match_xt_details(cls, db: Session, match_id: int) -> dict:
        """Fetch match events, compute xT per action, and aggregate stats."""
        events = StatsBombService.get_events(db, match_id)
        match = db.query(Match).filter(Match.match_id == match_id).first()
        
        home_team = match.home_team if match else "Home Team"
        away_team = match.away_team if match else "Away Team"
        
        player_stats = {}
        top_actions = []
        
        team_stats = {
            "home": {"name": home_team, "pass_xt": 0.0, "carry_xt": 0.0, "total_xt": 0.0},
            "away": {"name": away_team, "pass_xt": 0.0, "carry_xt": 0.0, "total_xt": 0.0}
        }
        
        for e in events:
            etype = e.get("type")
            if etype not in ["Pass", "Carry"]:
                continue
                
            x, y = e.get("x"), e.get("y")
            outcome = e.get("outcome")
            details = e.get("details") or {}
            player = e.get("player")
            team = e.get("team")
            
            if not player or not team:
                continue
                
            xt_val = cls.calculate_event_xt(etype, x, y, outcome, details)
            if abs(xt_val) < 1e-5:
                continue
                
            # Initialize player record if not present
            if player not in player_stats:
                player_stats[player] = {
                    "player": player,
                    "team": team,
                    "pass_xt": 0.0,
                    "carry_xt": 0.0,
                    "total_xt": 0.0
                }
                
            is_home = (team == home_team)
            team_key = "home" if is_home else "away"
            
            # Aggregate stats
            if etype == "Pass":
                player_stats[player]["pass_xt"] += xt_val
                team_stats[team_key]["pass_xt"] += xt_val
                end_loc = details.get("pass_end_location")
            else:
                player_stats[player]["carry_xt"] += xt_val
                team_stats[team_key]["carry_xt"] += xt_val
                end_loc = details.get("carry_end_location")
                
            player_stats[player]["total_xt"] += xt_val
            team_stats[team_key]["total_xt"] += xt_val
            
            # Record detailed action details for mapping if positive
            if xt_val > 0.005:
                # Get minute and second
                timestamp_str = e.get("timestamp") or "00:00:00"
                parts = timestamp_str.split(":")
                minute = int(parts[1]) if len(parts) > 1 else 0
                second = int(parts[2].split(".")[0]) if len(parts) > 2 else 0
                
                top_actions.append({
                    "player": player,
                    "team": team,
                    "type": etype,
                    "minute": minute,
                    "second": second,
                    "x": x,
                    "y": y,
                    "end_x": end_loc[0],
                    "end_y": end_loc[1],
                    "xt": round(xt_val, 4)
                })
                
        # Clean team stats floats
        for key in ["home", "away"]:
            for subkey in ["pass_xt", "carry_xt", "total_xt"]:
                team_stats[key][subkey] = round(team_stats[key][subkey], 4)
                
        # Format and sort players list
        rankings = list(player_stats.values())
        for r in rankings:
            r["pass_xt"] = round(r["pass_xt"], 4)
            r["carry_xt"] = round(r["carry_xt"], 4)
            r["total_xt"] = round(r["total_xt"], 4)
            
        rankings = sorted(rankings, key=lambda p: p["total_xt"], reverse=True)
        top_actions = sorted(top_actions, key=lambda a: a["xt"], reverse=True)[:30] # Top 30 highest threat actions
        
        return {
            "home_team": home_team,
            "away_team": away_team,
            "team_stats": team_stats,
            "player_rankings": rankings,
            "top_actions": top_actions
        }

    @classmethod
    def generate_xt_heatmap(cls, events: list, team: str) -> str:
        """Generates an Expected Threat heatmap showing where threat was successfully created."""
        df = pd.DataFrame(events)
        
        pitch = Pitch(
            pitch_type='statsbomb', 
            pitch_color='#0e1117', 
            line_color='#c1c9d2', 
            goal_type='line'
        )
        fig, ax = pitch.draw(figsize=(10, 7))
        fig.patch.set_facecolor('#0e1117')
        
        team_events = df[df['team'] == team].copy()
        if team_events.empty:
            ax.text(60, 40, f"No events recorded for\n{team}", 
                    color='#ffffff', size=20, ha='center', va='center', weight='bold')
            buf = io.BytesIO()
            fig.savefig(buf, format="png", bbox_inches="tight", dpi=150, facecolor="#0e1117")
            buf.seek(0)
            img_str = base64.b64encode(buf.read()).decode("utf-8")
            plt.close(fig)
            return img_str
            
        # Collect threat values
        x_start = []
        y_start = []
        xt_vals = []
        
        for _, row in team_events.iterrows():
            etype = row.get('type')
            if etype not in ["Pass", "Carry"]:
                continue
            x = row.get('x')
            y = row.get('y')
            outcome = row.get('outcome')
            details = row.get('details') or {}
            
            xt = cls.calculate_event_xt(etype, x, y, outcome, details)
            # Only map positive progressions
            if xt > 0:
                x_start.append(x)
                y_start.append(y)
                xt_vals.append(xt)
                
        if not xt_vals:
            ax.text(60, 40, "No positive Expected Threat\nactions recorded", 
                    color='#ffffff', size=16, ha='center', va='center', weight='bold')
            buf = io.BytesIO()
            fig.savefig(buf, format="png", bbox_inches="tight", dpi=150, facecolor="#0e1117")
            buf.seek(0)
            img_str = base64.b64encode(buf.read()).decode("utf-8")
            plt.close(fig)
            return img_str
            
        # Bin statistic to compute sum of xT per grid zone
        # We use a 12x8 grid matching Karun Singh's xT cell sizing
        bin_statistic = pitch.bin_statistic(
            x_start, 
            y_start, 
            values=xt_vals, 
            statistic='sum', 
            bins=(12, 8)
        )
        
        # Plot heatmap
        heatmap = pitch.heatmap(
            bin_statistic, 
            ax=ax, 
            cmap='inferno', 
            edgecolor='#22252a',
            lw=0.5,
            alpha=0.85
        )
        
        # Colorbar configuration
        cbar = fig.colorbar(heatmap, ax=ax, orientation='horizontal', pad=0.05, shrink=0.6)
        cbar.ax.tick_params(colors='#c1c9d2')
        cbar.set_label('Cumulative xT Created', color='#c1c9d2', fontsize=10)
        cbar.outline.set_edgecolor('#2d3748')
        
        ax.set_title(f"{team} xT Threat Creation Heatmap", color='#ffffff', fontsize=16, pad=10, weight='bold')
        
        buf = io.BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight", dpi=150, facecolor="#0e1117")
        buf.seek(0)
        img_str = base64.b64encode(buf.read()).decode("utf-8")
        plt.close(fig)
        return img_str
