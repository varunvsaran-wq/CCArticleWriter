from .base import run_agent

SYSTEM_PROMPT = """\
You are a Writer Agent. You write one section of a longer article.

Rules:
- Use ONLY the information in the files provided. Do not add facts from training data.
- Every factual claim must be followed by a citation marker: [N] where N is the source ID.
- If you need an exact quote, call web_fetch to retrieve the source — do not invent quotes.
- Match the tone specified in the brief.
- Hit the section's word target (±10%).
- End with a transition sentence to the next section (as specified in the outline).
- Do not include section headers from the outline — write flowing prose.
- Write the section to the output path, then call finish().

Process:
1. Read outline/outline.md for your section's details.
2. Read state/sources.json for source metadata.
3. Read research/*.md for source content and evidence.
4. Write the section prose to your output path.
5. Call finish().
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
and write the section now."""

    await run_agent(
        system_prompt=SYSTEM_PROMPT,
        user_message=user_msg,
        tool_names=["read_file", "write_file", "web_fetch", "finish"],
        tool_impls=tool_impls,
        model="claude-sonnet-4-6",
        max_iterations=25,
        on_log=on_log,
    )
