import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models.db_models  # Import to register models

# Create database tables automatically
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Football Analytics Intelligence Platform (FAIP)",
    description="Backend service for matches, event visualizations, scraper pipelines, and ML models.",
    version="1.0"
)

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
