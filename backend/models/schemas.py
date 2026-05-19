from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime


class ArticleBrief(BaseModel):
    topic: str
    angle: Optional[str] = None
    content_type: Literal["essay", "technical", "summary", "news"] = "essay"
    tone: Literal["analytical", "conversational", "neutral", "opinionated"] = "analytical"
    target_length: int = 2000
    citation_style: Literal["inline", "footnote", "apa", "mla", "chicago", "ieee"] = "inline"
    special_requirements: Optional[str] = None


class Source(BaseModel):
    id: str
    title: str
    url: str
    author: Optional[str] = None
    publication: Optional[str] = None
    date: Optional[str] = None
    type: Optional[str] = "article"
    credibility: Optional[str] = "medium"


class Article(BaseModel):
    id: str
    title: str
    content: str
    sources: list[Source]
    word_count: int
    content_type: str
    citation_style: str
    created_at: str


class PipelineEvent(BaseModel):
    type: str
    message: str
    phase: Optional[str] = None
    agent: Optional[str] = None
    data: Optional[dict] = None
