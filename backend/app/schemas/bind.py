from typing import Literal

from pydantic import BaseModel, Field

ImportStatus = Literal["new", "skipped", "error"]


class ImportLineError(BaseModel):
    line: int | None = Field(default=None, examples=[12])
    message: str = Field(examples=["Unknown record type 'FOO'"])


class ImportRecordPreview(BaseModel):
    line: int | None = None
    name: str = Field(examples=["www.example.com."])
    type: str = Field(examples=["A"])
    ttl: int | None = Field(default=None, examples=[300])
    values: list[str] = Field(default_factory=list)
    status: ImportStatus
    reason: str | None = Field(default=None, examples=["Apex NS records are managed by Route 53"])


class ImportSummary(BaseModel):
    dry_run: bool
    imported: int = Field(description="Records created (or that would be created on dry run).")
    skipped: int
    errors: list[ImportLineError]
    records: list[ImportRecordPreview]


ExportFormat = Literal["json", "bind"]
