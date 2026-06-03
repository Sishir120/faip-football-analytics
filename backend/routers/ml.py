from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from services.ml_service import MLService
from models.db_models import TeamCluster
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/api/ml", tags=["Machine Learning"])

@router.post("/xg-model/train")
def train_xg_model(
    algorithm: str = Query("logistic", description="logistic or random_forest"),
    db: Session = Depends(get_db)
):
    """Train xG model on all cached StatsBomb shot events. Returns AUC, ROC curve, feature importance."""
    if algorithm not in ("logistic", "random_forest"):
        raise HTTPException(status_code=400, detail="algorithm must be 'logistic' or 'random_forest'")
    result = MLService.train_xg_model(db, algorithm)
    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])
    return result

@router.get("/xg-model/predict")
def predict_xg(
    model_id: str = Query(...),
    event_id: str = Query(...),
    db: Session = Depends(get_db)
):
    """Predict xG probability for a stored shot event using a trained model."""
    result = MLService.predict_xg(db, model_id, event_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@router.post("/pass-classifier/train")
def train_pass_classifier(db: Session = Depends(get_db)):
    """Train logistic regression pass outcome classifier on cached pass events."""
    result = MLService.train_pass_classifier(db)
    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])
    return result

@router.get("/cluster/players")
def cluster_players(
    season: str = Query(...),
    competition: str = Query(...),
    position: str = Query("MF", description="Player position filter e.g. MF, FW, DF"),
    n_clusters: int = Query(5, ge=2, le=10),
    db: Session = Depends(get_db)
):
    """Cluster players by per-90 stats using K-Means + PCA visualisation."""
    result = MLService.cluster_players(db, season, competition, position, n_clusters)
    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])
    return result


# ── Phase 10: Team Style Clustering ─────────────────────────────────────────
@router.get("/cluster/teams")
def cluster_teams(
    season: str = Query(..., description="e.g. 2018/2019 or 2018-2019"),
    competition: str = Query(..., description="e.g. La Liga"),
    n_clusters: int = Query(4, ge=2, le=8, description="Number of tactical clusters"),
    force_refresh: bool = Query(False, description="Ignore cache and recompute"),
    db: Session = Depends(get_db)
):
    """
    Cluster teams by tactical playing style using 12 per-90 features derived
    from cached StatsBomb event logs.

    Returns JSON with teams[], centroids[], explained_variance[], n_clusters.
    Results are cached in the team_clusters table for 7 days.
    """
    CACHE_TTL_DAYS = 7

    # ── Cache check ──────────────────────────────────────────────────────────
    if not force_refresh:
        cached_rows = db.query(TeamCluster).filter(
            TeamCluster.season == season,
            TeamCluster.competition == competition,
        ).all()

        if cached_rows:
            # Check freshness (use the newest row's created_at)
            newest = max(r.created_at for r in cached_rows if r.created_at)
            age = datetime.now(timezone.utc) - newest.replace(tzinfo=timezone.utc)
            if age < timedelta(days=CACHE_TTL_DAYS):
                # Reconstruct response from DB rows (avoids full recompute)
                teams_list = [
                    {
                        "team": r.team,
                        "cluster_id": r.cluster_id,
                        "archetype": r.archetype,
                        "pca_x": r.pca_x,
                        "pca_y": r.pca_y,
                        "goals_per90": r.goals_per90,
                        "xg_per90": r.xg_per90,
                        "ppda": r.ppda,
                        "possession_pct": r.possession_pct,
                        "passes_per90": r.passes_per90,
                        # Remaining fields not in cache — fill None; frontend handles gracefully
                        "shots_per90": None,
                        "pressures_per90": None,
                        "tackles_per90": None,
                        "interceptions_per90": None,
                    }
                    for r in cached_rows
                ]
                # Rebuild centroids from cached team rows
                import collections
                cluster_groups: dict = collections.defaultdict(list)
                for r in cached_rows:
                    cluster_groups[r.cluster_id].append(r)
                centroids = []
                for cid, rows in cluster_groups.items():
                    arch = rows[0].archetype
                    def _avg(attr):
                        vals = [getattr(r, attr) for r in rows if getattr(r, attr) is not None]
                        return round(sum(vals) / len(vals), 3) if vals else 0.0
                    centroids.append({
                        "cluster_id": cid,
                        "archetype": arch,
                        "goals_per90": _avg("goals_per90"),
                        "xg_per90": _avg("xg_per90"),
                        "ppda": _avg("ppda"),
                        "possession_pct": _avg("possession_pct"),
                        "passes_per90": _avg("passes_per90"),
                    })
                return {
                    "teams": teams_list,
                    "centroids": centroids,
                    "explained_variance": [None, None],
                    "n_clusters": n_clusters,
                    "season": season,
                    "competition": competition,
                    "source": "cache",
                }

    # ── Compute fresh clusters ───────────────────────────────────────────────
    result = MLService.cluster_teams(db, season, competition, n_clusters)

    if "error" in result:
        error_msg = result["error"]
        if "No matches found" in error_msg or "Events table is empty" in error_msg:
            raise HTTPException(
                status_code=404,
                detail=f"No team stats found for season='{season}' competition='{competition}'. "
                       "Run the StatsBomb match seeder or FBRef scraper first."
            )
        if "cannot exceed" in error_msg:
            raise HTTPException(status_code=422, detail=error_msg)
        raise HTTPException(status_code=422, detail=error_msg)

    # ── Persist to cache ─────────────────────────────────────────────────────
    try:
        MLService.save_team_clusters(db, result)
    except Exception as exc:
        # Non-fatal: return result even if DB write fails
        print(f"[WARN] save_team_clusters failed: {exc}")

    result["source"] = "computed"
    return result
