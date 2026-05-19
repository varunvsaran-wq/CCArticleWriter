import json
from typing import Callable

from .base import get_client, call_with_retry, TOOL_SCHEMAS, cached_system

SYSTEM_PROMPT = """\
You are a Synthesis Agent. You read all research files and submit a structured
synthesis via the submit_synthesis tool.

## INPUTS

Research notes live under research/*.md (multiple files from parallel research agents).

## YOUR PROCESS

1. Call list_files("research") to discover research files.
2. read_file each one.
3. Extract and DEDUPLICATE sources across files (same URL = same source).
4. Build a knowledge map of what the research collectively says.
5. Identify gaps that are critical for writing the article.
6. Call submit_synthesis with the full structured payload.

## SOURCE RULES

- Assign each unique source a short string id like "1", "2", ... (sequential).
- Same URL across multiple research files is ONE source — do not duplicate.
- author / publication / date can be null if not in the research notes.
- credibility = "high" for peer-reviewed, established outlets, official orgs;
  "medium" for reputable secondary sources; "low" for blogs, anonymous posts.

## KNOWLEDGE MAP RULES

The knowledge_map field is markdown. Structure it with these sections:
- Core thesis (what the research suggests overall)
- High-confidence facts (cited by 2+ sources)
- Medium-confidence claims (single source)
- Source conflicts (what each side claims)
- Best sources by theme
Use [N] markers that match the source ids you submitted.

## GAPS RULES

A gap is "critical" if the article cannot be written well without it.
Most gaps are NOT critical — only flag true blockers.
"""

SUBMIT_TOOL = {
    "name": "submit_synthesis",
    "description": "Submit the complete synthesis. Call this exactly once when done.",
    "input_schema": {
        "type": "object",
        "properties": {
            "sources": {
                "type": "array",
                "description": "Deduplicated list of every source found across research files.",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "description": "Sequential string id like '1', '2'"},
                        "title": {"type": "string"},
                        "url": {"type": "string"},
                        "author": {"type": ["string", "null"]},
                        "publication": {"type": ["string", "null"]},
                        "date": {"type": ["string", "null"], "description": "YYYY-MM-DD or null"},
                        "type": {"type": "string", "enum": ["article", "book", "website", "report"]},
                        "credibility": {"type": "string", "enum": ["high", "medium", "low"]},
                    },
                    "required": ["id", "title", "url", "type", "credibility"],
                },
            },
            "knowledge_map": {
                "type": "string",
                "description": "Markdown knowledge map referencing sources by id (use [N] markers).",
            },
            "gaps": {
                "type": "array",
                "description": "Unanswered questions the research left open.",
                "items": {
                    "type": "object",
                    "properties": {
                        "question": {"type": "string"},
                        "critical": {"type": "boolean"},
                    },
                    "required": ["question", "critical"],
                },
            },
        },
        "required": ["sources", "knowledge_map", "gaps"],
    },
}


async def run_synthesizer(tool_impls: dict, on_log=None) -> dict:
    """Run synthesizer; returns the structured payload and writes derived files.

    Returns a dict {sources, knowledge_map, gaps}.
    """
    client = get_client()

    tools = [
        TOOL_SCHEMAS["read_file"],
        TOOL_SCHEMAS["list_files"],
        SUBMIT_TOOL,
    ]

    messages: list[dict] = [
        {"role": "user", "content": "Synthesize all research files. Submit via submit_synthesis when done."}
    ]

    write_file = tool_impls.get("write_file")
    read_file = tool_impls["read_file"]
    list_files = tool_impls["list_files"]

    result: dict | None = None

    system_blocks = cached_system(SYSTEM_PROMPT)

    for _ in range(20):
        response = await call_with_retry(
            client,
            model="claude-sonnet-4-6",
            system=system_blocks,
            messages=messages,
            tools=tools,
            max_tokens=4096,
        )

        if response.stop_reason == "tool_use":
            tool_results = []
            finished = False

            for block in response.content:
                if block.type != "tool_use":
                    continue

                name = block.name
                inp = block.input

                if on_log:
                    preview = json.dumps(inp)[:120] if name != "submit_synthesis" else "submit_synthesis(...)"
                    await on_log(f"[{name}] {preview}")

                if name == "submit_synthesis":
                    result = {
                        "sources": inp.get("sources", []),
                        "knowledge_map": inp.get("knowledge_map", ""),
                        "gaps": inp.get("gaps", []),
                    }
                    finished = True
                    tool_result = "Synthesis received."
                elif name == "read_file":
                    try:
                        tool_result = await read_file(**inp)
                    except Exception as e:
                        tool_result = f"Tool error: {e}"
                elif name == "list_files":
                    try:
                        tool_result = await list_files(**inp)
                    except Exception as e:
                        tool_result = f"Tool error: {e}"
                else:
                    tool_result = f"Unknown tool: {name}"

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": str(tool_result),
                })

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

            if finished:
                break
        else:
            break

    if result is None:
        result = {"sources": [], "knowledge_map": "", "gaps": []}

    # Mirror structured output to files so downstream agents (writer/editor) can read them
    if write_file:
        await write_file("state/sources.json", json.dumps(result["sources"], indent=2))
        await write_file("synthesis/knowledge_map.md", result["knowledge_map"])
        await write_file("state/gaps.json", json.dumps(result["gaps"], indent=2))

    return result
