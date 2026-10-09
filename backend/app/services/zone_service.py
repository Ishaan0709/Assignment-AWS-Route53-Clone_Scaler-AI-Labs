from collections.abc import Sequence

from sqlalchemy import Select, asc, desc, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.models import DnsRecord, HostedZone, RecordValue, Tag
from app.schemas.hosted_zone import (
    MAX_TAGS,
    HostedZoneCreate,
    HostedZoneOut,
    HostedZoneUpdate,
    TagIn,
)
from app.services.domain import display_name, normalize_domain
from app.services.ids import generate_name_servers, generate_zone_id, soa_value
from app.services.listing import Page, paginate, resolve_sort

DEFAULT_NS_TTL = 172800
DEFAULT_SOA_TTL = 900

_record_count_subq = (
    select(func.count(DnsRecord.id))
    .where(DnsRecord.zone_id == HostedZone.id)
    .correlate(HostedZone)
    .scalar_subquery()
)

_SORTABLE = {
    "name": HostedZone.name,
    "type": HostedZone.type,
    "created_by": HostedZone.created_by,
    "record_count": _record_count_subq,
    "description": HostedZone.description,
    "id": HostedZone.id,
    "created_at": HostedZone.created_at,
}


# --- serialization -------------------------------------------------------------------------


def name_servers_of(zone: HostedZone) -> list[str]:
    for record in zone.records:
        if record.is_default and record.type == "NS":
            return record.value_list
    return []


def to_out(zone: HostedZone, record_count: int) -> HostedZoneOut:
    return HostedZoneOut(
        id=zone.id,
        name=zone.name,
        type=zone.type,  # type: ignore[arg-type]
        description=zone.description,
        vpc_id=zone.vpc_id,
        vpc_region=zone.vpc_region,
        created_by=zone.created_by,
        created_at=zone.created_at,
        updated_at=zone.updated_at,
        record_count=record_count,
        tags=[{"key": t.key, "value": t.value} for t in zone.tags],  # type: ignore[list-item]
        name_servers=name_servers_of(zone),
    )


def record_count(db: Session, zone_id: str) -> int:
    return int(db.scalar(select(func.count(DnsRecord.id)).where(DnsRecord.zone_id == zone_id)) or 0)


def non_default_record_count(db: Session, zone_id: str) -> int:
    return int(
        db.scalar(
            select(func.count(DnsRecord.id)).where(
                DnsRecord.zone_id == zone_id, DnsRecord.is_default.is_(False)
            )
        )
        or 0
    )


# --- queries --------------------------------------------------------------------------------


def _base_query() -> Select[tuple[HostedZone, int]]:
    return select(HostedZone, _record_count_subq.label("record_count")).options(
        selectinload(HostedZone.tags),
        selectinload(HostedZone.records).selectinload(DnsRecord.values),
    )


def list_zones(
    db: Session,
    *,
    q: str | None = None,
    zone_type: str | None = None,
    name: str | None = None,
    sort: str | None = None,
    order: str | None = None,
    page: Page,
) -> tuple[list[HostedZoneOut], int]:
    stmt = _base_query()
    if q:
        needle = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                HostedZone.name.ilike(needle),
                HostedZone.description.ilike(needle),
                HostedZone.id.ilike(needle),
                HostedZone.type.ilike(needle),
            )
        )
    if zone_type:
        stmt = stmt.where(HostedZone.type == zone_type.strip().lower())
    if name:
        stmt = stmt.where(HostedZone.name.ilike(f"%{name.strip().lower()}%"))

    column, descending = resolve_sort(sort, order, _SORTABLE, "name")
    stmt = stmt.order_by(desc(column) if descending else asc(column), HostedZone.id)

    rows, total = paginate(db, stmt, page)
    return [to_out(zone, count) for zone, count in rows], total


def get_zone(db: Session, zone_id: str) -> HostedZone:
    zone = db.scalar(_base_query().where(HostedZone.id == zone_id).limit(1))
    if zone is None:
        raise NotFoundError(f"No hosted zone found with ID {zone_id}.", code="NoSuchHostedZone")
    return zone


def get_zone_out(db: Session, zone_id: str) -> HostedZoneOut:
    zone = get_zone(db, zone_id)
    return to_out(zone, record_count(db, zone.id))


# --- mutations ------------------------------------------------------------------------------


