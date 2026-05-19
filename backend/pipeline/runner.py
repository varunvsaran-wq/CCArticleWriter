import asyncio
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator

from ..agents.editor import run_editor
from ..agents.outliner import run_outliner
from ..agents.researcher import run_researcher
from ..agents.synthesizer import run_synthesizer
from ..agents.writer import run_writer
from ..models.schemas import Article, ArticleBrief, Source
from ..tools.file_tools import make_file_tools
from ..tools.web_fetch import web_fetch
from ..tools.web_search import web_search

JOBS_DIR = Path("jobs")


class PipelineRunner:
    def __init__(self, brief: ArticleBrief):
        self.job_id = str(uuid.uuid4())[:8]
        self.brief = brief
        self.job_dir = JOBS_DIR / self.job_id

        for subdir in ["state", "research", "synthesis", "outline", "draft", "output"]:
            (self.job_dir / subdir).mkdir(parents=True, exist_ok=True)

        self._events: list[dict] = []
        self._event_available = asyncio.Event()
        self._finished = False

        self._read_file, self._write_file, self._list_files = make_file_tools(str(self.job_dir))

    @property
    def tool_impls(self) -> dict:
        return {
            "web_search": web_search,
            "web_fetch": web_fetch,
            "read_file": self._read_file,
            "write_file": self._write_file,
            "list_files": self._list_files,
        }

    async def emit(self, type: str, message: str, **extra) -> None:
        event = {"type": type, "message": message, **extra}
        self._events.append(event)
        self._event_available.set()
        if type in ("article_ready", "error"):
            self._finished = True

    def make_logger(self, agent: str):
        async def _log(msg: str):
            await self.emit("agent_log", msg, agent=agent)
        return _log

    async def stream_events(self) -> AsyncGenerator[dict, None]:
        sent = 0
        while True:
            while sent < len(self._events):
                yield self._events[sent]
                sent += 1
            if self._finished:
                break
            self._event_available.clear()
            try:
                await asyncio.wait_for(self._event_available.wait(), timeout=300)
            except asyncio.TimeoutError:
                await self.emit("error", "Pipeline timed out.")
                break

    async def start(self) -> None:
        asyncio.create_task(self._run())

    # ──────────────────────────────────────────────
    # Pipeline phases
    # ──────────────────────────────────────────────

    async def _run(self) -> None:
        try:
            await self._phase_brief()
            await self._phase_research()
            await self._phase_synthesis()
            await self._phase_outline()
            await self._phase_write()
            await self._phase_edit()
            await self._phase_finalize()
        except Exception as exc:
            await self.emit("error", f"Pipeline error: {exc}")

    async def _phase_brief(self) -> None:
        await self.emit("phase_start", "Parsing article brief…", phase="brief")
        brief = self.brief
        content = f"""\
topic: {brief.topic}
angle: {brief.angle or 'general coverage'}
content_type: {brief.content_type}
tone: {brief.tone}
target_length: {brief.target_length} words
citation_style: {brief.citation_style}
special_requirements: {brief.special_requirements or 'none'}
"""
        await self._write_file("brief.md", content)
        await self.emit("phase_complete", "Brief saved.", phase="brief")

    async def _phase_research(self) -> None:
        await self.emit("phase_start", "Planning and running parallel research…", phase="research")

        angles = await self._plan_angles()
        mid = max(1, len(angles) // 2)
        broad_angles = angles[:mid]
        deep_angles = angles[mid:]

        broad_str = "; ".join(broad_angles)
        deep_str = "; ".join(deep_angles)

        brief_summary = f"{self.brief.topic} — {self.brief.angle or 'general'}"

        await asyncio.gather(
            run_researcher(
                angle=broad_str,
                brief_summary=brief_summary,
                output_path="research/broad.md",
                tool_impls=self.tool_impls,
                variant="broad",
                on_log=self.make_logger("researcher_broad"),
            ),
            run_researcher(
                angle=deep_str,
                brief_summary=brief_summary,
                output_path="research/deep.md",
                tool_impls=self.tool_impls,
                variant="deep",
                on_log=self.make_logger("researcher_deep"),
            ),
        )

        await self.emit("phase_complete", "Research complete.", phase="research")

    async def _phase_synthesis(self) -> None:
        await self.emit("phase_start", "Synthesizing research into knowledge map…", phase="synthesis")

        await run_synthesizer(
            tool_impls=self.tool_impls,
            on_log=self.make_logger("synthesizer"),
        )

        # Check for critical gaps and run one targeted research pass if needed
        gaps_raw = await self._read_file("state/gaps.json")
        try:
            gaps = json.loads(gaps_raw)
            critical = [g["question"] for g in gaps if g.get("critical")]
        except Exception:
            critical = []

        if critical:
            await self.emit("agent_log", f"Filling {len(critical)} critical gap(s)…", agent="orchestrator")
            gap_angle = "; ".join(critical[:3])
            await run_researcher(
                angle=gap_angle,
                brief_summary=self.brief.topic,
                output_path="research/gaps.md",
                tool_impls=self.tool_impls,
                variant="targeted",
                on_log=self.make_logger("researcher_gaps"),
            )
            await run_synthesizer(tool_impls=self.tool_impls, on_log=self.make_logger("synthesizer"))

        await self.emit("phase_complete", "Synthesis complete.", phase="synthesis")

    async def _phase_outline(self) -> None:
        await self.emit("phase_start", "Structuring article outline…", phase="outline")

        brief_summary = (
            f"Topic: {self.brief.topic}\n"
            f"Angle: {self.brief.angle or 'general'}\n"
            f"Tone: {self.brief.tone}\n"
            f"Target length: {self.brief.target_length} words\n"
            f"Special requirements: {self.brief.special_requirements or 'none'}"
        )

        await run_outliner(
            brief_summary=brief_summary,
            content_type=self.brief.content_type,
            tool_impls=self.tool_impls,
            on_log=self.make_logger("outliner"),
        )

        await self.emit("phase_complete", "Outline ready.", phase="outline")

    async def _phase_write(self) -> None:
        await self.emit("phase_start", "Writing article sections in parallel…", phase="writing")

        sections = await self._parse_outline_sections()
        if not sections:
            sections = [{"title": "Article", "index": 1}]

        tasks = [
            run_writer(
                section_title=s["title"],
                section_index=s["index"],
                output_path=f"draft/section_{s['index']:02d}.md",
                tone=self.brief.tone,
                tool_impls=self.tool_impls,
                on_log=self.make_logger(f"writer_s{s['index']}"),
            )
            for s in sections
        ]
        await asyncio.gather(*tasks)

        # Assemble draft
        draft_parts = []
        for s in sorted(sections, key=lambda x: x["index"]):
            path = f"draft/section_{s['index']:02d}.md"
            content = await self._read_file(path)
            if not content.startswith("File not found"):
                draft_parts.append(content)

        full_draft = "\n\n---\n\n".join(draft_parts)
        await self._write_file("output/draft_full.md", full_draft)

        await self.emit("phase_complete", f"All {len(sections)} sections written.", phase="writing")

    async def _phase_edit(self) -> None:
        await self.emit("phase_start", "Editing and verifying the draft…", phase="editing")

        await run_editor(
            tool_impls=self.tool_impls,
            on_log=self.make_logger("editor"),
        )

        await self.emit("phase_complete", "Editing complete.", phase="editing")

    async def _phase_finalize(self) -> None:
        await self.emit("phase_start", "Assembling final output…", phase="finalizing")

        content = await self._read_file("output/article.md")
        sources_raw = await self._read_file("output/sources.json")

        # Fall back to state/sources.json if editor didn't write output/sources.json
        if sources_raw.startswith("File not found"):
            sources_raw = await self._read_file("state/sources.json")

        try:
            sources_data = json.loads(sources_raw)
            sources = [Source(**s) for s in sources_data]
        except Exception:
            sources = []

        title = self._extract_title(content)
        word_count = len(content.split())

        article = Article(
            id=self.job_id,
            title=title,
            content=content,
            sources=sources,
            word_count=word_count,
            content_type=self.brief.content_type,
            citation_style=self.brief.citation_style,
            created_at=datetime.now(timezone.utc).isoformat(),
        )

        await self.emit(
            "article_ready",
            "Article complete!",
            phase="done",
            data={"article": article.model_dump()},
        )

    # ──────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────

    async def _plan_angles(self) -> list[str]:
        import anthropic
        client = anthropic.AsyncAnthropic()
        brief = self.brief
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": (
                    f'For an article: topic="{brief.topic}", angle="{brief.angle or "general"}", '
                    f'type="{brief.content_type}".\n\n'
                    "List 4–6 distinct research angles as a JSON array of strings. "
                    "Cover: main topic, context/history, data/evidence, expert views, "
                    "criticism, recent developments. Reply with ONLY a JSON array."
                ),
            }],
        )
        text = response.content[0].text.strip()
        try:
            match = re.search(r"\[.*?\]", text, re.DOTALL)
            return json.loads(match.group()) if match else [brief.topic]
        except Exception:
            return [brief.topic]

    async def _parse_outline_sections(self) -> list[dict]:
        outline = await self._read_file("outline/outline.md")
        if outline.startswith("File not found"):
            return []
        sections = []
        idx = 1
        for line in outline.splitlines():
            m = re.match(r"^## Section \d+:\s*(.+)", line)
            if m:
                sections.append({"title": m.group(1).strip(), "index": idx})
                idx += 1
        return sections

    @staticmethod
    def _extract_title(content: str) -> str:
        for line in content.splitlines():
            if line.startswith("# "):
                return line[2:].strip()
        return "Untitled Article"
