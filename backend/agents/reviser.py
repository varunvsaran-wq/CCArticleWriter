import json
import anthropic
from .base import get_client
from ..tools.web_search import web_search
from ..tools.web_fetch import web_fetch

SYSTEM_PROMPT = """\
You are a Revision Agent for a long-form article editor.

You receive:
1. The current article in markdown format
2. A JSON array of sources used in the article
3. A revision instruction from the user

Your job:
- Apply ONLY the changes the instruction asks for — be surgical
- If the instruction needs new information (e.g. "add a section about X"), call web_search
- Keep the article's existing tone, style, and structure intact elsewhere
- Maintain [N] citation markers consistently; append new sources with new sequential IDs
- When finished, call submit_revision() with the COMPLETE revised article

Rules:
- Never remove content unless asked
- Never invent facts — search for them
- The submission must be the full article, not just the changed parts
"""

SUBMIT_TOOL = {
    "name": "submit_revision",
    "description": "Submit the completed revision. Call this when you are done.",
    "input_schema": {
        "type": "object",
        "properties": {
            "content": {
                "type": "string",
                "description": "The complete revised article in markdown",
            },
            "sources": {
                "type": "string",
                "description": (
                    "JSON string of the updated sources array — same format as input, "
                    "with any new sources appended at the end"
                ),
            },
        },
        "required": ["content", "sources"],
    },
}

WEB_SEARCH_TOOL = {
    "name": "web_search",
    "description": "Search the web for new information needed by the revision.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "num_results": {"type": "integer", "default": 5},
        },
        "required": ["query"],
    },
}

WEB_FETCH_TOOL = {
    "name": "web_fetch",
    "description": "Fetch the full content of a web page.",
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {"type": "string"},
            "max_length": {"type": "integer", "default": 6000},
        },
        "required": ["url"],
    },
}


async def run_reviser(
    instruction: str,
    content: str,
    sources_json: str,
) -> tuple[str, list]:
    """Run the revision agent. Returns (revised_content, sources_list)."""
    client = get_client()

    tools = [WEB_SEARCH_TOOL, WEB_FETCH_TOOL, SUBMIT_TOOL]
    messages = [
        {
            "role": "user",
            "content": (
                f"Current article:\n\n{content}\n\n"
                f"Current sources (JSON):\n{sources_json}\n\n"
                f"Revision instruction: {instruction}\n\n"
                "Apply the revision, then call submit_revision()."
            ),
        }
    ]

    for _ in range(30):
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            system=SYSTEM_PROMPT,
            messages=messages,
            tools=tools,
            max_tokens=16000,
        )

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue

                name = block.name
                inp = block.input

                if name == "submit_revision":
                    revised = inp["content"]
                    try:
                        updated_sources = json.loads(inp.get("sources", sources_json))
                    except Exception:
                        updated_sources = json.loads(sources_json)
                    return revised, updated_sources

                elif name == "web_search":
                    result = await web_search(**inp)
                elif name == "web_fetch":
                    result = await web_fetch(**inp)
                else:
                    result = f"Unknown tool: {name}"

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": str(result),
                })

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

        elif response.stop_reason == "end_turn":
            # Model ended without calling submit_revision — use text as content
            text = "".join(b.text for b in response.content if hasattr(b, "text"))
            return text or content, json.loads(sources_json)

    return content, json.loads(sources_json)