def _validate_tags(tags: Sequence[TagIn]) -> list[Tag]:
    if len(tags) > MAX_TAGS:
        raise BadRequestError(
            f"A hosted zone can have at most {MAX_TAGS} tags.", fields={"tags": "Too many tags."}
        )
    seen: set[str] = set()
    result: list[Tag] = []
    for tag in tags:
        key = tag.key.strip()
        if not key:
            raise BadRequestError("Tag key is required.", fields={"tags": "Tag key is required."})
        if key.lower().startswith("aws:"):
            raise BadRequestError(
                "Tag keys cannot start with 'aws:'.", fields={"tags": "Reserved tag prefix."}
            )
        if key in seen:
            raise BadRequestError(
                f"Duplicate tag key '{key}'.", fields={"tags": f"Duplicate tag key '{key}'."}
            )
        seen.add(key)
        result.append(Tag(key=key, value=tag.value.strip()))
    return result


def _default_records(zone_name: str) -> list[DnsRecord]:
    name_servers = generate_name_servers()
    ns = DnsRecord(
        name=zone_name,
        type="NS",
        ttl=DEFAULT_NS_TTL,
        is_default=True,
        values=[RecordValue(position=i, value=v) for i, v in enumerate(name_servers)],
    )
    soa = DnsRecord(
        name=zone_name,
        type="SOA",
        ttl=DEFAULT_SOA_TTL,
        is_default=True,
        values=[RecordValue(position=0, value=soa_value(name_servers[0]))],
    )
    return [ns, soa]


def create_zone(db: Session, data: HostedZoneCreate) -> HostedZone:
    name = normalize_domain(data.name)
    description = (data.description or "").strip() or None

    vpc_id = (data.vpc_id or "").strip() or None
    vpc_region = (data.vpc_region or "").strip() or None
    if data.type == "private":
        fields: dict[str, str] = {}
        if not vpc_region:
            fields["vpc_region"] = "Choose the region of the VPC to associate."
        if not vpc_id:
            fields["vpc_id"] = "Choose a VPC to associate with the private hosted zone."
        if fields:
            raise BadRequestError(
                "A private hosted zone must be associated with a VPC.",
                fields=fields,
                code="InvalidVPC",
            )
    else:
        vpc_id = vpc_region = None

    duplicate = db.scalar(
        select(HostedZone.id).where(HostedZone.name == name, HostedZone.type == data.type)
    )
    if duplicate:
        raise ConflictError(
            f"A {data.type} hosted zone named {display_name(name)} already exists.",
            fields={"name": "A hosted zone with this name already exists."},
            code="HostedZoneAlreadyExists",
        )

    tags = _validate_tags(data.tags)

    zone = HostedZone(
        id=generate_zone_id(),
        name=name,
        type=data.type,
        description=description,
        vpc_id=vpc_id,
        vpc_region=vpc_region,
    )
    zone.records.extend(_default_records(name))
    zone.tags.extend(tags)
    db.add(zone)
    db.commit()
    return get_zone(db, zone.id)


def _set_tags(db: Session, zone: HostedZone, tags: Sequence[TagIn]) -> None:
    """Replace the zone's tags.

    The old rows are flushed away *before* the new ones are inserted; otherwise the
    unit of work inserts first and trips the ``(zone_id, key)`` unique constraint
    whenever a key is kept.
    """
    new_tags = _validate_tags(tags)
    zone.tags.clear()
    db.flush()
    zone.tags.extend(new_tags)


def update_zone(db: Session, zone: HostedZone, data: HostedZoneUpdate) -> HostedZone:
    """Only ``description`` and ``tags`` change; name and type are immutable like Route 53."""
    if "description" in data.model_fields_set:
        zone.description = (data.description or "").strip() or None
    if data.tags is not None:
        _set_tags(db, zone, data.tags)
    db.commit()
    return get_zone(db, zone.id)


def replace_tags(db: Session, zone: HostedZone, tags: Sequence[TagIn]) -> HostedZone:
    _set_tags(db, zone, tags)
    db.commit()
    return get_zone(db, zone.id)


def delete_zone(db: Session, zone: HostedZone, *, force: bool = False) -> None:
    remaining = non_default_record_count(db, zone.id)
    if remaining and not force:
        raise ConflictError(
            "The hosted zone contains records other than the default NS and SOA records. "
            "Delete those records first.",
            code="HostedZoneNotEmpty",
        )
    db.delete(zone)
    db.commit()
