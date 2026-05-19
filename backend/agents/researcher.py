from .base import run_agent

SYSTEM_PROMPT = """\
You are a Research Agent. Your sole job is to find credible information on a specific topic \
angle and write structured research notes to a file.

You have access to Anthropic's native web_search tool — a single call returns
search results AND fetched page content from the web. Use it like a regular tool;
the server handles search + retrieval. You do NOT need to fetch URLs separately.

Rules:
- NEVER state a fact you have not surfaced via web_search. No training-data claims.
- Prefer primary sources, peer-reviewed work, and established publications.
- Record the exact URL and date for every claim you include.
- Run 3–5 distinct web_search calls using different phrasings.
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
        "broad": "Search widely across 4–6 different angles. Prioritize coverage.",
        "deep": "Search for primary sources, data, expert quotes. Read returned content carefully.",
        "targeted": "Answer this specific gap question. Try 3–5 different search phrasings.",
    }

    user_msg = f"""\
Research angle: {angle}
Article context: {brief_summary}
Strategy: {strategies.get(variant, strategies['broad'])}
Write your notes to: {output_path}

Start researching now. Use web_search for everything — do not call web_fetch separately."""

    await run_agent(
        system_prompt=SYSTEM_PROMPT,
        user_message=user_msg,
        tool_names=["web_search_native", "write_file", "finish"],
        tool_impls=tool_impls,
        model="claude-sonnet-4-6",
        max_iterations=20,
        on_log=on_log,
    )
