"""
chain_service.py — Phase 11: Possession Chain Analysis
=======================================================
Segments raw StatsBomb match events into possession chains, values each
chain with Δ-xT from the Karun Singh 12×8 grid, and returns structured
summaries for the API and frontend.
"""
from __future__ import annotations

import json
import math
from typing import Optional

from sqlalchemy.orm import Session

from models.db_models import Event, Match, PossessionChain
from services.xt_service import XTService, XT_GRID  # reuse Phase 8 grid & helper

# ---------------------------------------------------------------------------
# Event type classification
# ---------------------------------------------------------------------------

#: Action types that are part of a possession chain
CHAIN_INCLUDE = {
    "Pass", "Carry", "Ball Receipt*", "Dribble", "Shot",
    "Pressure", "Ball Recovery", "Clearance", "Interception", "Duel",
    "Foul Won", "Offside",
}

#: Event types that always terminate the current chain
CHAIN_TERMINATORS = {"Shot", "Foul Committed", "Half End", "Half Start"}

#: Event types that signal ball is out / possession changes (new chain for same team OK)
DEAD_BALL_TYPES = {"Corner Received", "Throw-in", "Goal Kick", "Free Kick"}


def _parse_minute(timestamp: Optional[str], period: int = 1) -> float:
    """Convert StatsBomb timestamp string 'mm:ss.ff' to absolute match minute."""
    if not timestamp:
        return 0.0
    try:
        parts = timestamp.split(":")
        mins = int(parts[0]) if len(parts) > 0 else 0
        secs = float(parts[1]) if len(parts) > 1 else 0.0
        base = (period - 1) * 45
        return base + mins + secs / 60.0
    except (ValueError, IndexError):
        return 0.0


def _safe_float(val: object) -> float:
    """Return float or 0.0, handling None / NaN."""
    try:
        v = float(val)  # type: ignore[arg-type]
        return 0.0 if math.isnan(v) or math.isinf(v) else v
    except (TypeError, ValueError):
        return 0.0


def _end_location(event_type: str, details: dict) -> tuple[Optional[float], Optional[float]]:
    """Extract end-location from event details for xT delta calculation."""
    if event_type == "Pass":
        loc = details.get("pass_end_location")
    elif event_type == "Carry":
        loc = details.get("carry_end_location")
    elif event_type == "Dribble":
        loc = details.get("dribble_end_location")
    else:
        loc = None
    if isinstance(loc, list) and len(loc) >= 2:
        return _safe_float(loc[0]), _safe_float(loc[1])
    return None, None


# ---------------------------------------------------------------------------
# PUBLIC FUNCTION 1 — segment_chains
# ---------------------------------------------------------------------------

def segment_chains(match_id: int, db: Session) -> list[dict]:
    """
    Load all events for *match_id* from the DB and split them into
    possession chains.

    Parameters
    ----------
    match_id : int
    db       : SQLAlchemy Session

    Returns
    -------
    list[dict]  — raw chains, each without xT values (call compute_chain_xt next)
    """
    # ── 1. Load events ordered by StatsBomb index (details["index"]) ─────
    raw_events = (
        db.query(Event)
        .filter(Event.match_id == match_id)
        .all()
    )

    if not raw_events:
        return []

    # Sort by the StatsBomb index stored in details, fall back to DB row order
    def _sort_key(e: Event) -> int:
        details = e.details or {}
        return int(details.get("index", 999999))

    raw_events.sort(key=_sort_key)

    # ── 2. Segment into chains ────────────────────────────────────────────
    chains: list[dict] = []
    current_chain: list[dict] = []
    current_team: Optional[str] = None
    chain_id_counter = 1

    def _flush_chain(outcome: str) -> None:
        nonlocal chain_id_counter, current_chain, current_team
        if not current_chain:
            return

        start_min = current_chain[0]["minute"]
        end_min = current_chain[-1]["minute"]
        dur = max(0.0, (end_min - start_min) * 60.0)

        chains.append({
            "chain_id": chain_id_counter,
            "team": current_team,
            "start_minute": round(start_min, 2),
            "end_minute": round(end_min, 2),
            "duration_seconds": round(dur, 1),
            "n_events": len(current_chain),
            "events": current_chain,
            "total_xT": 0.0,   # filled by compute_chain_xt
            "outcome": outcome,
        })
        chain_id_counter += 1
        current_chain = []
        current_team = None

    for ev in raw_events:
        etype = ev.type or ""
        team = ev.team or ""
        details = ev.details or {}
        period = int(details.get("period", 1))
        minute = _parse_minute(ev.timestamp, period)

        # Skip events that are not relevant for chain analysis
        if etype not in CHAIN_INCLUDE and etype not in CHAIN_TERMINATORS:
            # Special terminator checks regardless of include set
            if etype in ("Half End", "Half Start"):
                _flush_chain("half_end")
            continue

        # ── Possession change → flush old chain ──────────────────────────
        if current_team and team and team != current_team:
            _flush_chain("possession_lost")

        # ── Foul Committed → terminates chain for the team that fouled ───
        if etype == "Foul Committed":
            _flush_chain("foul_won")
            continue

        # ── Half End / Start → flush ──────────────────────────────────────
        if etype in ("Half End", "Half Start"):
            _flush_chain("half_end")
            continue

        # ── Build event dict ──────────────────────────────────────────────
        end_x, end_y = _end_location(etype, details)
        event_dict: dict = {
            "event_id": ev.event_id,
            "type": etype,
            "player": ev.player or "",
            "team": team,
            "minute": round(minute, 2),
            "x": _safe_float(ev.x) if ev.x is not None else None,
            "y": _safe_float(ev.y) if ev.y is not None else None,
            "end_x": end_x,
            "end_y": end_y,
            "outcome": ev.outcome or "",
            "xT_start": 0.0,
            "xT_end": 0.0,
            "delta_xT": 0.0,
        }

        current_team = team
        current_chain.append(event_dict)

        # ── Shot terminates chain ─────────────────────────────────────────
        if etype == "Shot":
            _flush_chain("shot")

    # Flush any remaining events
    _flush_chain("possession_lost")

    return chains


