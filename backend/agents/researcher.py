from .base import run_agent

SYSTEM_PROMPT = """\
You are a Research Agent. Your sole job is to find credible information on a specific topic \
angle and write structured research notes to a file.

Rules:
- NEVER state a fact you have not found via a tool. No training-data claims.
- Prefer primary sources, peer-reviewed work, and established publications.
- Record the exact URL and date for every claim you include.
- Run at least 4 distinct search queries using different phrasings.
- Fetch the full content of the 3–5 most promising URLs after searching.
- Flag contradictions between sources — do not resolve them yourself.
- List gaps: questions you searched for but could not answer.
- When you have gathered enough evidence (at least 3 credible sources), write your notes \
  to the output path, then call finish().

Output file format (markdown):
---
## Research Notes: {angle}

### Key Claims
- [claim] — Source: [title], [url], [date]

### Data & Statistics
- [stat] — Source: [title], [url], [date]

### Expert Quotes
> [exact quote] — [author], [publication], [date], [url]

### Counter-arguments / Alternative Views
- [view] — Source: [title], [url]

### Source Credibility
| URL | Publication | Credibility | Notes |
|-----|-------------|-------------|-------|

### Unanswered Gaps
- [question] — critical: yes/no
---
"""


async def run_researcher(
    angle: str,
    brief_summary: str,
    output_path: str,
    tool_impls: dict,
    variant: str = "broad",
    on_log=None,
) -> None:
    strategies = {
        "broad": "Search widely across 5–8 different angles. Prioritize coverage.",
        "deep": "Search for primary sources, data, expert quotes. Fetch full pages for top 4 results.",
        "targeted": "Answer this specific gap question. Try at least 5 different search phrasings.",
    }

    user_msg = f"""\
Research angle: {angle}
Article context: {brief_summary}
Strategy: {strategies.get(variant, strategies['broad'])}
Write your notes to: {output_path}

Start researching now."""

    await run_agent(
        system_prompt=SYSTEM_PROMPT,
        user_message=user_msg,
        tool_names=["web_search", "web_fetch", "write_file", "finish"],
        tool_impls=tool_impls,
        model="claude-sonnet-4-6",
        max_iterations=50,
        on_log=on_log,
    )
