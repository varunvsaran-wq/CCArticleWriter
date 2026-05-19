import json
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from .models.schemas import ArticleBrief, Source
from .pipeline.runner import PipelineRunner
from .agents.reviser import run_reviser

app = FastAPI(title="Article Writer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_jobs: dict[str, PipelineRunner] = {}


@app.post("/api/article")
async def create_article(brief: ArticleBrief):
    runner = PipelineRunner(brief)
    _jobs[runner.job_id] = runner
    await runner.start()
    return {"job_id": runner.job_id}


@app.get("/api/article/{job_id}/stream")
async def stream_article(job_id: str):
    runner = _jobs.get(job_id)
    if not runner:
        raise HTTPException(status_code=404, detail="Job not found")

    async def generator():
        async for event in runner.stream_events():
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/article/{job_id}/status")
async def get_status(job_id: str):
    runner = _jobs.get(job_id)
    if not runner:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": job_id,
        "finished": runner._finished,
        "event_count": len(runner._events),
    }


class ReviseRequest(BaseModel):
    instruction: str
    content: str
    sources: list[Source]
    topic: Optional[str] = ""


@app.post("/api/revise")
async def revise_article(request: ReviseRequest):
    sources_json = json.dumps([s.model_dump() for s in request.sources])
    revised_content, revised_sources = await run_reviser(
        instruction=request.instruction,
        content=request.content,
        sources_json=sources_json,
    )
    return {
        "content": revised_content,
        "sources": revised_sources,
        "word_count": len(revised_content.split()),
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
