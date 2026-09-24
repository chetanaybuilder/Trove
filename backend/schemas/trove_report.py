from pydantic import BaseModel, Field
from typing import List, Optional

class RedAlert(BaseModel):
    severity: str
    title: str
    detail: str
    deadline: Optional[str] = None

class Commitment(BaseModel):
    owner: str
    commitment: str
    deadline: Optional[str] = None
    status: str = "open"

class TimelineEvent(BaseModel):
    date: str
    event: str

class Stakeholder(BaseModel):
    name: str
    role: str

class Quote(BaseModel):
    speaker: str
    quote: str

class TroveReportResponse(BaseModel):
    red_alerts: List[RedAlert] = Field(default_factory=list)
    executive_brief: str = ""
    commitment_matrix: List[Commitment] = Field(default_factory=list)
    chronological_timeline: List[TimelineEvent] = Field(default_factory=list)
    dependencies_and_blockers: List[str] = Field(default_factory=list)
    agreed_decisions: List[str] = Field(default_factory=list)
    financial_terms: List[str] = Field(default_factory=list)
    open_questions: List[str] = Field(default_factory=list)
    stakeholders: List[Stakeholder] = Field(default_factory=list)
    sentiment_audit: str = ""
    next_agenda: List[str] = Field(default_factory=list)
    verifiable_quotes: List[Quote] = Field(default_factory=list)