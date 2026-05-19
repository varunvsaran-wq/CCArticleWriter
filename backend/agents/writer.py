from .base import run_agent
from .style_guide import ANTI_AI_VOICE_GUIDE

SYSTEM_PROMPT = f"""\
You are a Writer Agent. You write one section of a longer article.

## CORE RULES

- Use ONLY the information in the files provided. Do not add facts from training data.
- Every factual claim must be followed by a citation marker.
- CITATION FORMAT: Use [CITE:ID] where ID is the source's "id" field from state/sources.json.
  Example: "Accuracy rose from 71% to 89% [CITE:3]."
  Do NOT use [1], [2], [N] style — always [CITE:ID]. The runner renumbers
  these into sequential [N] markers after all sections are assembled, so the
  IDs you use must match state/sources.json exactly.
- If you need an exact quote, call web_fetch to retrieve the source — do not invent quotes.
- Match the tone specified in the brief.
- Hit the section's word target (±10%).
- End with a transition sentence to the next section (as specified in the outline).
- Do not include section headers from the outline — write flowing prose.
- Write the section to the output path, then call finish().

## PROCESS

1. Read outline/outline.md for your section's details.
2. Read state/sources.json — note the "id" field of each source you plan to cite.
3. Read research/*.md for source content and evidence.
4. Draft the section using [CITE:ID] markers tied to source IDs.
5. RE-READ your draft against the VOICE guide below. Rewrite anything that fails.
6. Write the final section prose to your output path.
7. Call finish().

{ANTI_AI_VOICE_GUIDE}
"""


async def run_writer(
    section_title: str,
    section_index: int,
    output_path: str,
    tone: str,
    tool_impls: dict,
    on_log=None,
) -> None:
    output_file = f"draft/section_{section_index:02d}.md"

    user_msg = f"""\
Section to write: "{section_title}" (section {section_index})
Tone: {tone}
Output path: {output_file}

Read the outline entry for this section, gather the relevant source material, \
draft the section, then self-edit against the VOICE guide before writing the final version.

Remember: cite as [CITE:ID] using IDs from state/sources.json — NOT [1] / [N]."""

    await run_agent(
        system_prompt=SYSTEM_PROMPT,
        user_message=user_msg,
        tool_names=["read_file", "write_file", "web_fetch", "finish"],
        tool_impls=tool_impls,
        model="claude-sonnet-4-6",
        max_iterations=25,
        on_log=on_log,
    )