# ---------------------------------------------------------------------------
# PUBLIC FUNCTION 2 — compute_chain_xt
# ---------------------------------------------------------------------------

def compute_chain_xt(chain: dict) -> dict:
    """
    Annotate each event in *chain* with xT_start, xT_end, delta_xT.
    Mutates and returns the chain dict.
    """
    total = 0.0
    for ev in chain["events"]:
        etype = ev["type"]
        x, y = ev.get("x"), ev.get("y")
        end_x, end_y = ev.get("end_x"), ev.get("end_y")

        if x is None or y is None:
            ev["xT_start"] = 0.0
            ev["xT_end"] = 0.0
            ev["delta_xT"] = 0.0
            continue

        if etype in ("Pass", "Carry", "Dribble") and end_x is not None and end_y is not None:
            # Only completed passes contribute positive xT
            if etype == "Pass" and ev.get("outcome") not in (None, "", "Complete"):
                # Incomplete pass — still compute so frontend can show negative delta
                pass
            xt_start = XTService.get_cell_xt(x, y)
            xt_end = XTService.get_cell_xt(end_x, end_y)
            delta = xt_end - xt_start
        else:
            xt_start = XTService.get_cell_xt(x, y)
            xt_end = xt_start
            delta = 0.0

        ev["xT_start"] = round(xt_start, 5)
        ev["xT_end"] = round(xt_end, 5)
        ev["delta_xT"] = round(delta, 5)
        total += delta

    chain["total_xT"] = round(total, 5)
    return chain


# ---------------------------------------------------------------------------
# PUBLIC FUNCTION 3 — get_chain_summary
# ---------------------------------------------------------------------------

def get_chain_summary(match_id: int, db: Session) -> dict:
    """
    Segment, value, and summarise all possession chains for *match_id*.

    Returns a dict with:
      match_id, home_team, away_team, total_chains,
      chains_by_team, all_chains (sorted by total_xT desc)
    """
    # ── Identify teams from the Match record ─────────────────────────────
    match = db.query(Match).filter(Match.match_id == match_id).first()
    home_team = match.home_team if match else ""
    away_team = match.away_team if match else ""

    # ── Segment and value chains ──────────────────────────────────────────
    raw_chains = segment_chains(match_id, db)
    if not raw_chains:
        return {}

    valued_chains = [compute_chain_xt(c) for c in raw_chains]

    # ── Build per-team summary ────────────────────────────────────────────
    def _team_summary(team_name: str) -> dict:
        tc = [c for c in valued_chains if c["team"] == team_name]
        if not tc:
            return {
                "n_chains": 0,
                "total_xT": 0.0,
                "avg_xT_per_chain": 0.0,
                "avg_chain_duration_seconds": 0.0,
                "top_5_chains": [],
            }
        total_xt = sum(c["total_xT"] for c in tc)
        avg_xt = total_xt / len(tc)
        avg_dur = sum(c["duration_seconds"] for c in tc) / len(tc)
        top5 = sorted(tc, key=lambda c: c["total_xT"], reverse=True)[:5]
        return {
            "n_chains": len(tc),
            "total_xT": round(total_xt, 4),
            "avg_xT_per_chain": round(avg_xt, 4),
            "avg_chain_duration_seconds": round(avg_dur, 1),
            "top_5_chains": [
                {
                    "chain_id": c["chain_id"],
                    "total_xT": c["total_xT"],
                    "outcome": c["outcome"],
                    "start_minute": c["start_minute"],
                }
                for c in top5
            ],
        }

    chains_by_team: dict = {}
    for team_name in (home_team, away_team):
        if team_name:
            chains_by_team[team_name] = _team_summary(team_name)

    # Fallback: cover teams not in the Match record
    for chain in valued_chains:
        t = chain["team"]
        if t and t not in chains_by_team:
            chains_by_team[t] = _team_summary(t)

    # ── Compact chain list (no full event array) for the summary ──────────
    all_chains_compact = sorted(
        [
            {
                "chain_id": c["chain_id"],
                "team": c["team"],
                "start_minute": c["start_minute"],
                "end_minute": c["end_minute"],
                "duration_seconds": c["duration_seconds"],
                "n_events": c["n_events"],
                "total_xT": c["total_xT"],
                "outcome": c["outcome"],
            }
            for c in valued_chains
        ],
        key=lambda c: c["total_xT"],
        reverse=True,
    )

    return {
        "match_id": str(match_id),
        "home_team": home_team,
        "away_team": away_team,
        "total_chains": len(valued_chains),
        "chains_by_team": chains_by_team,
        "all_chains": all_chains_compact,
        # Full chains stored separately for DB persistence (not in HTTP summary)
        "_full_chains": valued_chains,
    }


