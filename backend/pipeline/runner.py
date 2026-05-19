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

CITE_PATTERN = re.compile(r"\[CITE:([^\]]+)\]")


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

        # Structured outputs cached from agents that use submit_* tools
        self._synthesis: dict | None = None
        self._outline: dict | None = None

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

        self._synthesis = await run_synthesizer(
            tool_impls=self.tool_impls,
            on_log=self.make_logger("synthesizer"),
        )

        # Fill critical gaps with one extra research pass, then re-synthesize
        critical = [g["question"] for g in self._synthesis.get("gaps", []) if g.get("critical")]
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
            self._synthesis = await run_synthesizer(
                tool_impls=self.tool_impls, on_log=self.make_logger("synthesizer")
            )

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

        self._outline = await run_outliner(
            brief_summary=brief_summary,
            content_type=self.brief.content_type,
            tool_impls=self.tool_impls,
            on_log=self.make_logger("outliner"),
        )

        await self.emit("phase_complete", "Outline ready.", phase="outline")

    async def _phase_write(self) -> None:
        await self.emit("phase_start", "Writing article sections in parallel…", phase="writing")

        sections = self._sections_from_outline()
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
        await self.emit("phase_start", "Post-processing citations and assembling output…", phase="finalizing")

        edited = await self._read_file("output/article.md")
        if edited.startswith("File not found"):
            # Fall back to the assembled draft if editor failed to write
            edited = await self._read_file("output/draft_full.md")

        all_sources = self._synthesis.get("sources", []) if self._synthesis else []
        if not all_sources:
            sources_raw = await self._read_file("state/sources.json")
            try:
                all_sources = json.loads(sources_raw)
            except Exception:
                all_sources = []

        final_text, cited_sources = self._postprocess_citations(edited, all_sources)

        await self._write_file("output/article.md", final_text)
        await self._write_file("output/sources.json", json.dumps(cited_sources, indent=2))

        try:
            sources = [Source(**s) for s in cited_sources]
        except Exception:
            sources = []

        title = self._extract_title(final_text)
        word_count = len(final_text.split())

        article = Article(
            id=self.job_id,
            title=title,
            content=final_text,
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
        from ..agents.base import get_client, call_with_retry
        client = get_client()
        brief = self.brief
        response = await call_with_retry(
            client,
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

    def _sections_from_outline(self) -> list[dict]:
        if not self._outline:
            return []
        return [
            {"title": s.get("title", f"Section {i}"), "index": i}
            for i, s in enumerate(self._outline.get("sections", []), start=1)
        ]

    @staticmethod
    def _extract_title(content: str) -> str:
        for line in content.splitlines():
            if line.startswith("# "):
                return line[2:].strip()
        return "Untitled Article"

    @staticmethod
    def _postprocess_citations(
        article_text: str, all_sources: list[dict]
    ) -> tuple[str, list[dict]]:
        """Renumber [CITE:id] markers to sequential [N] and filter sources.

        - First occurrence of each id becomes [1], next new id becomes [2], etc.
        - Invalid ids (not in all_sources) are dropped.
        - Returns (final_text, cited_sources_renumbered_in_order).
        """
        by_id = {str(s.get("id")): s for s in all_sources}

        seen: list[str] = []
        id_to_n: dict[str, int] = {}

        for m in CITE_PATTERN.finditer(article_text):
            sid = m.group(1).strip()
            if sid not in by_id or sid in id_to_n:
                continue
            id_to_n[sid] = len(seen) + 1
            seen.append(sid)

        def _repl(m: re.Match) -> str:
            sid = m.group(1).strip()
            n = id_to_n.get(sid)
            return f"[{n}]" if n is not None else ""

        body = CITE_PATTERN.sub(_repl, article_text)

        cited: list[dict] = []
        for orig_id in seen:
            src = dict(by_id[orig_id])
            src["id"] = str(id_to_n[orig_id])
            cited.append(src)

        # Strip any existing ## References section the editor wrote
        body = re.split(r"\n##\s+References\s*\n", body, maxsplit=1)[0].rstrip()

        # Append a deterministic References section
        if cited:
            ref_lines = ["", "## References", ""]
            for s in cited:
                parts = [f"[{s['id']}] {s.get('title') or 'Untitled'}"]
                if s.get("publication"):
                    parts.append(s["publication"])
                if s.get("date"):
                    parts.append(s["date"])
                if s.get("url"):
                    parts.append(s["url"])
                ref_lines.append(" — ".join(parts))
                ref_lines.append("")
            body = body + "\n" + "\n".join(ref_lines)

        return body, cited
