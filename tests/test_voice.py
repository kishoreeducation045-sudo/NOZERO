"""
Integration tests for Voice Agent endpoints and product tools execution.
"""
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_voice_tools_manifest(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/voice/tools", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "tools" in data
    assert len(data["tools"]) >= 5
    tool_names = [t["name"] for t in data["tools"]]
    assert "get_today_score" in tool_names
    assert "create_goal" in tool_names
    assert "complete_goal" in tool_names


async def test_execute_voice_tool_get_today_score(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/voice/tool",
        json={"tool_name": "get_today_score", "arguments": {}},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "result" in data
    assert "score" in data["result"]


async def test_execute_voice_tool_create_and_complete_goal(client: AsyncClient, auth_headers: dict):
    # Create goal via tool
    create_resp = await client.post(
        "/api/v1/voice/tool",
        json={
            "tool_name": "create_goal",
            "arguments": {"title": "Voice Quest Alpha", "priority": "high", "estimated_minutes": 45},
        },
        headers=auth_headers,
    )
    assert create_resp.status_code == 200
    create_data = create_resp.json()["result"]
    assert create_data.get("success") is True

    # Complete goal via tool
    comp_resp = await client.post(
        "/api/v1/voice/tool",
        json={
            "tool_name": "complete_goal",
            "arguments": {"title": "Voice Quest Alpha"},
        },
        headers=auth_headers,
    )
    assert comp_resp.status_code == 200
    comp_data = comp_resp.json()["result"]
    assert comp_data.get("success") is True


async def test_execute_voice_tool_get_today_schedule(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/voice/tool",
        json={"tool_name": "get_today_schedule", "arguments": {}},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert "schedule" in resp.json()["result"]


async def test_execute_voice_tool_get_daily_insights(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/voice/tool",
        json={"tool_name": "get_daily_insights", "arguments": {}},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert "insights" in resp.json()["result"]
