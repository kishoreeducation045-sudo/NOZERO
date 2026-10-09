"""
Unit tests for tool_agent functions and execution.
"""
import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.models.user import User
from app.models.goal import Goal
from app.services.tool_agent import run_tool_agent
from app.services.auth_service import hash_password

pytestmark = pytest.mark.asyncio


async def _make_user(db: AsyncSession) -> User:
    user = User(
        email=f"tool_test_{uuid.uuid4().hex[:6]}@example.com",
        name="Tool Tester",
        password_hash=hash_password("Pass123!"),
    )
    db.add(user)
    await db.flush()
    return user


async def test_tool_agent_delete_all_fast_path(db_session: AsyncSession):
    user = await _make_user(db_session)
    goal = Goal(
        user_id=user.id,
        title="Quest 1",
        priority="high",
        date=datetime.now(timezone.utc),
    )
    db_session.add(goal)
    await db_session.flush()

    res = await run_tool_agent("delete all my quests", [], user, db_session)
    assert res["action"] == "delete_all"
    assert len(res["deleted_goal_ids"]) == 1


async def test_tool_agent_no_ai_key_fallback(db_session: AsyncSession):
    user = await _make_user(db_session)
    with patch("app.services.tool_agent.get_openai_client", return_value=None):
        res = await run_tool_agent("what quests do I have?", [], user, db_session)
        assert res["action"] == "chat"
        assert "unavailable" in res["assistant_reply"].lower()
