import io
import base64
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from mplsoccer import Radar
from sqlalchemy.orm import Session
from models.db_models import PlayerStats


def _fig_to_base64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=150, facecolor="#0e1117")
    buf.seek(0)
    img_str = base64.b64encode(buf.read()).decode("utf-8")
    plt.close(fig)
    return img_str


class PlayerService:

    @staticmethod
    def get_player_stats(db: Session, player: str, season: str, competition: str):
        """Fetch all stat types for a player and merge into one flat dict."""
        records = db.query(PlayerStats).filter(
            PlayerStats.player == player,
            PlayerStats.season == season,
            PlayerStats.competition == competition
        ).all()
        merged = {}
        for rec in records:
            if isinstance(rec.stats, dict):
                merged.update(rec.stats)
        merged["player"] = player
        return merged

    @staticmethod
    def get_position_peers(db: Session, position: str, season: str, competition: str):
        """Fetch all players at a position for peer-group percentile calculation."""
        records = db.query(PlayerStats).filter(
            PlayerStats.season == season,
            PlayerStats.competition == competition,
            PlayerStats.stat_type == "standard"
        ).all()
        rows = []
        for rec in records:
            if not isinstance(rec.stats, dict):
                continue
            pos = str(rec.stats.get("Pos", "")).upper()
            # Loose match: MF matches MF, MFFW, DFMF etc.
            if position.upper() in pos:
                row = dict(rec.stats)
                row["player"] = rec.player
                rows.append(row)
        return pd.DataFrame(rows) if rows else pd.DataFrame()

    @classmethod
    def generate_radar(cls, db: Session, player: str, metrics: list,
                       season: str, competition: str, position: str = "MF") -> str:
        """Generate a dark-themed radar chart for a player vs peer-group percentiles."""
        player_stats = cls.get_player_stats(db, player, season, competition)
        peers_df = cls.get_position_peers(db, position, season, competition)

        if not player_stats or peers_df.empty:
            fig, ax = plt.subplots(figsize=(8, 8), facecolor="#0e1117")
            ax.text(0.5, 0.5, "Insufficient data for radar chart.",
                    color="#ffffff", ha="center", va="center", transform=ax.transAxes, fontsize=14)
            ax.axis("off")
            return _fig_to_base64(fig)

        # Build numeric arrays for metrics
        player_values = []
        low_values = []
        high_values = []

        for metric in metrics:
            val = player_stats.get(metric)
            try:
                val = float(val) if val is not None else 0.0
            except (TypeError, ValueError):
                val = 0.0

            col_series = pd.to_numeric(peers_df.get(metric, pd.Series(dtype=float)), errors="coerce").dropna()
            low = col_series.min() if len(col_series) else 0.0
            high = col_series.max() if len(col_series) else 1.0
            if high == low:
                high = low + 1.0

            player_values.append(val)
            low_values.append(low)
            high_values.append(high)

        # mplsoccer Radar
        radar = Radar(
            params=metrics,
            min_range=low_values,
            max_range=high_values,
            num_rings=5,
            ring_width=1,
            center_circle_radius=1
        )

        fig, ax = radar.setup_axis(figsize=(9, 9), facecolor="#0e1117")
        rings_inner = radar.draw_circles(ax=ax, facecolor="#1a1f2e", edgecolor="#2d3748")
        radar_output = radar.draw_radar(
            player_values,
            ax=ax,
            kwargs_radar={"facecolor": "#38bdf880", "edgecolor": "#38bdf8"},
            kwargs_rings={"facecolor": "#1a1f2e", "edgecolor": "#2d3748"}
        )
        radar_poly, rings_outer, vertices = radar_output
        radar.draw_param_labels(ax=ax, color="#c1c9d2", fontsize=11)
        radar.draw_range_labels(ax=ax, color="#718096", fontsize=9)

        ax.set_title(f"{player}\n{position} Radar — {season}",
                     color="#ffffff", fontsize=14, pad=20, weight="bold")
        fig.patch.set_facecolor("#0e1117")

        return _fig_to_base64(fig)

    @classmethod
    def generate_comparison_scatter(cls, db: Session, season: str, competition: str,
                                    x_metric: str, y_metric: str,
                                    highlight_players: list = None,
                                    min_minutes: float = 900.0) -> str:
        """Scatter all players on two metrics; highlight selected players."""
        records = db.query(PlayerStats).filter(
            PlayerStats.season == season,
            PlayerStats.competition == competition,
            PlayerStats.stat_type == "standard"
        ).all()

        rows = []
        for rec in records:
            if not isinstance(rec.stats, dict):
                continue
            row = dict(rec.stats)
            row["player"] = rec.player
            rows.append(row)

        if not rows:
            fig, ax = plt.subplots(figsize=(10, 7), facecolor="#0e1117")
            ax.text(0.5, 0.5, "No player data cached.\nRun the FBRef scraper first.",
                    color="#ffffff", ha="center", va="center", transform=ax.transAxes, fontsize=14)
            ax.axis("off")
            return _fig_to_base64(fig)

        df = pd.DataFrame(rows)
        df["Min"] = pd.to_numeric(df.get("Min", 0), errors="coerce").fillna(0)
        df = df[df["Min"] >= min_minutes].copy()

        df[x_metric] = pd.to_numeric(df.get(x_metric), errors="coerce")
        df[y_metric] = pd.to_numeric(df.get(y_metric), errors="coerce")
        df = df.dropna(subset=[x_metric, y_metric])

        fig, ax = plt.subplots(figsize=(11, 8), facecolor="#0e1117")
        ax.set_facecolor("#0e1117")
        fig.patch.set_facecolor("#0e1117")

        # Median quadrant lines
        med_x = df[x_metric].median()
        med_y = df[y_metric].median()
        ax.axvline(med_x, color="#2d3748", linewidth=1.2, linestyle="--", alpha=0.8)
        ax.axhline(med_y, color="#2d3748", linewidth=1.2, linestyle="--", alpha=0.8)

        # All players (grey)
        ax.scatter(df[x_metric], df[y_metric], color="#4a5568", alpha=0.55, s=50, edgecolors="none")

        # Highlighted players
        if highlight_players:
            for hp in highlight_players:
                hp_row = df[df["player"].str.contains(hp, case=False, na=False)]
                if hp_row.empty:
                    continue
                ax.scatter(hp_row[x_metric], hp_row[y_metric],
                           color="#38bdf8", s=130, edgecolors="#ffffff",
                           linewidths=1.2, zorder=5)
                for _, r in hp_row.iterrows():
                    ax.annotate(r["player"], (r[x_metric], r[y_metric]),
                                xytext=(6, 4), textcoords="offset points",
                                color="#ffffff", fontsize=9, weight="bold")

        ax.set_xlabel(x_metric, color="#c1c9d2", fontsize=12)
        ax.set_ylabel(y_metric, color="#c1c9d2", fontsize=12)
        ax.tick_params(colors="#718096")
        ax.spines["bottom"].set_color("#2d3748")
        ax.spines["left"].set_color("#2d3748")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.set_title(f"{x_metric} vs {y_metric} — {competition} {season}\n(min {min_minutes} minutes)",
                     color="#ffffff", fontsize=14, weight="bold")

        return _fig_to_base64(fig)
