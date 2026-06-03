import io
import base64
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.backends.backend_pdf import PdfPages
from mplsoccer import Pitch
from sqlalchemy.orm import Session
from models.db_models import Match
from services.statsbomb_service import StatsBombService
from services.viz_service import VizService

def _fig_to_base64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=150, facecolor="#0e1117")
    buf.seek(0)
    img = base64.b64encode(buf.read()).decode("utf-8")
    plt.close(fig)
    return img

class ReportService:

    @classmethod
    def generate_match_report(cls, db: Session, match_id: int) -> dict:
        """Generate a full visual match report. Returns base64 PNG + PDF bytes."""
        match = db.query(Match).filter(Match.match_id == match_id).first()
        if not match:
            return {"error": f"Match {match_id} not found."}

        home = match.home_team
        away = match.away_team
        events = StatsBombService.get_events(db, match_id)
        if not events:
            return {"error": "No events found for this match."}

        df = pd.DataFrame(events)
        shots = df[df["type"] == "Shot"]

        # ── Key stats ─────────────────────────────────────────────
        home_shots = len(shots[shots["team"] == home])
        away_shots = len(shots[shots["team"] == away])
        home_xg = round(shots[shots["team"] == home]["xg"].fillna(0).sum(), 2)
        away_xg = round(shots[shots["team"] == away]["xg"].fillna(0).sum(), 2)
        home_goals = match.home_score or 0
        away_goals = match.away_score or 0
        passes = df[df["type"] == "Pass"]
        home_passes = len(passes[passes["team"] == home])
        away_passes = len(passes[passes["team"] == away])

        # ── Build composite figure ────────────────────────────────
        fig = plt.figure(figsize=(22, 28), facecolor="#0e1117")
        fig.patch.set_facecolor("#0e1117")

        gs = gridspec.GridSpec(
            4, 2,
            figure=fig,
            hspace=0.35, wspace=0.15,
            top=0.93, bottom=0.04,
            left=0.04, right=0.96
        )

        # Title banner
        fig.text(0.5, 0.965,
                 f"{home}  {home_goals} – {away_goals}  {away}",
                 ha="center", va="center", fontsize=28, color="#ffffff",
                 weight="bold", family="monospace")
        fig.text(0.5, 0.948,
                 f"{match.competition} | {match.season} | {match.date}",
                 ha="center", va="center", fontsize=13, color="#718096")

        # ── ROW 0: Shot Maps ──────────────────────────────────────
        def draw_shot_map(ax, team, color):
            pitch = Pitch(pitch_type="statsbomb", pitch_color="#0e1117",
                          line_color="#c1c9d2", goal_type="line")
            pitch.draw(ax=ax)
            team_shots = df[(df["type"] == "Shot") & (df["team"] == team)]
            for _, row in team_shots.iterrows():
                outcome = str(row.get("outcome") or "").lower()
                xg = row.get("xg") or 0.01
                sz = max(40, min(900, xg * 700))
                c = "#00ff88" if "goal" in outcome else \
                    "#ffcc00" if "saved" in outcome else \
                    "#7f7f7f" if "block" in outcome else "#ff4a4a"
                if row.get("x") and row.get("y"):
                    pitch.scatter(row["x"], row["y"], s=sz, c=c,
                                  edgecolors="#ffffff", linewidths=0.8, alpha=0.85, ax=ax)
            ax.set_title(f"{team} Shot Map\n{len(team_shots)} shots · {xg:.2f} xG" if team == home
                         else f"{team} Shot Map\n{len(team_shots)} shots · {away_xg:.2f} xG",
                         color="#ffffff", fontsize=12, weight="bold", pad=8)

        ax_shot_home = fig.add_subplot(gs[0, 0])
        draw_shot_map(ax_shot_home, home, "#38bdf8")
        ax_shot_away = fig.add_subplot(gs[0, 1])
        draw_shot_map(ax_shot_away, away, "#f43f5e")

        # ── ROW 1: xG Timeline (Matplotlib version for report) ────
        ax_xg = fig.add_subplot(gs[1, :])
        ax_xg.set_facecolor("#0e1117")
        shots_sorted = df[df["type"] == "Shot"].copy()
        if not shots_sorted.empty:
            shots_sorted["minute"] = shots_sorted["details"].apply(
                lambda d: d.get("minute", 0) if isinstance(d, dict) else 0)
            shots_sorted = shots_sorted.sort_values("minute")
            h_t, h_xg, a_t, a_xg = [0], [0.0], [0], [0.0]
            ch, ca = 0.0, 0.0
            for _, s in shots_sorted.iterrows():
                xg = s.get("xg") or 0.0
                if s["team"] == home:
                    ch += xg; h_t.append(s["minute"]); h_xg.append(ch)
                else:
                    ca += xg; a_t.append(s["minute"]); a_xg.append(ca)
            max_min = max(90, shots_sorted["minute"].max())
            h_t.append(max_min); h_xg.append(ch)
            a_t.append(max_min); a_xg.append(ca)
            ax_xg.step(h_t, h_xg, color="#38bdf8", lw=2.5, where="post", label=f"{home} ({ch:.2f} xG)")
            ax_xg.step(a_t, a_xg, color="#f43f5e", lw=2.5, where="post", label=f"{away} ({ca:.2f} xG)")
            # Goal markers
            goals = df[(df["type"] == "Shot") & (df["outcome"] == "Goal")]
            for _, g in goals.iterrows():
                min_g = g["details"].get("minute", 0) if isinstance(g["details"], dict) else 0
                c = "#38bdf8" if g["team"] == home else "#f43f5e"
                ax_xg.axvline(min_g, color=c, linestyle=":", alpha=0.6, lw=1.5)
        ax_xg.set_xlabel("Match Minute", color="#c1c9d2", fontsize=11)
        ax_xg.set_ylabel("Cumulative xG", color="#c1c9d2", fontsize=11)
        ax_xg.tick_params(colors="#718096")
        ax_xg.set_title("Cumulative xG Timeline", color="#ffffff", fontsize=13, weight="bold")
        for sp in ["top", "right"]: ax_xg.spines[sp].set_visible(False)
        for sp in ["bottom", "left"]: ax_xg.spines[sp].set_color("#2d3748")
        leg = ax_xg.legend(facecolor="#0e1117", edgecolor="#2d3748", fontsize=11)
        for t in leg.get_texts(): t.set_color("#ffffff")

        # ── ROW 2: Pass Networks ──────────────────────────────────
        def draw_pass_network(ax, team):
            pitch = Pitch(pitch_type="statsbomb", pitch_color="#0e1117",
                          line_color="#c1c9d2", goal_type="line")
            pitch.draw(ax=ax)
            team_passes = df[(df["type"] == "Pass") & (df["team"] == team)].copy()
            if team_passes.empty:
                ax.set_title(f"{team} Pass Network", color="#ffffff", fontsize=11, weight="bold")
                return
            team_passes["recipient"] = team_passes["details"].apply(
                lambda d: d.get("pass_recipient") if isinstance(d, dict) else None)
            team_passes = team_passes.dropna(subset=["recipient", "x", "y"])
            if team_passes.empty:
                return
            avg_pos = team_passes.groupby("player").agg(
                x=("x","mean"), y=("y","mean"), cnt=("event_id","count")
            ).reset_index()
            pairs = team_passes.groupby(["player","recipient"]).size().reset_index(name="n")
            pairs = pairs.merge(avg_pos.rename(columns={"x":"xs","y":"ys"}), on="player")
            pairs = pairs.merge(avg_pos[["player","x","y"]].rename(
                columns={"player":"recipient","x":"xe","y":"ye"}), on="recipient")
            pairs = pairs[pairs["n"] >= 3]
            if not pairs.empty:
                max_n = pairs["n"].max()
                for _, r in pairs.iterrows():
                    lw = (r["n"]/max_n)*5
                    pitch.lines(r["xs"],r["ys"],r["xe"],r["ye"],
                                lw=lw, color="#38bdf8", alpha=0.45, ax=ax, zorder=1)
            max_c = avg_pos["cnt"].max()
            for _, r in avg_pos.iterrows():
                sz = (r["cnt"]/max_c)*600+150
                pitch.scatter(r["x"], r["y"], s=sz, color="#0e1117",
                              edgecolors="#38bdf8", linewidths=2, ax=ax, zorder=2)
                ax.text(r["x"], r["y"]-3.5, r["player"].split()[-1],
                        color="#ffffff", size=7.5, ha="center", weight="bold", zorder=3)
            ax.set_title(f"{team} Pass Network", color="#ffffff", fontsize=11, weight="bold", pad=8)

        ax_pn_home = fig.add_subplot(gs[2, 0])
        draw_pass_network(ax_pn_home, home)
        ax_pn_away = fig.add_subplot(gs[2, 1])
        draw_pass_network(ax_pn_away, away)

        # ── ROW 3: Key Stats Table ────────────────────────────────
        ax_stats = fig.add_subplot(gs[3, :])
        ax_stats.set_facecolor("#0e1117")
        ax_stats.axis("off")

        stat_labels = ["Goals", "xG", "Shots", "Passes"]
        home_vals   = [home_goals, home_xg, home_shots, home_passes]
        away_vals   = [away_goals, away_xg, away_shots, away_passes]

        n = len(stat_labels)
        bar_y = 0.5
        for i, (label, hv, av) in enumerate(zip(stat_labels, home_vals, away_vals)):
            x_pos = 0.1 + i * (0.8 / n) + (0.8 / n) / 2
            ax_stats.text(x_pos, bar_y + 0.25, label,
                          ha="center", va="center", color="#718096", fontsize=11)
            ax_stats.text(x_pos - 0.06, bar_y, str(hv),
                          ha="center", va="center", color="#38bdf8", fontsize=20, weight="bold")
            ax_stats.text(x_pos, bar_y, "–",
                          ha="center", va="center", color="#4a5568", fontsize=16)
            ax_stats.text(x_pos + 0.06, bar_y, str(av),
                          ha="center", va="center", color="#f43f5e", fontsize=20, weight="bold")
        ax_stats.set_xlim(0, 1)
        ax_stats.set_ylim(0, 1)
        ax_stats.set_title("Match Statistics", color="#ffffff", fontsize=13,
                            weight="bold", loc="left", pad=10)

        # ── Encode as PNG ─────────────────────────────────────────
        png_b64 = _fig_to_base64(fig)

        # ── Encode as PDF ─────────────────────────────────────────
        pdf_buf = io.BytesIO()
        # Re-draw because _fig_to_base64 closes the fig
        # Just wrap the PNG into a single-page PDF via matplotlib backend
        fig2 = plt.figure(figsize=(22, 28), facecolor="#0e1117")
        buf_tmp = io.BytesIO(base64.b64decode(png_b64))
        img_arr = plt.imread(buf_tmp)
        ax_img = fig2.add_axes([0, 0, 1, 1])
        ax_img.imshow(img_arr)
        ax_img.axis("off")
        with PdfPages(pdf_buf) as pdf:
            pdf.savefig(fig2, bbox_inches="tight", facecolor="#0e1117")
        plt.close(fig2)
        pdf_b64 = base64.b64encode(pdf_buf.getvalue()).decode("utf-8")

        return {
            "match_id": match_id,
            "home_team": home,
            "away_team": away,
            "score": f"{home_goals}–{away_goals}",
            "report_png": png_b64,
            "report_pdf": pdf_b64,
        }
