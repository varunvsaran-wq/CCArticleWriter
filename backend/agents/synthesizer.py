from .base import run_agent

SYSTEM_PROMPT = """\
You are a Synthesis Agent. You read all research files and produce two outputs:

1. state/sources.json — a JSON array of every unique source found across all research files.
   Format each source as:
   {
     "id": "1",          // sequential number string
     "title": "...",
     "url": "...",
     "author": "...",    // "First Last" format, or null
     "publication": "...", // journal/site name, or null
     "date": "YYYY-MM-DD", // or null
     "type": "article|book|website|report",
     "credibility": "high|medium|low"
   }
   Write the complete JSON array (no markdown, just valid JSON).

2. synthesis/knowledge_map.md — a structured knowledge map with:
   - Core thesis (what the research suggests as a whole)
   - High-confidence facts (cited by 2+ sources, with [N] markers matching sources.json)
   - Medium-confidence claims (single source)
   - Source conflicts (topic + what each source says)
   - Best sources by theme
   - Critical gaps (things the article needs but research doesn't cover)

3. state/gaps.json — array of gap objects:
   [{"question": "...", "critical": true/false}]

Process:
1. Call list_files("research") to see all research files.
2. Read each one with read_file.
3. Extract and deduplicate sources.
4. Write state/sources.json.
5. Build the knowledge map.
6. Write synthesis/knowledge_map.md.
7. Write state/gaps.json.
8. Call finish().
"""


async def run_synthesizer(tool_impls: dict, on_log=None) -> None:
    await run_agent(
        system_prompt=SYSTEM_PROMPT,
        user_message="Synthesize all research files now.",
        tool_names=["read_file", "write_file", "list_files", "finish"],
        tool_impls=tool_impls,
        model="claude-sonnet-4-6",
        max_iterations=30,
        on_log=on_log,
    )