# ---------------------------------------------------------------------------
# DB persistence helpers
# ---------------------------------------------------------------------------

def save_chains_to_db(match_id: int, full_chains: list[dict], db: Session) -> None:
    """
    Upsert valued chain records into the possession_chains table.
    Delete-then-insert to cleanly handle re-runs.
    """
    # Clear existing records for this match
    db.query(PossessionChain).filter(
        PossessionChain.match_id == str(match_id)
    ).delete(synchronize_session=False)

    for c in full_chains:
        row = PossessionChain(
            match_id=str(match_id),
            chain_id=c["chain_id"],
            team=c["team"],
            start_minute=c["start_minute"],
            end_minute=c["end_minute"],
            duration_seconds=c["duration_seconds"],
            n_events=c["n_events"],
            total_xT=c["total_xT"],
            outcome=c["outcome"],
            events_json=json.dumps(c["events"]),
        )
        db.add(row)

    db.commit()


def load_chains_from_db(match_id: int, db: Session) -> list[PossessionChain]:
    """Return cached PossessionChain rows for this match, or []."""
    return (
        db.query(PossessionChain)
        .filter(PossessionChain.match_id == str(match_id))
        .all()
    )


def reconstruct_summary_from_db(
    match_id: int, rows: list[PossessionChain], db: Session
) -> dict:
    """Re-build a get_chain_summary-compatible dict from cached DB rows."""
    match = db.query(Match).filter(Match.match_id == match_id).first()
    home_team = match.home_team if match else ""
    away_team = match.away_team if match else ""

    all_chains_compact = sorted(
        [
            {
                "chain_id": r.chain_id,
                "team": r.team,
                "start_minute": r.start_minute,
                "end_minute": r.end_minute,
                "duration_seconds": r.duration_seconds,
                "n_events": r.n_events,
                "total_xT": r.total_xT,
                "outcome": r.outcome,
            }
            for r in rows
        ],
        key=lambda c: c["total_xT"],
        reverse=True,
    )

    def _team_summary(team_name: str) -> dict:
        tc = [c for c in all_chains_compact if c["team"] == team_name]
        if not tc:
            return {"n_chains": 0, "total_xT": 0.0, "avg_xT_per_chain": 0.0,
                    "avg_chain_duration_seconds": 0.0, "top_5_chains": []}
        total_xt = sum(c["total_xT"] or 0 for c in tc)
        avg_xt = total_xt / len(tc)
        avg_dur = sum(c["duration_seconds"] or 0 for c in tc) / len(tc)
        top5 = sorted(tc, key=lambda c: c["total_xT"] or 0, reverse=True)[:5]
        return {
            "n_chains": len(tc),
            "total_xT": round(total_xt, 4),
            "avg_xT_per_chain": round(avg_xt, 4),
            "avg_chain_duration_seconds": round(avg_dur, 1),
            "top_5_chains": [
                {"chain_id": c["chain_id"], "total_xT": c["total_xT"],
                 "outcome": c["outcome"], "start_minute": c["start_minute"]}
                for c in top5
            ],
        }

    chains_by_team: dict = {}
    for team_name in (home_team, away_team):
        if team_name:
            chains_by_team[team_name] = _team_summary(team_name)
    for row in rows:
        if row.team and row.team not in chains_by_team:
            chains_by_team[row.team] = _team_summary(row.team)

    return {
        "match_id": str(match_id),
        "home_team": home_team,
        "away_team": away_team,
        "total_chains": len(rows),
        "chains_by_team": chains_by_team,
        "all_chains": all_chains_compact,
        "source": "cache",
    }


def get_xt_grid_as_list() -> list[list[float]]:
    """Return the 12×8 Karun Singh xT grid as a Python list of lists."""
    return XT_GRID.tolist()
