import math
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from database import engine, Base
import models.db_models  # Import to register models
import json

class NaNSafeJSONResponse(JSONResponse):
    """Custom JSON response that converts NaN/Infinity to null."""
    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            default=str,
        ).encode("utf-8")

def _sanitize(obj):
    """Recursively replace NaN / Inf floats with None so JSON serialization never fails."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize(v) for v in obj]
    return obj

class SafeJSONResponse(JSONResponse):
    """JSONResponse that sanitizes NaN/Inf before serialization."""
    def render(self, content) -> bytes:
        cleaned = _sanitize(content)
        return json.dumps(
            cleaned,
            ensure_ascii=False,
            default=str,
        ).encode("utf-8")

# Create database tables automatically
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Football Analytics Intelligence Platform (FAIP)",
    description="Backend service for matches, event visualizations, scraper pipelines, and ML models.",
    version="1.0",
    default_response_class=SafeJSONResponse,
)

import threading
import sys
import os

def run_background_seeding():
    try:
        # Resolve absolute path to project root
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        if project_root not in sys.path:
            sys.path.append(project_root)
        from scripts.seed_statsbomb import seed
        print("Starting StatsBomb background database seeding...")
        seed()
        print("StatsBomb background database seeding completed successfully.")
    except Exception as e:
        print(f"Error during background database seeding: {e}")

@app.on_event("startup")
def startup_event():
    from database import SessionLocal
    from models.db_models import Match
    db = SessionLocal()
    try:
        match_count = db.query(Match).count()
        if match_count == 0:
            print("Database is empty. Spawning background thread to seed StatsBomb data...")
            threading.Thread(target=run_background_seeding, daemon=True).start()
        else:
            print(f"Database already contains {match_count} matches. Skipping auto-seeding.")
    except Exception as e:
        print(f"Error checking database state for auto-seeding: {e}")
    finally:
        db.close()

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers
from routers import competitions, matches, visualizations, scraper, player, ml, report, xt
app.include_router(competitions.router)
app.include_router(matches.router)
app.include_router(visualizations.router)
app.include_router(scraper.router)
app.include_router(player.router)
app.include_router(ml.router)
app.include_router(report.router)
app.include_router(xt.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to FAIP FastAPI Backend!"}

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
