from typing import Annotated, Literal

from fastapi import APIRouter, Body, Query, Response, status

from app.deps import CurrentUser, DbSession
from app.schemas.common import ErrorResponse, Paginated
from app.schemas.dns_record import (
    BulkDeleteRequest,
    BulkDeleteResponse,
    RecordCreate,
    RecordOut,
    RecordType,
    RecordUpdate,
    RoutingPolicy,
)
from app.services import record_service, zone_service
from app.services.listing import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page

router = APIRouter(prefix="/hostedzones/{zone_id}/records", tags=["records"])

_NOT_FOUND = {404: {"model": ErrorResponse, "description": "Hosted zone or record not found"}}
_UNAUTHORIZED = {401: {"model": ErrorResponse, "description": "Not signed in"}}
_INVALID = {
    400: {"model": ErrorResponse, "description": "Validation failed (see `error.fields`)"},
    409: {"model": ErrorResponse, "description": "Conflicts with an existing record"},
}

_CREATE_EXAMPLES = {
    "single": {
        "summary": "One A record",
        "value": {"name": "www", "type": "A", "ttl": 300, "values": ["192.0.2.1"]},
    },
    "batch": {
        "summary": "Quick create: several records at once",
        "value": [
            {"name": "mail", "type": "A", "ttl": 300, "values": ["203.0.113.10"]},
            {"name": "", "type": "MX", "ttl": 3600, "values": ["10 mail.example.com."]},
        ],
    },
    "alias": {
        "summary": "Alias to CloudFront",
        "value": {
            "name": "cdn",
            "type": "A",
            "is_alias": True,
            "alias_target": "d111111abcdef8.cloudfront.net.",
            "evaluate_target_health": False,
        },
    },
    "weighted": {
        "summary": "Weighted record",
        "value": {
            "name": "api",
            "type": "A",
            "ttl": 60,
            "values": ["198.51.100.10"],
            "routing_policy": "Weighted",
            "set_identifier": "api-blue",
            "weight": 70,
        },
    },
}


@router.get(
    "",
    response_model=Paginated[RecordOut],
    summary="List records",
    description=(
        "Paginated records of a hosted zone. Default order mirrors Route 53: apex NS, then "
        "SOA, then alphabetical by name and type. `q` matches record name, values, alias "
        "target and record ID."
    ),
    responses={**_NOT_FOUND, **_UNAUTHORIZED},
)
def list_records(
    zone_id: str,
    db: DbSession,
    _: CurrentUser,
    q: Annotated[str | None, Query(max_length=255)] = None,
    type: Annotated[RecordType | None, Query()] = None,
    routing_policy: Annotated[RoutingPolicy | None, Query()] = None,
    alias: Annotated[bool | None, Query()] = None,
    name: Annotated[str | None, Query(max_length=255)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    sort: Annotated[
        str | None, Query(description="name|type|ttl|routing_policy|created_at")
    ] = None,
    order: Annotated[Literal["asc", "desc"] | None, Query()] = None,
) -> Paginated[RecordOut]:
    zone = zone_service.get_zone(db, zone_id)
    items, total = record_service.list_records(
        db,
        zone,
        q=q,
        record_type=type,
        routing_policy=routing_policy,
        alias=alias,
        name=name,
        sort=sort,
        order=order,
        page=Page(page=page, page_size=page_size),
    )
    return Paginated(items=items, total=total, page=page, page_size=page_size)


@router.post(
    "",
    response_model=list[RecordOut],
    status_code=status.HTTP_201_CREATED,
    summary="Create record(s)",
    description=(
        "Accepts a single record object or an array (the quick-create 'Add another record' "
        "flow). All records are validated and created atomically; the response is always a list."
    ),
    responses={**_INVALID, **_NOT_FOUND, **_UNAUTHORIZED},
)
def create_records(
    zone_id: str,
    payload: Annotated[RecordCreate | list[RecordCreate], Body(openapi_examples=_CREATE_EXAMPLES)],
    db: DbSession,
    _: CurrentUser,
) -> list[RecordOut]:
    zone = zone_service.get_zone(db, zone_id)
    items = payload if isinstance(payload, list) else [payload]
    created = record_service.create_records(db, zone, items)
    return [record_service.to_out(r) for r in created]


@router.get(
    "/{record_id}",
    response_model=RecordOut,
    summary="Get record",
    responses={**_NOT_FOUND, **_UNAUTHORIZED},
)
def get_record(zone_id: str, record_id: int, db: DbSession, _: CurrentUser) -> RecordOut:
    zone = zone_service.get_zone(db, zone_id)
    return record_service.to_out(record_service.get_record(db, zone, record_id))


@router.put(
    "/{record_id}",
    response_model=RecordOut,
    summary="Edit record",
    description=(
        "Full replacement. For the default apex NS and SOA records only TTL, values and "
        "comment are applied; name and type stay fixed."
    ),
    responses={**_INVALID, **_NOT_FOUND, **_UNAUTHORIZED},
)
def update_record(
    zone_id: str, record_id: int, payload: RecordUpdate, db: DbSession, _: CurrentUser
) -> RecordOut:
    zone = zone_service.get_zone(db, zone_id)
    record = record_service.get_record(db, zone, record_id)
    return record_service.to_out(record_service.update_record(db, zone, record, payload))


@router.delete(
    "/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete record",
    description="Returns 409 for the default apex NS and SOA records, which cannot be deleted.",
    responses={
        409: {"model": ErrorResponse, "description": "Default record cannot be deleted"},
        **_NOT_FOUND,
        **_UNAUTHORIZED,
    },
)
def delete_record(zone_id: str, record_id: int, db: DbSession, _: CurrentUser) -> Response:
    zone = zone_service.get_zone(db, zone_id)
    record = record_service.get_record(db, zone, record_id)
    record_service.delete_record(db, record)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/bulk-delete",
    response_model=BulkDeleteResponse,
    summary="Bulk delete records",
    description=(
        "Deletes many records in one transaction and reports a per-ID result: `deleted`, "
        "`skipped` (default NS/SOA) or `not_found`."
    ),
    responses={**_NOT_FOUND, **_UNAUTHORIZED},
)
def bulk_delete_records(
    zone_id: str, payload: BulkDeleteRequest, db: DbSession, _: CurrentUser
) -> BulkDeleteResponse:
    zone = zone_service.get_zone(db, zone_id)
    return record_service.bulk_delete(db, zone, payload.ids)
