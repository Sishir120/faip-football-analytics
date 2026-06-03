import os
import io
import base64
import joblib
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import roc_auc_score, confusion_matrix, roc_curve
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sqlalchemy.orm import Session
from models.db_models import XGModel, Event, PlayerStats, Match, TeamCluster
from services.xt_service import XTService

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "trained_models")
os.makedirs(MODELS_DIR, exist_ok=True)

def _fig_to_base64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=150, facecolor="#0e1117")
    buf.seek(0)
    img = base64.b64encode(buf.read()).decode("utf-8")
    plt.close(fig)
    return img

class MLService:

    # ─────────────────────────────────────────────────────────────
    # xG MODEL
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def _extract_xg_features(events: list) -> pd.DataFrame:
        """Extract shot-level features for xG modelling from event list."""
        df = pd.DataFrame(events)
        shots = df[df["type"] == "Shot"].copy()
        if shots.empty:
            return pd.DataFrame()

        rows = []
        for _, row in shots.iterrows():
            details = row.get("details") or {}
            x = row.get("x") or 60.0
            y = row.get("y") or 40.0

            # Distance & angle to centre of goal (120, 40)
            dx = 120.0 - x
            dy = abs(40.0 - y)
            distance = np.sqrt(dx**2 + dy**2)
            angle = np.degrees(np.arctan2(dy, dx)) if dx > 0 else 0.0

            technique = str(details.get("shot_technique", "Normal")).lower()
            body_part = str(details.get("shot_body_part", "Foot")).lower()
            play_pattern = str(details.get("play_pattern", "Regular Play")).lower()

            rows.append({
                "distance": distance,
                "angle": angle,
                "is_header": 1 if "head" in body_part else 0,
                "from_corner": 1 if "corner" in play_pattern else 0,
                "under_pressure": 1 if details.get("under_pressure") else 0,
                "is_volley": 1 if "volley" in technique else 0,
                "outcome": row.get("outcome") or "",
                "xg_statsbomb": row.get("xg") or 0.0,
            })

        result = pd.DataFrame(rows)
        result["is_goal"] = result["outcome"].str.lower().str.contains("goal").astype(int)
        return result

    @classmethod
    def train_xg_model(cls, db: Session, algorithm: str = "logistic") -> dict:
        """Train xG model on all cached StatsBomb events. Returns metrics dict."""
        all_events = db.query(Event).filter(Event.type == "Shot").all()
        if len(all_events) < 30:
            return {"error": "Not enough shot events cached. Seed more matches first."}

        events_list = [{
            "type": e.type, "x": e.x, "y": e.y,
            "outcome": e.outcome, "xg": e.xg,
            "details": e.details or {}
        } for e in all_events]

        feat_df = cls._extract_xg_features(events_list)
        if feat_df.empty:
            return {"error": "Feature extraction produced no rows."}

        feature_cols = ["distance", "angle", "is_header", "from_corner",
                        "under_pressure", "is_volley"]
        X = feat_df[feature_cols].fillna(0).values
        y = feat_df["is_goal"].values

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.25, random_state=42, stratify=y
        )

        scaler = StandardScaler()
        X_train_s = scaler.fit_transform(X_train)
        X_test_s = scaler.transform(X_test)

        if algorithm == "random_forest":
            model = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
            model.fit(X_train_s, y_train)
            importances = dict(zip(feature_cols, model.feature_importances_.tolist()))
        else:
            model = LogisticRegression(max_iter=1000, random_state=42, class_weight="balanced")
            model.fit(X_train_s, y_train)
            importances = dict(zip(feature_cols, model.coef_[0].tolist()))

        y_proba = model.predict_proba(X_test_s)[:, 1]
        y_pred = (y_proba >= 0.5).astype(int)
        auc = roc_auc_score(y_test, y_proba)
        cm = confusion_matrix(y_test, y_pred).tolist()

        # ROC curve plot
        fpr, tpr, _ = roc_curve(y_test, y_proba)
        fig, ax = plt.subplots(figsize=(7, 5), facecolor="#0e1117")
        ax.set_facecolor("#0e1117")
        ax.plot(fpr, tpr, color="#38bdf8", lw=2.5, label=f"AUC = {auc:.3f}")
        ax.plot([0, 1], [0, 1], color="#4a5568", lw=1.5, linestyle="--")
        ax.set_xlabel("False Positive Rate", color="#c1c9d2")
        ax.set_ylabel("True Positive Rate", color="#c1c9d2")
        ax.set_title(f"xG Model ROC Curve — {algorithm.replace('_', ' ').title()}",
                     color="#ffffff", fontsize=13, weight="bold")
        ax.tick_params(colors="#718096")
        for spine in ["top", "right"]: ax.spines[spine].set_visible(False)
        for spine in ["bottom", "left"]: ax.spines[spine].set_color("#2d3748")
        legend = ax.legend(fontsize=11, facecolor="#0e1117", edgecolor="#2d3748")
        for text in legend.get_texts(): text.set_color("#ffffff")
        roc_img = _fig_to_base64(fig)

        # Feature importance plot
        fig2, ax2 = plt.subplots(figsize=(8, 5), facecolor="#0e1117")
        ax2.set_facecolor("#0e1117")
        sorted_imp = sorted(importances.items(), key=lambda x: abs(x[1]), reverse=True)
        labels = [i[0] for i in sorted_imp]
        vals = [i[1] for i in sorted_imp]
        colors = ["#38bdf8" if v >= 0 else "#f43f5e" for v in vals]
        ax2.barh(labels, vals, color=colors, edgecolor="none")
        ax2.set_title("Feature Importance", color="#ffffff", fontsize=13, weight="bold")
        ax2.tick_params(colors="#c1c9d2")
        for spine in ["top", "right"]: ax2.spines[spine].set_visible(False)
        for spine in ["bottom", "left"]: ax2.spines[spine].set_color("#2d3748")
        imp_img = _fig_to_base64(fig2)

        # Save model + scaler
        import uuid
        model_id = f"xg_{algorithm}_{uuid.uuid4().hex[:8]}"
        model_path = os.path.join(MODELS_DIR, f"{model_id}.joblib")
        joblib.dump({"model": model, "scaler": scaler, "features": feature_cols}, model_path)

        # Persist to DB
        db_model = XGModel(
            model_id=model_id,
            algorithm=algorithm,
            features=feature_cols,
            auc_score=auc,
            file_path=model_path
        )
        db.merge(db_model)
        db.commit()

        return {
            "model_id": model_id,
            "algorithm": algorithm,
            "auc_score": round(auc, 4),
            "confusion_matrix": cm,
            "feature_importance": importances,
            "roc_curve_image": roc_img,
            "feature_importance_image": imp_img,
            "n_shots": len(feat_df),
            "n_train": len(X_train),
            "n_test": len(X_test),
        }

    @staticmethod
    def predict_xg(db: Session, model_id: str, event_id: str) -> dict:
        """Predict xG probability for a stored event using saved model."""
        model_rec = db.query(XGModel).filter(XGModel.model_id == model_id).first()
        if not model_rec:
            return {"error": f"Model {model_id} not found."}

        artifact = joblib.load(model_rec.file_path)
        model = artifact["model"]
        scaler = artifact["scaler"]
        feature_cols = artifact["features"]

        event = db.query(Event).filter(Event.event_id == event_id).first()
        if not event:
            return {"error": f"Event {event_id} not found."}

        details = event.details or {}
        x, y = event.x or 60.0, event.y or 40.0
        dx, dy = 120.0 - x, abs(40.0 - y)
        distance = np.sqrt(dx**2 + dy**2)
        angle = float(np.degrees(np.arctan2(dy, dx))) if dx > 0 else 0.0
        body_part = str(details.get("shot_body_part", "Foot")).lower()
        play_pattern = str(details.get("play_pattern", "Regular Play")).lower()
        technique = str(details.get("shot_technique", "Normal")).lower()

        feat = np.array([[
            distance, angle,
            1 if "head" in body_part else 0,
            1 if "corner" in play_pattern else 0,
            1 if details.get("under_pressure") else 0,
            1 if "volley" in technique else 0,
        ]])
        feat_scaled = scaler.transform(feat)
        xg_pred = float(model.predict_proba(feat_scaled)[0, 1])

        return {
            "event_id": event_id,
            "model_id": model_id,
            "predicted_xg": round(xg_pred, 4),
            "features_used": dict(zip(feature_cols, feat[0].tolist()))
        }

    # ─────────────────────────────────────────────────────────────
    # PASS OUTCOME CLASSIFIER
    # ─────────────────────────────────────────────────────────────
    @classmethod
    def train_pass_classifier(cls, db: Session) -> dict:
        """Train logistic regression to classify pass success."""
        events = db.query(Event).filter(Event.type == "Pass").all()
        if len(events) < 50:
            return {"error": "Not enough pass events. Seed more matches."}

        rows = []
        for e in events:
            details = e.details or {}
            length = details.get("pass_length") or 0.0
            angle = details.get("pass_angle") or 0.0
            body_part = str(details.get("pass_body_part", "Foot")).lower()
            under_pressure = 1 if details.get("under_pressure") else 0
            outcome = e.outcome  # None = complete

            rows.append({
                "length": float(length),
                "angle": float(angle),
                "is_foot": 1 if "foot" in body_part else 0,
                "is_head": 1 if "head" in body_part else 0,
                "under_pressure": under_pressure,
                "is_complete": 1 if outcome is None else 0,
            })

        df = pd.DataFrame(rows).fillna(0)
        X = df[["length", "angle", "is_foot", "is_head", "under_pressure"]].values
        y = df["is_complete"].values

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.25, random_state=42
        )
        scaler = StandardScaler()
        X_train_s = scaler.fit_transform(X_train)
        X_test_s = scaler.transform(X_test)

        model = LogisticRegression(max_iter=500, class_weight="balanced", random_state=42)
        model.fit(X_train_s, y_train)

        y_proba = model.predict_proba(X_test_s)[:, 1]
        auc = roc_auc_score(y_test, y_proba)
        cm = confusion_matrix(y_test, (y_proba >= 0.5).astype(int)).tolist()
        importances = dict(zip(
            ["length", "angle", "is_foot", "is_head", "under_pressure"],
            model.coef_[0].tolist()
        ))

        import uuid
        model_id = f"pass_logistic_{uuid.uuid4().hex[:8]}"
        path = os.path.join(MODELS_DIR, f"{model_id}.joblib")
        joblib.dump({"model": model, "scaler": scaler}, path)

        return {
            "model_id": model_id,
            "auc_score": round(auc, 4),
            "confusion_matrix": cm,
            "feature_importance": importances,
            "n_passes": len(df),
        }

    # ─────────────────────────────────────────────────────────────
    # PLAYER CLUSTERING
    # ─────────────────────────────────────────────────────────────
    @classmethod
    def cluster_players(cls, db: Session, season: str, competition: str,
                        position: str = "MF", n_clusters: int = 5) -> dict:
        """K-Means cluster players by per-90 stats; PCA to 2D for visualisation."""
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
            if position.upper() not in pos:
                continue
            row = dict(rec.stats)
            row["player"] = rec.player
            rows.append(row)

        if len(rows) < n_clusters + 2:
            return {"error": f"Not enough players at position {position}. Need >{n_clusters+1}."}

        df = pd.DataFrame(rows)
        numeric_cols = [c for c in df.columns
                        if c not in ["player", "Pos", "Nation", "Squad", "Age",
                                     "Born", "Matches", "Rk"]
                        and pd.to_numeric(df[c], errors="coerce").notna().sum() > len(df) * 0.5]

        feature_df = df[numeric_cols].apply(pd.to_numeric, errors="coerce").fillna(0)

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(feature_df)

        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(X_scaled)

        pca = PCA(n_components=2, random_state=42)
        X_2d = pca.fit_transform(X_scaled)

        palette = ["#38bdf8", "#f43f5e", "#a78bfa", "#34d399", "#fbbf24"]
        fig, ax = plt.subplots(figsize=(11, 8), facecolor="#0e1117")
        ax.set_facecolor("#0e1117")
        fig.patch.set_facecolor("#0e1117")

        for k in range(n_clusters):
            mask = labels == k
            ax.scatter(X_2d[mask, 0], X_2d[mask, 1],
                       color=palette[k % len(palette)],
                       s=80, alpha=0.8, edgecolors="none",
                       label=f"Cluster {k+1}")
            for i, name in enumerate(df["player"].values):
                if mask[i]:
                    ax.annotate(name.split()[-1], (X_2d[i, 0], X_2d[i, 1]),
                                fontsize=7, color="#c1c9d2", alpha=0.75,
                                xytext=(3, 3), textcoords="offset points")

        ax.set_xlabel("PCA Component 1", color="#c1c9d2")
        ax.set_ylabel("PCA Component 2", color="#c1c9d2")
        ax.tick_params(colors="#718096")
        for spine in ["top", "right"]: ax.spines[spine].set_visible(False)
        for spine in ["bottom", "left"]: ax.spines[spine].set_color("#2d3748")
        ax.set_title(f"Player Clustering ({n_clusters} clusters) — {position} — {season}",
                     color="#ffffff", fontsize=13, weight="bold")
        legend = ax.legend(facecolor="#0e1117", edgecolor="#2d3748", fontsize=10)
        for text in legend.get_texts(): text.set_color("#ffffff")

        cluster_img = _fig_to_base64(fig)

        # Build result table
        df["cluster"] = labels.tolist()
        cluster_table = df[["player", "cluster"] + numeric_cols[:5]].to_dict(orient="records")

        return {
            "n_players": len(df),
            "n_clusters": n_clusters,
            "position": position,
            "season": season,
            "competition": competition,
            "cluster_image": cluster_img,
            "players": cluster_table,
            "explained_variance": [round(v, 4) for v in pca.explained_variance_ratio_.tolist()],
        }

    # ─────────────────────────────────────────────────────────────────────────
    # TEAM STYLE CLUSTERING  (Phase 10)
    # ─────────────────────────────────────────────────────────────────────────
    @classmethod
    def cluster_teams(cls, db: Session, season: str, competition: str,
                      n_clusters: int = 4) -> dict:
        """
        Cluster teams by tactical style using 12 per-90 features derived from
        the cached StatsBomb event logs.  Returns JSON-serialisable dict (no images).

        Features (12):
            Attacking:   goals_per90, xg_per90, shots_per90, shot_on_target_pct
            Pressing:    ppda, pressures_per90, pressure_success_rate
            Possession:  possession_pct, passes_per90, progressive_passes_per90
            Defending:   tackles_per90, interceptions_per90
        """
        # ── 1. Identify all matches for this season/competition ────────────
        matches = db.query(Match).filter(
            Match.season == season,
            Match.competition == competition
        ).all()

        if not matches:
            return {"error": f"No matches found for season='{season}' competition='{competition}'. "
                             "Seed matches via the StatsBomb competitions endpoint first."}

        match_ids = [m.match_id for m in matches]

        # ── 2. Pull all events for those matches ───────────────────────────
        events = db.query(Event).filter(Event.match_id.in_(match_ids)).all()
        if not events:
            return {"error": "Events table is empty for the given matches. "
                             "Fetch events via /api/matches/{id}/events first."}

        # ── 3. Aggregate raw counts per team ──────────────────────────────
        DEFENSIVE_ACTIONS = {"Pressure", "Tackle", "Interception", "Block",
                             "Foul Committed", "Challenge", "Duel", "Error"}

        team_raw: dict = {}

        for e in events:
            team = e.team
            if not team:
                continue
            if team not in team_raw:
                team_raw[team] = {
                    "goals": 0, "xg": 0.0, "shots": 0, "shots_on_target": 0,
                    "passes": 0, "passes_completed": 0,
                    "progressive_passes": 0, "pressures": 0,
                    "pressures_successful": 0, "tackles": 0, "interceptions": 0,
                    "touches": 0, "minutes": 0.0,
                    # For PPDA we need opponent passes in opp def-third
                    # and own defensive actions in opp def-third — computed
                    # after aggregation below
                }

            p = team_raw[team]
            etype = e.type
            details = e.details or {}
            p["touches"] += 1

            if etype == "Shot":
                p["shots"] += 1
                p["xg"] += (e.xg or 0.0)
                if e.outcome == "Goal":
                    p["goals"] += 1
                shot_outcome_str = str(e.outcome or "").lower()
                if "saved" in shot_outcome_str or e.outcome == "Goal" or "post" in shot_outcome_str:
                    p["shots_on_target"] += 1
            elif etype == "Pass":
                p["passes"] += 1
                if e.outcome is None or e.outcome == "":
                    p["passes_completed"] += 1
                    if e.x is not None and "pass_end_location" in details:
                        end_x = details["pass_end_location"][0] if isinstance(
                            details["pass_end_location"], list) else 0
                        if end_x > 40 and (end_x - (e.x or 0)) >= 10:
                            p["progressive_passes"] += 1
            elif etype == "Pressure":
                p["pressures"] += 1
                if details.get("counterpress") or details.get("pressure_outcome") in (None, ""):
                    p["pressures_successful"] += 1
            elif etype == "Tackle":
                p["tackles"] += 1
            elif etype == "Interception":
                p["interceptions"] += 1

        # ── 4. Compute match-level possession & PPDA per match, then average
        team_minutes: dict = {}   # team -> total_90s (approximate from touches)
        team_ppda_num: dict = {}  # numerator sums across matches
        team_ppda_den: dict = {}  # denominator sums

        match_teams: dict = {}  # match_id -> set of teams
        for e in events:
            if e.team:
                match_teams.setdefault(e.match_id, set()).add(e.team)

        # Count 90s: StatsBomb encodes ~90 min; each match = 1 × 90 for each team
        team_match_count: dict = {}
        for mid, teams_in_match in match_teams.items():
            for t in teams_in_match:
                team_match_count[t] = team_match_count.get(t, 0) + 1

        # Possession: touches-based proxy per match
        team_touches_per_match: dict = {}  # (match_id, team) -> touches
        for e in events:
            key = (e.match_id, e.team)
            team_touches_per_match[key] = team_touches_per_match.get(key, 0) + 1

        # Aggregate possession across all matches
        match_possession: dict = {}  # team -> list of pct
        for (mid, team), touches in team_touches_per_match.items():
            total = sum(v for (m, t), v in team_touches_per_match.items() if m == mid)
            pct = (touches / total * 100.0) if total > 0 else 50.0
            match_possession.setdefault(team, []).append(pct)

        # PPDA per match: opponent passes in their def 2/3 / own def actions in opp def 2/3
        # Group events by match for PPDA
        events_by_match: dict = {}
        for e in events:
            events_by_match.setdefault(e.match_id, []).append(e)

        team_ppda_list: dict = {}
        for mid, evs in events_by_match.items():
            teams_in = match_teams.get(mid, set())
            if len(teams_in) < 2:
                continue
            for pressing_team in teams_in:
                opponent = [t for t in teams_in if t != pressing_team]
                if not opponent:
                    continue
                opp = opponent[0]
                opp_passes = sum(
                    1 for e in evs if e.team == opp and e.type == "Pass"
                    and e.x is not None and e.x <= 80.0
                )
                own_def_actions = sum(
                    1 for e in evs if e.team == pressing_team
                    and e.type in DEFENSIVE_ACTIONS
                    and e.x is not None and e.x >= 40.0
                )
                if own_def_actions > 0:
                    ppda_val = opp_passes / own_def_actions
                    team_ppda_list.setdefault(pressing_team, []).append(ppda_val)

        # ── 5. Build per-90 DataFrame ──────────────────────────────────────
        rows = []
        for team, raw in team_raw.items():
            n90 = max(team_match_count.get(team, 1), 1)  # each match ≈ 1×90min

            goals_per90 = raw["goals"] / n90
            xg_per90 = raw["xg"] / n90
            shots_per90 = raw["shots"] / n90
            shot_on_target_pct = (
                raw["shots_on_target"] / raw["shots"] * 100.0
            ) if raw["shots"] > 0 else 0.0
            passes_per90 = raw["passes"] / n90
            progressive_passes_per90 = raw["progressive_passes"] / n90
            pressures_per90 = raw["pressures"] / n90
            pressure_success_rate = (
                raw["pressures_successful"] / raw["pressures"] * 100.0
            ) if raw["pressures"] > 0 else 0.0
            tackles_per90 = raw["tackles"] / n90
            interceptions_per90 = raw["interceptions"] / n90
            ppda = float(np.mean(team_ppda_list[team])) if team in team_ppda_list else 10.0
            possession_pct = float(np.mean(match_possession[team])) if team in match_possession else 50.0

            rows.append({
                "team": team,
                "n90": n90,
                "goals_per90": round(goals_per90, 3),
                "xg_per90": round(xg_per90, 3),
                "shots_per90": round(shots_per90, 3),
                "shot_on_target_pct": round(shot_on_target_pct, 1),
                "ppda": round(ppda, 2),
                "pressures_per90": round(pressures_per90, 3),
                "pressure_success_rate": round(pressure_success_rate, 1),
                "possession_pct": round(possession_pct, 1),
                "passes_per90": round(passes_per90, 3),
                "progressive_passes_per90": round(progressive_passes_per90, 3),
                "tackles_per90": round(tackles_per90, 3),
                "interceptions_per90": round(interceptions_per90, 3),
            })

        if not rows:
            return {"error": "No team data could be compiled from events."}

        df = pd.DataFrame(rows)

        # ── 6. Guard: n_clusters cannot exceed number of teams ─────────────
        if n_clusters > len(df):
            return {"error": f"n_clusters ({n_clusters}) cannot exceed number of teams ({len(df)})."}

        FEATURE_COLS = [
            "goals_per90", "xg_per90", "shots_per90", "shot_on_target_pct",
            "ppda", "pressures_per90", "pressure_success_rate",
            "possession_pct", "passes_per90", "progressive_passes_per90",
            "tackles_per90", "interceptions_per90",
        ]

        # ── 7. Fill nulls with median (outlier-safe), drop >20% null rows ──
        null_frac = df[FEATURE_COLS].isnull().mean(axis=1)
        df = df[null_frac <= 0.20].copy()
        for col in FEATURE_COLS:
            df[col] = df[col].fillna(df[col].median())

        if len(df) < n_clusters:
            return {"error": "After null filtering, fewer teams remain than n_clusters."}

        # ── 8. Scale + KMeans ──────────────────────────────────────────────
        X = df[FEATURE_COLS].values
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(X_scaled)
        df["cluster_id"] = labels.tolist()

        # ── 9. PCA 2D for scatter ─────────────────────────────────────────
        pca = PCA(n_components=2, random_state=42)
        X_2d = pca.fit_transform(X_scaled)
        df["pca_x"] = X_2d[:, 0].tolist()
        df["pca_y"] = X_2d[:, 1].tolist()
        explained_variance = [round(float(v), 4) for v in pca.explained_variance_ratio_]

        # ── 10. Archetype labelling on original-scale centroids ───────────
        # Compute cluster centroid means (original scale)
        centroid_df = df.groupby("cluster_id")[FEATURE_COLS + ["n90"]].mean().reset_index()

        # Score each cluster on each archetype dimension (rank-based, no ties)
        archetype_scores: dict = {cid: {} for cid in centroid_df["cluster_id"].tolist()}
        for cid, row in centroid_df.set_index("cluster_id").iterrows():
            archetype_scores[cid]["press_score"] = row["ppda"] * -1 + row["pressures_per90"]
            archetype_scores[cid]["poss_score"] = row["possession_pct"] + row["passes_per90"]
            archetype_scores[cid]["counter_score"] = row["shots_per90"] + (100 - row["possession_pct"])
            # low_block gets default score of 0 — assigned to whichever cluster wins none of the above

        # Greedy assignment: highest scorer per archetype gets that label first
        archetype_map: dict = {}
        remaining = set(centroid_df["cluster_id"].tolist())
        for archetype, score_key in [
            ("High Press", "press_score"),
            ("Possession", "poss_score"),
            ("Counter Attack", "counter_score"),
        ]:
            if not remaining:
                break
            best = max(remaining, key=lambda cid: archetype_scores[cid][score_key])
            archetype_map[best] = archetype
            remaining.discard(best)

        # Remaining clusters → "Low Block"
        for cid in remaining:
            archetype_map[cid] = "Low Block"

        df["archetype"] = df["cluster_id"].map(archetype_map)

        # ── 11. Build centroids list ──────────────────────────────────────
        centroids = []
        for _, crow in centroid_df.iterrows():
            cid = int(crow["cluster_id"])
            arch = archetype_map.get(cid, "Low Block")
            entry = {"cluster_id": cid, "archetype": arch}
            for col in FEATURE_COLS:
                entry[col] = round(float(crow[col]), 3)
            centroids.append(entry)

        # ── 12. Build teams list ──────────────────────────────────────────
        teams_list = []
        for _, row in df.iterrows():
            teams_list.append({
                "team": row["team"],
                "cluster_id": int(row["cluster_id"]),
                "archetype": row["archetype"],
                "pca_x": round(float(row["pca_x"]), 4),
                "pca_y": round(float(row["pca_y"]), 4),
                "goals_per90": float(row["goals_per90"]),
                "xg_per90": float(row["xg_per90"]),
                "ppda": float(row["ppda"]),
                "possession_pct": float(row["possession_pct"]),
                "passes_per90": float(row["passes_per90"]),
                "shots_per90": float(row["shots_per90"]),
                "pressures_per90": float(row["pressures_per90"]),
                "tackles_per90": float(row["tackles_per90"]),
                "interceptions_per90": float(row["interceptions_per90"]),
            })

        return {
            "teams": teams_list,
            "centroids": centroids,
            "explained_variance": explained_variance,
            "n_clusters": n_clusters,
            "season": season,
            "competition": competition,
        }

    @staticmethod
    def save_team_clusters(db: Session, result: dict) -> None:
        """
        Upsert cluster assignments into the team_clusters table.
        Uses delete-then-insert per (season, competition) to cleanly
        handle changes in n_clusters or re-runs.
        """
        season = result["season"]
        competition = result["competition"]

        # Delete existing rows for this season/competition
        db.query(TeamCluster).filter(
            TeamCluster.season == season,
            TeamCluster.competition == competition,
        ).delete(synchronize_session=False)

        for t in result["teams"]:
            row = TeamCluster(
                team=t["team"],
                season=season,
                competition=competition,
                cluster_id=t["cluster_id"],
                archetype=t["archetype"],
                pca_x=t["pca_x"],
                pca_y=t["pca_y"],
                goals_per90=t["goals_per90"],
                xg_per90=t["xg_per90"],
                ppda=t["ppda"],
                possession_pct=t["possession_pct"],
                passes_per90=t["passes_per90"],
            )
            db.add(row)

        db.commit()
