from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session

from database import get_db
from services.statsbomb_service import StatsBombService
from services.chain_service import (
    get_chain_summary,
    save_chains_to_db,
    load_chains_from_db,
    reconstruct_summary_from_db,
)
from models.db_models import PossessionChain

router = APIRouter(tags=["Matches & Events"])


@router.get("/api/matches")
def get_matches(
    competition_id: int,
    season_id: int,
    db: Session = Depends(get_db),
):
    """Retrieve matches for a competition and season. Caches results locally."""
    matches = StatsBombService.get_matches(db, competition_id, season_id)
    if not matches:
        return []
    return matches


@router.get("/api/events")
def get_events(
    match_id: int,
    db: Session = Depends(get_db),
):
    """Retrieve all event logs for a given match. Caches results locally."""
    events = StatsBombService.get_events(db, match_id)
    if not events:
        raise HTTPException(status_code=404, detail="No events found for this match.")
    return events


@router.get("/api/normalize")
def get_normalized_coordinates(
    provider: str,
    x: float,
    y: float,
):
    """Normalize coordinate values from other providers to StatsBomb format (120×80)."""
    from services.coordinate_normalizer import CoordinateNormalizer
    nx, ny = CoordinateNormalizer.normalize(provider, x, y)
    return {"provider": provider, "raw": {"x": x, "y": y}, "normalized": {"x": nx, "y": ny}}


# ── Phase 11: Possession Chain Endpoints ─────────────────────────────────────

CHAIN_CACHE_HOURS = 24


@router.get("/api/matches/{match_id}/chains")
def get_match_chains(
    match_id: int = Path(..., description="StatsBomb match ID"),
    force_refresh: bool = False,
    db: Session = Depends(get_db),
):
    """
    Return possession chain summary for a match.

    Chains are segmented from the cached event log, valued with Δ-xT, and
    persisted in the possession_chains table.  Subsequent calls within 24 h
    are served from the DB cache.
    """
    # ── Cache check ──────────────────────────────────────────────────────
    if not force_refresh:
        cached = load_chains_from_db(match_id, db)
        if cached:
            newest = max((r.created_at for r in cached if r.created_at), default=None)
            if newest:
                age = datetime.now(timezone.utc) - newest.replace(tzinfo=timezone.utc)
                if age < timedelta(hours=CHAIN_CACHE_HOURS):
                    summary = reconstruct_summary_from_db(match_id, cached, db)
                    return summary

    # ── Ensure events are loaded ─────────────────────────────────────────
    from models.db_models import Event
    event_count = db.query(Event).filter(Event.match_id == match_id).count()
    if event_count == 0:
        # Try to seed from StatsBomb API
        StatsBombService.get_events(db, match_id)
        event_count = db.query(Event).filter(Event.match_id == match_id).count()

    if event_count == 0:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Match events not cached for match_id={match_id}. "
                "Load events first via GET /api/events?match_id=X"
            ),
        )

    # ── Compute chains ───────────────────────────────────────────────────
    summary = get_chain_summary(match_id, db)
    if not summary:
        raise HTTPException(
            status_code=422,
            detail="Chain segmentation produced no results. Verify event data.",
        )

    # ── Persist to DB ────────────────────────────────────────────────────
    full_chains = summary.pop("_full_chains", [])
    try:
        save_chains_to_db(match_id, full_chains, db)
    except Exception as exc:
        print(f"[WARN] save_chains_to_db failed: {exc}")

    summary["source"] = "computed"
    return summary


@router.get("/api/matches/{match_id}/chains/{chain_id}")
def get_single_chain(
    match_id: int = Path(..., description="StatsBomb match ID"),
    chain_id: int = Path(..., description="Chain ID within this match"),
    db: Session = Depends(get_db),
):
    """
    Return the full event list for a single possession chain, including
    per-event xT values for animation.
    """
    row: PossessionChain | None = (
        db.query(PossessionChain)
        .filter(
            PossessionChain.match_id == str(match_id),
            PossessionChain.chain_id == chain_id,
        )
        .first()
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Chain {chain_id} not found for match {match_id}. "
                "Call GET /api/matches/{match_id}/chains first to build the cache."
            ),
        )

    try:
        events = json.loads(row.events_json) if row.events_json else []
    except json.JSONDecodeError:
        events = []

    return {
        "match_id": str(match_id),
        "chain_id": row.chain_id,
        "team": row.team,
        "start_minute": row.start_minute,
        "end_minute": row.end_minute,
        "duration_seconds": row.duration_seconds,
        "n_events": row.n_events,
        "total_xT": row.total_xT,
        "outcome": row.outcome,
        "events": events,
    }
