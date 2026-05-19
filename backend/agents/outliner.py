import json

from .base import get_client, call_with_retry, TOOL_SCHEMAS

SYSTEM_PROMPT = """\
You are an Outline Agent. You design the structure of an article — you do not write prose.

## INPUTS

- brief.md: the article requirements
- synthesis/knowledge_map.md: all researched facts and themes
- state/sources.json: the source list (each has an "id" field)

## YOUR PROCESS

1. read_file brief.md and synthesis/knowledge_map.md.
2. Optionally read state/sources.json to verify source ids exist.
3. Choose a structure appropriate to the content type.
4. Create 4–7 sections that serve the article's angle.
5. Submit the structured outline via submit_outline.

## STRUCTURAL PATTERNS

  essay:     Hook → Context → Thesis → Body arguments (3–4) → Counter-argument → Conclusion
  technical: Problem → Why existing solutions fall short → Solution overview → Implementation → Examples → Takeaways
  summary:   Executive Summary → Background → Key Findings → Analysis → Implications → Limitations
  news:      Lede → Key facts → Context → Quotes → Background → What's next

## RULES

- Do not invent facts. Every section must rely on real entries from the knowledge map.
- Section word targets must sum approximately to the brief's total target.
- Reference sources by their string id from state/sources.json (e.g. ["1", "3"]).
- The opening must hook; the conclusion must land a final point (not summarize).
- Section titles should be specific and concrete — avoid "Introduction" or "Conclusion".
"""

SUBMIT_TOOL = {
    "name": "submit_outline",
    "description": "Submit the structured outline. Call this exactly once when done.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Working title of the article"},
            "angle": {"type": "string", "description": "The article's specific thesis or angle"},
            "total_target": {"type": "integer", "description": "Total word target"},
            "sections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "purpose": {"type": "string", "description": "What this section accomplishes for the reader"},
                        "word_target": {"type": "integer"},
                        "source_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Source ids from state/sources.json this section relies on",
                        },
                        "key_points": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "transition": {"type": "string", "description": "One sentence leading into next section"},
                    },
                    "required": ["title", "purpose", "word_target", "key_points"],
                },
                "minItems": 3,
            },
        },
        "required": ["title", "angle", "total_target", "sections"],
    },
}


def _outline_to_markdown(outline: dict) -> str:
    lines = [
        f"# Outline: {outline.get('title', 'Untitled')}",
        "",
        f"**Angle**: {outline.get('angle', '')}",
        f"**Total target**: {outline.get('total_target', 0)} words",
        "",
        "---",
        "",
    ]
    for i, s in enumerate(outline.get("sections", []), start=1):
        lines.append(f"## Section {i}: {s.get('title', '')}")
        lines.append(f"**Purpose**: {s.get('purpose', '')}")
        lines.append(f"**Word target**: {s.get('word_target', 0)}")
        if s.get("source_ids"):
            lines.append(f"**Sources**: [{', '.join(s['source_ids'])}]")
        if s.get("key_points"):
            lines.append("**Key points**:")
            for kp in s["key_points"]:
                lines.append(f"- {kp}")
        if s.get("transition"):
            lines.append(f"**Transition**: {s['transition']}")
        lines.append("")
    return "\n".join(lines)


async def run_outliner(brief_summary: str, content_type: str, tool_impls: dict, on_log=None) -> dict:
    """Run outliner; returns the structured outline and writes outline/outline.md."""
    client = get_client()

    tools = [TOOL_SCHEMAS["read_file"], SUBMIT_TOOL]

    user_msg = (
        f"Article brief: {brief_summary}\n"
        f"Content type: {content_type}\n\n"
        "Read brief.md and synthesis/knowledge_map.md, then submit the outline via submit_outline."
    )

    messages: list[dict] = [{"role": "user", "content": user_msg}]

    read_file = tool_impls["read_file"]
    write_file = tool_impls.get("write_file")

    outline: dict | None = None

    for _ in range(20):
        response = await call_with_retry(
            client,
            model="claude-sonnet-4-6",
            system=SYSTEM_PROMPT,
            messages=messages,
            tools=tools,
            max_tokens=8096,
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
                    preview = json.dumps(inp)[:120] if name != "submit_outline" else "submit_outline(...)"
                    await on_log(f"[{name}] {preview}")

                if name == "submit_outline":
                    outline = dict(inp)
                    finished = True
                    tool_result = "Outline received."
                elif name == "read_file":
                    try:
                        tool_result = await read_file(**inp)
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

    if outline is None:
        outline = {"title": "Article", "angle": "", "total_target": 0, "sections": []}

    if write_file:
        await write_file("outline/outline.md", _outline_to_markdown(outline))

    return outline
