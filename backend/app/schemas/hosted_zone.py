from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ApiModel

ZoneType = Literal["public", "private"]

MAX_TAGS = 50
MAX_DESCRIPTION = 256


class TagIn(BaseModel):
    key: str = Field(min_length=1, max_length=128, examples=["Environment"])
    value: str = Field(default="", max_length=256, examples=["production"])


class TagOut(ApiModel):
    key: str
    value: str


class HostedZoneCreate(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=255,
        description="Fully qualified domain name, e.g. example.com (trailing dot optional).",
        examples=["example.com"],
    )
    type: ZoneType = Field(default="public", examples=["public"])
    description: str | None = Field(default=None, max_length=MAX_DESCRIPTION)
    vpc_id: str | None = Field(default=None, max_length=64, examples=["vpc-0a1b2c3d4e5f67890"])
    vpc_region: str | None = Field(default=None, max_length=32, examples=["us-east-1"])
    tags: list[TagIn] = Field(default_factory=list, max_length=MAX_TAGS)


class HostedZoneUpdate(BaseModel):
    """Only the description (comment) and tags are editable; name and type are immutable."""

    description: str | None = Field(default=None, max_length=MAX_DESCRIPTION)
    tags: list[TagIn] | None = Field(default=None, max_length=MAX_TAGS)


class TagsReplace(BaseModel):
    tags: list[TagIn] = Field(default_factory=list, max_length=MAX_TAGS)


class HostedZoneOut(ApiModel):
    id: str = Field(examples=["Z0123456789ABCDEFGHIJ"])
    name: str = Field(description="Normalized name with trailing dot.", examples=["example.com."])
    type: ZoneType
    description: str | None = None
    vpc_id: str | None = None
    vpc_region: str | None = None
    created_by: str = Field(examples=["Route 53"])
    created_at: datetime
    updated_at: datetime
    record_count: int = Field(examples=[2])
    tags: list[TagOut] = Field(default_factory=list)
    name_servers: list[str] = Field(default_factory=list, examples=[["ns-1234.awsdns-12.org."]])


ZONE_SORT_FIELDS: tuple[str, ...] = (
    "name",
    "type",
    "created_by",
    "record_count",
    "description",
    "id",
    "created_at",
)
