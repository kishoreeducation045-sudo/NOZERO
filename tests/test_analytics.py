"""
Integration tests for Analytics endpoints (daily, weekly, day by query, top apps, websites).
"""
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_analytics_today(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/analytics/today", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "score" in data
    assert "top_apps" in data
    assert "top_websites" in data


async def test_analytics_week(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/analytics/week", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "average_score" in data


async def test_analytics_day_and_apps_and_websites(client: AsyncClient, auth_headers: dict):
    # Day
    resp_day = await client.get("/api/v1/analytics/day", headers=auth_headers)
    assert resp_day.status_code == 200

    # Apps
    resp_apps = await client.get("/api/v1/analytics/apps", headers=auth_headers)
    assert resp_apps.status_code == 200
    assert isinstance(resp_apps.json(), list)

    # Websites
    resp_sites = await client.get("/api/v1/analytics/websites", headers=auth_headers)
    assert resp_sites.status_code == 200
    assert isinstance(resp_sites.json(), list)


async def test_score_today_and_history(client: AsyncClient, auth_headers: dict):
    resp_score = await client.get("/api/v1/score/today", headers=auth_headers)
    assert resp_score.status_code == 200
    assert resp_score.json()["score"] >= 0

    resp_events = await client.get("/api/v1/score/events", headers=auth_headers)
    assert resp_events.status_code == 200
    assert isinstance(resp_events.json(), list)

    resp_hist = await client.get("/api/v1/score/history?days=7", headers=auth_headers)
    assert resp_hist.status_code == 200
    assert isinstance(resp_hist.json(), list)
