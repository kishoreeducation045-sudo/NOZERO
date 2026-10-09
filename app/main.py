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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (dev only — use Alembic in production)
    if settings.is_development:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="Real-Life Dungeon Master",
    description="Automatic productivity tracking, scoring, and AI coaching.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Root directory for static assets
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# Root endpoint: Serves interactive Web UI to browsers, JSON to API clients
@app.get("/", tags=["root"])
async def root():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
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
