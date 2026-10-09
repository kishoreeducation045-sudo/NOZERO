"""
Integration tests for AI coach, planner, insights, and planner/coach agents.
"""
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_ai_chat_coach_response(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/ai/chat",
        json={"message": "How is my progress today?"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "reply" in data
    assert len(data["reply"]) > 0


async def test_ai_chat_voice_scheduling(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/ai/chat",
        json={"message": "schedule 2 hours of DSA and 1 hour of project work"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "reply" in data
    assert "schedule" in data["reply"].lower() or "tactical" in data["reply"].lower()


async def test_ai_insights_endpoint(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/ai/insights",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "insights" in data
    assert isinstance(data["insights"], list)


async def test_ai_plan_endpoint(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/ai/plan",
        json={"available_hours": 6.0},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "schedule" in data
    assert isinstance(data["schedule"], list)
