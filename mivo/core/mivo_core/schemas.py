from typing import Literal
from pydantic import BaseModel, Field, ConfigDict


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Segment(StrictModel):
    start: float = Field(default=0, ge=0)
    end: float = Field(default=0, ge=0)
    text: str = Field(max_length=100000)
    speaker: str | None = None


class TranscriptInput(StrictModel):
    segments: list[Segment] = Field(min_length=1, max_length=50000)
    expected_revision: int = Field(ge=0)


class NoteInput(StrictModel):
    title: str = Field(min_length=1, max_length=240)
    text: str = Field(min_length=1, max_length=2000000)


class AnalysisInput(StrictModel):
    source_id: str
    transcript_revision: int = Field(ge=1)
    model: str = Field(min_length=1, max_length=200)
    template: str = Field(default="meeting", max_length=100)
    prompt_version: str = Field(default="1", max_length=30)
    summary: str = Field(min_length=1, max_length=30000)
    people: list[str] = Field(default_factory=list, max_length=100)
    projects: list[str] = Field(default_factory=list, max_length=100)
    topics: list[str] = Field(default_factory=list, max_length=100)
    viewpoints: list[str] = Field(default_factory=list, max_length=100)
    decisions: list[str] = Field(default_factory=list, max_length=100)
    tasks: list[str] = Field(default_factory=list, max_length=100)
    evidence: list[int] = Field(min_length=1, max_length=100)


class ConfirmInput(StrictModel):
    confirmed: Literal[True]


class ASRInput(StrictModel):
    provider: Literal["whisper", "funasr", "sensevoice"] = "whisper"
    model_path: str = Field(min_length=1, max_length=4096)
    language: str | None = Field(default=None, max_length=10)
    device: Literal["cpu", "cuda", "auto"] = "cpu"


class SearchInput(StrictModel):
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=10, ge=1, le=30)
    source_id: str | None = None
    since: str | None = None
    until: str | None = None
    entity: str | None = None
