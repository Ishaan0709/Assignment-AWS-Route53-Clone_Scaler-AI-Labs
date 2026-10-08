from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ApiModel

RecordType = Literal["A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA", "SOA"]
RoutingPolicy = Literal["Simple", "Weighted", "Latency", "Failover", "Geolocation", "Multivalue"]


class RecordBase(BaseModel):
    name: str = Field(
        default="",
        max_length=255,
        description="Relative label (www), full name, or empty for the zone apex.",
        examples=["www"],
    )
    type: RecordType = Field(examples=["A"])
    ttl: int | None = Field(default=None, description="Seconds; ignored for alias.", examples=[300])
    values: list[str] = Field(
        default_factory=list, description="One value per entry.", examples=[["192.0.2.1"]]
    )
    routing_policy: RoutingPolicy = Field(default="Simple")
    set_identifier: str | None = Field(default=None, max_length=128, examples=["api-blue"])
    weight: int | None = Field(default=None, examples=[70])
    is_alias: bool = False
    alias_target: str | None = Field(
        default=None, max_length=255, examples=["d111111abcdef8.cloudfront.net."]
    )
    evaluate_target_health: bool | None = None
    health_check_id: str | None = Field(default=None, max_length=64)
    comment: str | None = Field(default=None, max_length=256)


class RecordCreate(RecordBase):
    pass


class RecordUpdate(RecordBase):
    """Full replacement. For the default apex NS/SOA only TTL and values are applied."""


class RecordOut(ApiModel):
    id: int
    zone_id: str
    name: str = Field(examples=["www.example.com."])
    type: RecordType
    ttl: int | None
    values: list[str]
    routing_policy: RoutingPolicy
    set_identifier: str | None
    weight: int | None
    is_alias: bool
    alias_target: str | None
    evaluate_target_health: bool | None
    health_check_id: str | None
    comment: str | None
    is_default: bool
    created_at: datetime
    updated_at: datetime


class BulkDeleteRequest(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500, examples=[[12, 13]])


BulkDeleteStatus = Literal["deleted", "skipped", "not_found"]


class BulkDeleteItem(BaseModel):
    id: int
    status: BulkDeleteStatus
    message: str | None = None


class BulkDeleteResponse(BaseModel):
    results: list[BulkDeleteItem]
    deleted: int
    skipped: int
    not_found: int


RECORD_SORT_FIELDS: tuple[str, ...] = ("name", "type", "ttl", "routing_policy", "created_at")
