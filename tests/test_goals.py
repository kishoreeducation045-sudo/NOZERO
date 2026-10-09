"""
Integration tests for Quest/Goal endpoints and tool calling.
"""
import uuid
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_create_goal(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/goals",
        json={
            "title": "Master Async Python",
            "priority": "high",
            "estimated_minutes": 90,
            "category": "Coding",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Master Async Python"
    assert data["priority"] == "high"
    assert data["target_duration_seconds"] == 5400
    assert data["estimated_minutes"] == 90
    assert not data["is_completed"]


async def test_list_goals(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/goals", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_list_today_goals(client: AsyncClient, auth_headers: dict):
    create_resp = await client.post(
        "/api/v1/goals",
        json={"title": "Today's Quest", "priority": "medium", "estimated_minutes": 30},
        headers=auth_headers,
    )
    assert create_resp.status_code == 201

    resp = await client.get("/api/v1/goals/today", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(g["title"] == "Today's Quest" for g in data)


async def test_update_goal(client: AsyncClient, auth_headers: dict):
    create_resp = await client.post(
        "/api/v1/goals",
        json={"title": "Draft Goal", "priority": "low"},
        headers=auth_headers,
    )
    goal_id = create_resp.json()["id"]

    update_resp = await client.patch(
        f"/api/v1/goals/{goal_id}",
        json={"title": "Updated Goal Title", "priority": "high"},
        headers=auth_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["title"] == "Updated Goal Title"
    assert update_resp.json()["priority"] == "high"


async def test_complete_goal(client: AsyncClient, auth_headers: dict):
    create_resp = await client.post(
        "/api/v1/goals",
        json={"title": "Quest To Complete", "priority": "critical"},
        headers=auth_headers,
    )
    goal_id = create_resp.json()["id"]

    comp_resp = await client.post(f"/api/v1/goals/{goal_id}/complete", headers=auth_headers)
    assert comp_resp.status_code == 200
    assert comp_resp.json()["status"] == "completed"
    assert comp_resp.json()["is_completed"] is True


async def test_delete_goal(client: AsyncClient, auth_headers: dict):
    create_resp = await client.post(
        "/api/v1/goals",
        json={"title": "Quest To Delete", "priority": "low"},
        headers=auth_headers,
    )
    goal_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/api/v1/goals/{goal_id}", headers=auth_headers)
    assert del_resp.status_code == 204

    # Verify not found after deletion
    patch_resp = await client.patch(
        f"/api/v1/goals/{goal_id}",
        json={"title": "Nope"},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 404


async def test_from_conversation_delete_all_shortcut(client: AsyncClient, auth_headers: dict):
    # Create one first
    await client.post(
        "/api/v1/goals",
        json={"title": "Temp Quest", "priority": "medium"},
        headers=auth_headers,
    )
    # Trigger delete all
    resp = await client.post(
        "/api/v1/goals/from-conversation",
        json={"text": "please clear all my quests", "conversation_history": []},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["action"] == "delete_all"
    assert "cleared" in data["assistant_reply"].lower()
