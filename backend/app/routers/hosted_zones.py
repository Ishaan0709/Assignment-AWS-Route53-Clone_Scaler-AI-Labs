from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response, status

from app.deps import CurrentUser, DbSession
from app.schemas.common import ErrorResponse, Paginated
from app.schemas.hosted_zone import (
    HostedZoneCreate,
    HostedZoneOut,
    HostedZoneUpdate,
    TagsReplace,
)
from app.services import zone_service
from app.services.listing import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page

router = APIRouter(prefix="/hostedzones", tags=["hosted zones"])

_NOT_FOUND = {404: {"model": ErrorResponse, "description": "Hosted zone not found"}}
_UNAUTHORIZED = {401: {"model": ErrorResponse, "description": "Not signed in"}}


@router.get(
    "",
    response_model=Paginated[HostedZoneOut],
    summary="List hosted zones",
    description=(
        "Paginated list with a computed `record_count` per zone. `q` matches name, "
        "description, ID and type; `type` and `name` are structured filters."
    ),
    responses=_UNAUTHORIZED,
)
def list_hosted_zones(
    db: DbSession,
    _: CurrentUser,
    q: Annotated[str | None, Query(max_length=255, description="Free-text filter")] = None,
    type: Annotated[Literal["public", "private"] | None, Query()] = None,
    name: Annotated[str | None, Query(max_length=255)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    sort: Annotated[
        str | None, Query(description="name|type|created_by|record_count|description|id|created_at")
    ] = None,
    order: Annotated[Literal["asc", "desc"] | None, Query()] = None,
) -> Paginated[HostedZoneOut]:
    items, total = zone_service.list_zones(
        db,
        q=q,
        zone_type=type,
        name=name,
        sort=sort,
        order=order,
        page=Page(page=page, page_size=page_size),
    )
    return Paginated(items=items, total=total, page=page, page_size=page_size)


@router.post(
    "",
    response_model=HostedZoneOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create hosted zone",
    description=(
        "Validates and normalizes the domain name, generates a `Z...` ID and creates the "
        "default apex NS and SOA records in the same transaction. Private zones require a VPC."
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Invalid domain name or missing VPC"},
        409: {"model": ErrorResponse, "description": "A zone with this name and type exists"},
        **_UNAUTHORIZED,
    },
)
def create_hosted_zone(payload: HostedZoneCreate, db: DbSession, _: CurrentUser) -> HostedZoneOut:
    zone = zone_service.create_zone(db, payload)
    return zone_service.to_out(zone, zone_service.record_count(db, zone.id))


@router.get(
    "/{zone_id}",
    response_model=HostedZoneOut,
    summary="Get hosted zone",
    description="Zone details including `record_count`, tags and the delegation name servers.",
    responses={**_NOT_FOUND, **_UNAUTHORIZED},
)
def get_hosted_zone(zone_id: str, db: DbSession, _: CurrentUser) -> HostedZoneOut:
    return zone_service.get_zone_out(db, zone_id)


@router.put(
    "/{zone_id}",
    response_model=HostedZoneOut,
    summary="Edit hosted zone",
    description=(
        "Only the description (comment) and tags can change. The name and type are "
        "immutable, exactly like Route 53."
    ),
    responses={**_NOT_FOUND, **_UNAUTHORIZED},
)
def update_hosted_zone(
    zone_id: str, payload: HostedZoneUpdate, db: DbSession, _: CurrentUser
) -> HostedZoneOut:
    zone = zone_service.get_zone(db, zone_id)
    zone = zone_service.update_zone(db, zone, payload)
    return zone_service.to_out(zone, zone_service.record_count(db, zone.id))


@router.delete(
    "/{zone_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete hosted zone",
    description=(
        "Refuses with 409 `HostedZoneNotEmpty` while the zone still has records other than "
        "the default NS and SOA. Pass `force=true` to delete everything."
    ),
    responses={
        409: {"model": ErrorResponse, "description": "Zone still contains records"},
        **_NOT_FOUND,
        **_UNAUTHORIZED,
    },
)
def delete_hosted_zone(
    zone_id: str,
    db: DbSession,
    _: CurrentUser,
    force: Annotated[bool, Query(description="Delete even if records exist")] = False,
) -> Response:
    zone = zone_service.get_zone(db, zone_id)
    zone_service.delete_zone(db, zone, force=force)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/{zone_id}/tags",
    response_model=HostedZoneOut,
    summary="Replace hosted zone tags",
    responses={**_NOT_FOUND, **_UNAUTHORIZED},
)
def replace_tags(
    zone_id: str, payload: TagsReplace, db: DbSession, _: CurrentUser
) -> HostedZoneOut:
    zone = zone_service.get_zone(db, zone_id)
    zone = zone_service.replace_tags(db, zone, payload.tags)
    return zone_service.to_out(zone, zone_service.record_count(db, zone.id))
