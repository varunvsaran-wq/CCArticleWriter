import asyncio
import json
from typing import Callable, Awaitable
import anthropic
from anthropic import APIConnectionError, APIStatusError, RateLimitError

_client: anthropic.AsyncAnthropic | None = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic()
    return _client


async def call_with_retry(client: anthropic.AsyncAnthropic, **kwargs):
    """messages.create with exponential backoff on transient errors (~31s total)."""
    delays = [1, 2, 4, 8, 16]
    last_exc: Exception | None = None
    for attempt in range(len(delays) + 1):
        try:
            return await client.messages.create(**kwargs)
        except RateLimitError as e:
            last_exc = e
        except APIConnectionError as e:
            last_exc = e
        except APIStatusError as e:
            if e.status_code and e.status_code >= 500:
                last_exc = e
            else:
                raise
        if attempt < len(delays):
            await asyncio.sleep(delays[attempt])
    assert last_exc is not None
    raise last_exc


def cached_system(prompt: str) -> list[dict]:
    """Wrap a system prompt as a content-block list with an ephemeral cache breakpoint.

    The first call writes the cache (~1.25x cost). Subsequent calls within ~5min
    hit the cache (~0.1x cost). Effective for agents that iterate many times.
    """
    return [{
        "type": "text",
        "text": prompt,
        "cache_control": {"type": "ephemeral"},
    }]


def _truncate_tool_history(messages: list[dict], keep_recent: int = 3) -> list[dict]:
    """Stub tool_result payloads older than the last `keep_recent` tool turns.

    The researcher loop accumulates large fetched-page payloads across iterations
    — each iteration re-sends the full conversation, so old fetch results inflate
    input tokens quadratically. Once the model has used a result and moved on,
    we don't need to re-send the full text.

    Only touches `tool_result` blocks in user messages. Leaves `tool_use` blocks
    in assistant messages and any `server_tool_use` / `web_search_tool_result`
    blocks (from native server tools) untouched — those must stay intact.
    """
    tool_result_idxs = [
        i for i, m in enumerate(messages)
        if m.get("role") == "user" and isinstance(m.get("content"), list)
        and any(isinstance(b, dict) and b.get("type") == "tool_result" for b in m["content"])
    ]
    if len(tool_result_idxs) <= keep_recent:
        return messages

    to_truncate = set(tool_result_idxs[:-keep_recent])
    new_messages: list[dict] = []
    for i, msg in enumerate(messages):
        if i not in to_truncate:
            new_messages.append(msg)
            continue
        new_content = []
        for b in msg["content"]:
            if (
                isinstance(b, dict)
                and b.get("type") == "tool_result"
                and isinstance(b.get("content"), str)
                and len(b["content"]) > 200
            ):
                new_content.append({
                    **b,
                    "content": f"[truncated: {len(b['content'])} chars from an earlier tool call]",
                })
            else:
                new_content.append(b)
        new_messages.append({**msg, "content": new_content})
    return new_messages


TOOL_SCHEMAS: dict[str, dict] = {
    "web_search": {
        "name": "web_search",
        "description": (
            "Search the web for information. Returns a JSON list of results with title, url, and snippet. "
            "Use different phrasings across multiple calls to avoid echo-chamber results."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query"},
                "num_results": {"type": "integer", "description": "Number of results to return (default 6)", "default": 6},
            },
            "required": ["query"],
        },
    },
    "web_fetch": {
        "name": "web_fetch",
        "description": (
            "Fetch the full text content of a web page. Call this after web_search to read sources in depth. "
            "Returns cleaned article text."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The URL to fetch"},
                "max_length": {"type": "integer", "description": "Max chars to return (default 3000)", "default": 3000},
            },
            "required": ["url"],
        },
    },
    # Anthropic-native server-side search. Claude runs search + fetch on the
    # server and includes results inline in the response. We don't need to
    # respond to these; just keep the response.content blocks in history.
    "web_search_native": {
        "type": "web_search_20260209",
        "name": "web_search",
        "max_uses": 8,
    },
    "read_file": {
        "name": "read_file",
        "description": "Read a file from the job working directory.",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "Relative file path"}},
            "required": ["path"],
        },
    },
    "write_file": {
        "name": "write_file",
        "description": "Write content to a file in the job working directory. Creates directories automatically.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative file path"},
                "content": {"type": "string", "description": "Content to write"},
            },
            "required": ["path", "content"],
        },
    },
    "list_files": {
        "name": "list_files",
        "description": "List files in a directory of the job working directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "directory": {"type": "string", "description": "Directory to list (default '.')", "default": "."}
            },
            "required": [],
        },
    },
    "finish": {
        "name": "finish",
        "description": "Signal that you have completed your task. Always call this when done.",
        "input_schema": {
            "type": "object",
            "properties": {"summary": {"type": "string", "description": "One-sentence summary of what was accomplished"}},
            "required": ["summary"],
        },
    },
}


async def run_agent(
    system_prompt: str,
    user_message: str,
    tool_names: list[str],
    tool_impls: dict[str, Callable[..., Awaitable[str]]],
    model: str = "claude-sonnet-4-6",
    max_iterations: int = 25,
    on_log: Callable[[str], Awaitable[None]] | None = None,
) -> str:
    client = get_client()
    tools = [TOOL_SCHEMAS[n] for n in tool_names if n in TOOL_SCHEMAS]
    messages: list[dict] = [{"role": "user", "content": user_message}]
    last_text = ""

    # Cache the (frozen) system prompt so the per-iteration token bill is paid once
    system_blocks = cached_system(system_prompt)

    for _ in range(max_iterations):
        response = await call_with_retry(
            client,
            model=model,
            system=system_blocks,
            messages=_truncate_tool_history(messages),
            tools=tools,
            max_tokens=4096,
        )

        for block in response.content:
            if hasattr(block, "text"):
                last_text = block.text

        if response.stop_reason == "end_turn":
            return last_text

        # Server-side tools (native web_search) hit their server-side iteration
        # cap → re-send the conversation and the server continues automatically.
        if response.stop_reason == "pause_turn":
            messages.append({"role": "assistant", "content": response.content})
            continue

        if response.stop_reason == "tool_use":
            tool_results = []
            finished = False

            for block in response.content:
                if block.type != "tool_use":
                    continue  # skip server_tool_use / web_search_tool_result

                name = block.name
                inp = block.input

                if on_log:
                    preview = json.dumps(inp)[:120]
                    await on_log(f"[{name}] {preview}")

                if name == "finish":
                    finished = True
                    result = "Done."
                elif name in tool_impls:
                    try:
                        result = await tool_impls[name](**inp)
                    except Exception as e:
                        result = f"Tool error: {e}"
                else:
                    result = f"Unknown tool: {name}"

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": str(result),
                })

            messages.append({"role": "assistant", "content": response.content})
            if tool_results:
                messages.append({"role": "user", "content": tool_results})

            if finished:
                return last_text

    return last_text
