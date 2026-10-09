"""
Integration tests for Schedule endpoints and dynamic schedule shifting.
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_create_schedule_item(client: AsyncClient, auth_headers: dict):
    now = datetime.now(timezone.utc)
    resp = await client.post(
        "/api/v1/schedule",
        json={
            "title": "Deep Coding Session",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=1)).isoformat(),
            "source": "manual",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Deep Coding Session"
    assert data["status"] == "pending"
    assert data["is_completed"] is False


async def test_get_today_schedule(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/schedule/today", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_generate_schedule(client: AsyncClient, auth_headers: dict):
    # Ensure a goal exists
    await client.post(
        "/api/v1/goals",
        json={"title": "Algorithms Practice", "priority": "high", "estimated_minutes": 60},
        headers=auth_headers,
    )
    resp = await client.post(
        "/api/v1/schedule/generate",
        json={"notes": "Focus on morning work"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0


async def test_reschedule_item(client: AsyncClient, auth_headers: dict):
    now = datetime.now(timezone.utc)
    create_resp = await client.post(
        "/api/v1/schedule",
        json={
            "title": "Meeting with Mentor",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(minutes=30)).isoformat(),
        },
        headers=auth_headers,
    )
    item_id = create_resp.json()["id"]

    new_start = now + timedelta(hours=2)
    new_end = new_start + timedelta(minutes=45)

    resched_resp = await client.post(
        f"/api/v1/schedule/{item_id}/reschedule",
        json={"start_time": new_start.isoformat(), "end_time": new_end.isoformat()},
        headers=auth_headers,
    )
    assert resched_resp.status_code == 200
    data = resched_resp.json()
    assert data["id"] == item_id


async def test_shift_schedule_overrun(client: AsyncClient, auth_headers: dict):
    now = datetime.now(timezone.utc)
    # Block 1: 10:00 to 11:00
    item1_resp = await client.post(
        "/api/v1/schedule",
        json={
            "title": "Block 1",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=1)).isoformat(),
        },
        headers=auth_headers,
    )
    item1_id = item1_resp.json()["id"]

    # Block 2: Starts at end of Block 1 (11:00 to 12:00)
    block2_start = now + timedelta(hours=1)
    item2_resp = await client.post(
        "/api/v1/schedule",
        json={
            "title": "Block 2",
            "start_time": block2_start.isoformat(),
            "end_time": (block2_start + timedelta(hours=1)).isoformat(),
        },
        headers=auth_headers,
    )
    item2_id = item2_resp.json()["id"]

    # Shift remaining blocks after Block 1 by 30 minutes overrun
    shift_resp = await client.post(
        "/api/v1/schedule/shift",
        json={"item_id": item1_id, "overrun_minutes": 30},
        headers=auth_headers,
    )
    assert shift_resp.status_code == 200
    data = shift_resp.json()
    assert isinstance(data, list)
    shifted_item2 = next((i for i in data if i["id"] == item2_id), None)
    assert shifted_item2 is not None
