import uuid
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.schemas.activity import ActivityCreate, ActivityBatchCreate, ActivityOut
from app.services.activity_service import (
    create_activity, create_activities_batch,
    get_activities_today, get_activities, delete_activity
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/v1/activities", tags=["activities"])


@router.post("", response_model=ActivityOut, status_code=status.HTTP_201_CREATED)
async def ingest_activity(
    data: ActivityCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_activity(db, current_user.id, data)


@router.post("/batch", response_model=List[ActivityOut], status_code=status.HTTP_201_CREATED)
async def ingest_batch(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

    if isinstance(body, list):
        if not body:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Activities list cannot be empty")
        try:
            activity_items = [ActivityCreate.model_validate(item) for item in body]
        except Exception as ve:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve))
    elif isinstance(body, dict) and "activities" in body:
        if not body["activities"]:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Activities list cannot be empty")
        try:
            batch = ActivityBatchCreate(**body)
            activity_items = batch.activities
        except Exception as ve:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve))
    else:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Expected a list of activities or an object with 'activities' key")

    return await create_activities_batch(db, current_user.id, activity_items)



@router.get("/today", response_model=List[ActivityOut])
async def list_today(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_activities_today(db, current_user.id)


@router.get("", response_model=List[ActivityOut])
async def list_activities(
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    category: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_activities(
        db, current_user.id, limit, offset, category, source, date_from, date_to
    )


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_activity(
    activity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_activity(db, activity_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
