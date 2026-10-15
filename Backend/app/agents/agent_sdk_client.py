"""
LOCAL DEVELOPMENT ONLY: run model calls through the Claude Agent SDK.

The Agent SDK drives the Claude Code CLI, which authenticates with the
developer's own Claude login. That lets the analysis pipeline be exercised end
to end on a laptop without an API key. It is not a credential a deployed
service may use, and Settings refuses LLM_PROVIDER=claude_agent_sdk when
APP_ENV=production.

SECURITY: analysis prompts contain untrusted repository content, and the
Agent SDK is an agent harness - by default it can run shell commands and read
and write files. A prompt-injection string in a scanned repository could
otherwise make it act on this machine. So every call runs with:

  - tools=[]                 no built-in tools at all (Bash, Read, Write, ...)
  - mcp_servers={} + strict  none of the developer's MCP servers are loaded
  - setting_sources=[]       no user/project settings, hooks or CLAUDE.md
  - permission_mode=dontAsk  anything not pre-approved is denied, not prompted
  - an empty temporary cwd   nothing to read even if a tool slipped through

Structured output still works under these restrictions: the SDK supplies its
own StructuredOutput tool for it.
"""
import asyncio
import json
import tempfile
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from app.core.config import get_settings

settings = get_settings()

# Two turns for structured output (answer, then the StructuredOutput call),
# with one spare. Nothing else can take a turn: no tools are available.
_MAX_TURNS = 3


class AgentSDKError(Exception):
    """The Agent SDK call ended without a usable result."""


@dataclass
class Completion:
    text: str
    input_tokens: int
    output_tokens: int
    stop_reason: Optional[str]


def _render_prompt(turns: List[Dict[str, str]]) -> str:
    """
    query() takes one prompt string per session. A single user turn is passed
    through as-is; a multi-turn conversation (the chat assistant) is rendered
    as a transcript ending with the latest user message.
    """
    if len(turns) == 1:
        return turns[0]["content"]
    history = "\n\n".join(
        f"{'User' if t['role'] == 'user' else 'Assistant'}: {t['content']}"
        for t in turns[:-1]
    )
    return (
        "Conversation so far:\n\n"
        f"{history}\n\n"
        "Reply to the latest message as the assistant:\n\n"
        f"{turns[-1]['content']}"
    )


async def _run(system: str, turns: List[Dict[str, str]],
               json_schema: Optional[Dict[str, Any]]) -> Completion:
    from claude_agent_sdk import ClaudeAgentOptions, ResultMessage, query

    with tempfile.TemporaryDirectory(prefix="repoiq-llm-") as empty_cwd:
        options = ClaudeAgentOptions(
            system_prompt=system or None,
            model=settings.ANTHROPIC_MODEL,
            effort=settings.ANTHROPIC_EFFORT,
            tools=[],
            mcp_servers={},
            strict_mcp_config=True,
            setting_sources=[],
            permission_mode="dontAsk",
            cwd=empty_cwd,
            max_turns=_MAX_TURNS,
            output_format=(
                {"type": "json_schema", "schema": json_schema} if json_schema else None
            ),
        )
        result = None
        async for message in query(prompt=_render_prompt(turns), options=options):
            if isinstance(message, ResultMessage):
                result = message

    if result is None:
        raise AgentSDKError("Agent SDK returned no result")
    if result.is_error or result.subtype != "success":
        raise AgentSDKError(
            f"Agent SDK call failed ({result.subtype}): {result.errors or result.result}"
        )

    if json_schema is not None:
        if result.structured_output is None:
            raise AgentSDKError("Agent SDK returned no structured output")
        text = json.dumps(result.structured_output)
    else:
        text = result.result or ""

    usage = result.usage or {}
    return Completion(
        text=text,
        input_tokens=int(usage.get("input_tokens") or 0),
        output_tokens=int(usage.get("output_tokens") or 0),
        stop_reason=result.stop_reason,
    )


def complete(system: str, turns: List[Dict[str, str]],
             json_schema: Optional[Dict[str, Any]] = None) -> Completion:
    """
    Blocking entry point, called through run_blocking like the API client.

    Runs its own event loop in the worker thread. The SDK spawns the CLI as a
    subprocess, which needs a loop that supports subprocesses (the Proactor
    loop on Windows); a fresh asyncio.run() guarantees that regardless of
    what loop uvicorn or Celery is using.
    """
    return asyncio.run(_run(system, turns, json_schema))
