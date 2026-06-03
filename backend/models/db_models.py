from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, UniqueConstraint, Text
from sqlalchemy.sql import func
from database import Base

class Match(Base):
    __tablename__ = "matches"

    match_id = Column(Integer, primary_key=True, index=True)
    competition_id = Column(Integer, index=True)
    season_id = Column(Integer, index=True)
    competition = Column(String, index=True)
    season = Column(String, index=True)
    home_team = Column(String, index=True)
    away_team = Column(String, index=True)
    date = Column(String)
    home_score = Column(Integer, default=0)
    away_score = Column(Integer, default=0)
    last_updated = Column(DateTime, default=func.now(), onupdate=func.now())

class Event(Base):
    __tablename__ = "events"

    event_id = Column(String, primary_key=True, index=True)
    match_id = Column(Integer, index=True)
    type = Column(String, index=True)
    player = Column(String, index=True, nullable=True)
    team = Column(String, index=True)
    x = Column(Float, nullable=True)
    y = Column(Float, nullable=True)
    timestamp = Column(String)
    outcome = Column(String, index=True, nullable=True)
    xg = Column(Float, nullable=True)
    details = Column(JSON, nullable=True)

class PlayerStats(Base):
    __tablename__ = "player_stats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    player = Column(String, index=True)
    team = Column(String, index=True)
    season = Column(String, index=True)
    competition = Column(String, index=True)
    stat_type = Column(String, index=True)  # e.g., 'standard', 'shooting', etc.
    stats = Column(JSON)  # Stores all standard/advanced FBRef metrics
    last_updated = Column(DateTime, default=func.now(), onupdate=func.now())

class TeamStats(Base):
    __tablename__ = "team_stats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    team = Column(String, index=True)
    season = Column(String, index=True)
    competition = Column(String, index=True)
    stat_type = Column(String, index=True)  # e.g., 'standard', 'shooting', etc.
    stats = Column(JSON)
    last_updated = Column(DateTime, default=func.now(), onupdate=func.now())

class XGModel(Base):
    __tablename__ = "xg_models"

    model_id = Column(String, primary_key=True, index=True)
    algorithm = Column(String)
    features = Column(JSON)  # List of feature names
    auc_score = Column(Float)
    trained_at = Column(DateTime, default=func.now())
    file_path = Column(String)


# ── Phase 10: Team Style Clustering ─────────────────────────────────────────
class TeamCluster(Base):
    __tablename__ = "team_clusters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    team = Column(String, index=True, nullable=False)
    season = Column(String, index=True, nullable=False)
    competition = Column(String, index=True, nullable=False)
    cluster_id = Column(Integer, nullable=False)
    archetype = Column(String, nullable=False)
    pca_x = Column(Float, nullable=True)
    pca_y = Column(Float, nullable=True)
    # Key stats stored for quick retrieval
    goals_per90 = Column(Float, nullable=True)
    xg_per90 = Column(Float, nullable=True)
    ppda = Column(Float, nullable=True)
    possession_pct = Column(Float, nullable=True)
    passes_per90 = Column(Float, nullable=True)
    created_at = Column(DateTime, default=func.now())

    __table_args__ = (
        UniqueConstraint("team", "season", "competition", name="uq_team_season_competition"),
    )


# ── Phase 11: Possession Chain Analysis ──────────────────────────────────────
class PossessionChain(Base):
    __tablename__ = "possession_chains"

    id = Column(Integer, primary_key=True, autoincrement=True)
    match_id = Column(String, index=True, nullable=False)
    chain_id = Column(Integer, nullable=False)
    team = Column(String, index=True, nullable=False)
    start_minute = Column(Float, nullable=True)
    end_minute = Column(Float, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    n_events = Column(Integer, nullable=True)
    total_xT = Column(Float, nullable=True)
    outcome = Column(String, nullable=True)   # shot / possession_lost / foul_won / half_end
    events_json = Column(Text, nullable=True)  # JSON-serialised list of event dicts
    created_at = Column(DateTime, default=func.now())

    __table_args__ = (
        UniqueConstraint("match_id", "chain_id", name="uq_match_chain"),
    )
