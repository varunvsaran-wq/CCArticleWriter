import json
from typing import Optional, Callable

from .base import get_client
from .style_guide import ANTI_AI_VOICE_GUIDE
from ..tools.web_search import web_search
from ..tools.web_fetch import web_fetch

SYSTEM_PROMPT = f"""\
You are a Revision Agent for a long-form article editor.

## INPUTS YOU RECEIVE

1. The current article in markdown
2. A JSON array of sources used in the article
3. A revision instruction from the user
4. Optionally: a SECTION SCOPE — the title of a single section to revise
5. Optionally: read_file / list_files tools — if available, the original job's
   research files are accessible. PREFER reading those over fresh web search.

## YOUR JOB

- Apply ONLY the changes the instruction asks for — be surgical
- If SECTION SCOPE is given, change ONLY that section. All other sections
  must appear in the output exactly as-is.
- If the instruction needs new information:
    a) First, if read_file is available, list research files and read the
       most relevant ones — the original job already searched for this topic.
    b) Only if research files don't have it, call web_search.
- Keep tone, style, and structure intact elsewhere
- Maintain [N] citation markers; append new sources with new sequential IDs
- Re-apply the VOICE guide to any rewritten passage
- When done, call submit_revision() with the COMPLETE revised article

## RULES

- Never remove content unless asked
- Never invent facts — search or read for them
- The submission must be the FULL article, not just the changed part
- If you change just one section, copy the rest of the article verbatim

{ANTI_AI_VOICE_GUIDE}
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
    "description": "Search the web for new information needed by the revision. Use only if research files don't have what you need.",
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

READ_FILE_TOOL = {
    "name": "read_file",
    "description": "Read a file from the original job's working directory (research notes, knowledge map, sources). PREFER this over web_search.",
    "input_schema": {
        "type": "object",
        "properties": {"path": {"type": "string"}},
        "required": ["path"],
    },
}

LIST_FILES_TOOL = {
    "name": "list_files",
    "description": "List files in a directory of the original job's working directory.",
    "input_schema": {
        "type": "object",
        "properties": {"directory": {"type": "string", "default": "."}},
        "required": [],
    },
}


async def run_reviser(
    instruction: str,
    content: str,
    sources_json: str,
    section_scope: Optional[str] = None,
    read_file: Optional[Callable] = None,
    list_files: Optional[Callable] = None,
) -> tuple[str, list]:
    """Run the revision agent. Returns (revised_content, sources_list).

    If read_file / list_files are provided, the reviser can access the
    original job's research files — reducing redundant web searches.
    """
    client = get_client()

    tools = [WEB_SEARCH_TOOL, WEB_FETCH_TOOL, SUBMIT_TOOL]
    if read_file:
        tools.insert(0, READ_FILE_TOOL)
    if list_files:
        tools.insert(0, LIST_FILES_TOOL)

    scope_note = ""
    if section_scope:
        scope_note = (
            f"\n\nSECTION SCOPE: Revise ONLY the section titled \"{section_scope}\". "
            "Every other section must appear in the output unchanged."
        )

    file_note = ""
    if read_file:
        file_note = (
            "\n\nNOTE: The original job's research files are available via read_file / list_files. "
            "Try `list_files(\"research\")` and `read_file(\"synthesis/knowledge_map.md\")` first — "
            "the answer to your instruction is probably already there."
        )

    messages = [
        {
            "role": "user",
            "content": (
                f"Current article:\n\n{content}\n\n"
                f"Current sources (JSON):\n{sources_json}\n\n"
                f"Revision instruction: {instruction}"
                f"{scope_note}{file_note}\n\n"
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
                elif name == "read_file" and read_file:
                    result = await read_file(**inp)
                elif name == "list_files" and list_files:
                    result = await list_files(**inp)
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
            text = "".join(b.text for b in response.content if hasattr(b, "text"))
            return text or content, json.loads(sources_json)

    return content, json.loads(sources_json)
