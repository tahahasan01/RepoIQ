"""
The development-only Agent SDK provider.

Two properties matter more than the provider working at all: it must never be
usable in production, and it must never be able to act on the machine, because
the prompts it receives contain untrusted repository content.
"""
import asyncio
import json
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def agent():
    from app.agents.base_agent import BaseAgent

    class _Agent(BaseAgent):
        async def analyze(self, code, file_path, context=None):
            return {}

        def get_agent_type(self):
            return "security"

    return _Agent()


def _result_message(**overrides):
    from claude_agent_sdk import ResultMessage

    fields = dict(
        subtype="success", duration_ms=1, duration_api_ms=1, is_error=False,
        num_turns=1, session_id="s", stop_reason="end_turn",
        usage={"input_tokens": 70, "output_tokens": 30}, result="hello",
        structured_output=None,
    )
    fields.update(overrides)
    return ResultMessage(**fields)


def _fake_query(captured, message):
    async def fake_query(*, prompt, options=None, transport=None):
        captured["prompt"] = prompt
        captured["options"] = options
        yield message
    return fake_query


class TestProductionGuard:

    def test_agent_sdk_provider_is_refused_in_production(self):
        from pydantic import ValidationError
        from app.core.config import Settings

        with pytest.raises(ValidationError, match="local development only"):
            Settings(APP_ENV="production", LLM_PROVIDER="claude_agent_sdk")

    def test_agent_sdk_provider_is_allowed_in_development(self):
        from app.core.config import Settings

        assert Settings(APP_ENV="development", LLM_PROVIDER="claude_agent_sdk")

    def test_api_provider_is_the_default(self):
        from app.core.config import Settings

        assert Settings().LLM_PROVIDER == "anthropic"


class TestAgentSdkCannotActOnTheMachine:
    """A prompt-injection string in a scanned repo must have nothing to call."""

    def _options(self, json_schema=None):
        from app.agents import agent_sdk_client

        captured = {}
        with patch("claude_agent_sdk.query", _fake_query(captured, _result_message(
            structured_output={"ok": True} if json_schema else None,
        ))):
            agent_sdk_client.complete("sys", [{"role": "user", "content": "x"}], json_schema)
        return captured["options"]

    def test_no_built_in_tools(self):
        assert self._options().tools == []

    def test_no_mcp_servers_and_no_inherited_config(self):
        options = self._options()
        assert options.mcp_servers == {}
        assert options.strict_mcp_config is True
        assert options.setting_sources == []

    def test_nothing_is_auto_approved(self):
        assert self._options().permission_mode == "dontAsk"

    def test_runs_in_an_empty_directory(self):
        import os

        cwd = self._options().cwd
        # The temporary directory is removed when the call returns.
        assert "repoiq-llm-" in str(cwd)
        assert not os.path.exists(cwd)


class TestAgentSdkResults:

    def test_text_result_is_returned(self, agent, monkeypatch):
        from app.agents import base_agent

        monkeypatch.setattr(base_agent.settings, "LLM_PROVIDER", "claude_agent_sdk")
        with patch("claude_agent_sdk.query", _fake_query({}, _result_message(result="hi there"))):
            text = asyncio.run(agent._call_llm([{"role": "user", "content": "x"}]))
        assert text == "hi there"

    def test_structured_output_is_returned_as_json(self, agent, monkeypatch):
        from app.agents import base_agent

        monkeypatch.setattr(base_agent.settings, "LLM_PROVIDER", "claude_agent_sdk")
        captured = {}
        message = _result_message(result="ignored", structured_output={"issues": []})
        with patch("claude_agent_sdk.query", _fake_query(captured, message)):
            text = asyncio.run(agent._call_llm(
                [{"role": "user", "content": "x"}], json_schema={"type": "object"},
            ))
        assert json.loads(text) == {"issues": []}
        assert captured["options"].output_format == {
            "type": "json_schema", "schema": {"type": "object"},
        }

    def test_error_result_raises(self, monkeypatch):
        from app.agents import agent_sdk_client

        message = _result_message(subtype="error_max_turns", is_error=True, result=None)
        with patch("claude_agent_sdk.query", _fake_query({}, message)):
            with pytest.raises(agent_sdk_client.AgentSDKError):
                agent_sdk_client.complete("", [{"role": "user", "content": "x"}])

    def test_missing_structured_output_raises(self):
        from app.agents import agent_sdk_client

        with patch("claude_agent_sdk.query", _fake_query({}, _result_message())):
            with pytest.raises(agent_sdk_client.AgentSDKError):
                agent_sdk_client.complete(
                    "", [{"role": "user", "content": "x"}], {"type": "object"},
                )

    def test_truncation_still_raises(self, agent, monkeypatch):
        from app.agents import base_agent

        monkeypatch.setattr(base_agent.settings, "LLM_PROVIDER", "claude_agent_sdk")
        message = _result_message(stop_reason="max_tokens")
        with patch("claude_agent_sdk.query", _fake_query({}, message)):
            with pytest.raises(base_agent.LLMResponseTruncated):
                asyncio.run(agent._call_llm([{"role": "user", "content": "x"}]))

    def test_spend_is_recorded(self, agent, monkeypatch):
        from app.agents import base_agent

        monkeypatch.setattr(base_agent.settings, "LLM_PROVIDER", "claude_agent_sdk")
        monkeypatch.setattr(base_agent, "enforce_spend_budget", MagicMock(
            side_effect=lambda user_id: asyncio.sleep(0)
        ))
        recorded = {}
        monkeypatch.setattr(base_agent, "record_spend", lambda u, t: recorded.update({u: t}))
        with patch("claude_agent_sdk.query", _fake_query({}, _result_message())):
            asyncio.run(agent._call_llm([{"role": "user", "content": "x"}], user_id="u1"))
        assert recorded == {"u1": 100}

    def test_conversation_is_rendered_as_a_transcript(self):
        from app.agents.agent_sdk_client import _render_prompt

        prompt = _render_prompt([
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": "reply"},
            {"role": "user", "content": "second"},
        ])
        assert prompt.index("first") < prompt.index("reply") < prompt.index("second")
        assert prompt.rstrip().endswith("second")
