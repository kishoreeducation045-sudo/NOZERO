"""
Real-Life Dungeon Master — FastAPI backend entry point.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.session import engine
from app.db.base import Base
# Import all models so Alembic/metadata can see them
from app.models import User, Activity, Goal, ScheduleItem, ScoreEvent, DailyScore, UserSettings

# API routers
from app.api.health import router as health_router
from app.api.auth import router as auth_router
from app.api.activities import router as activities_router
from app.api.goals import router as goals_router
from app.api.schedule import router as schedule_router
from app.api.analytics import router as analytics_router
from app.api.scoring import router as scoring_router
from app.api.ai import router as ai_router
from app.api.voice import router as voice_router


import logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Safe database table initialization on startup
    try:
        from app.db.session import ensure_tables
        await ensure_tables()
    except Exception as e:
        logger.warning("Startup schema check note: %s", e)
    yield
    try:
        await engine.dispose()
    except Exception:
        pass


app = FastAPI(
    title="Real-Life Dungeon Master",
    description="Automatic productivity tracking, scoring, and AI coaching.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS configuration
cors_origins = settings.cors_origins
allow_all = "*" in cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if not allow_all else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse

# Root directory for static assets
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if not os.path.exists(STATIC_DIR):
    alt = os.path.join(os.getcwd(), "app", "static")
    if os.path.exists(alt):
        STATIC_DIR = alt

if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# Root endpoint: Serves interactive Web UI to browsers, JSON fallback
@app.get("/", tags=["root"])
async def root():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        try:
            with open(index_file, "r", encoding="utf-8") as f:
                return HTMLResponse(content=f.read())
        except Exception:
            return FileResponse(index_file)
    return {
        "status": "ok",
        "service": "Real-Life Dungeon Master API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/api/v1/health",
    }


# Register routers
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(activities_router)
app.include_router(goals_router)
app.include_router(schedule_router)
app.include_router(analytics_router)
app.include_router(scoring_router)
app.include_router(ai_router)
app.include_router(voice_router)
