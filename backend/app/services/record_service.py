from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from sqlalchemy import Select, asc, case, desc, exists, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.models import DnsRecord, HostedZone, RecordValue
from app.schemas.dns_record import (
    BulkDeleteItem,
    BulkDeleteResponse,
    RecordBase,
    RecordOut,
)
from app.services import validators
from app.services.domain import display_name, normalize_record_name
from app.services.listing import Page, paginate, resolve_sort

_SORTABLE = {
    "name": DnsRecord.name,
    "type": DnsRecord.type,
    "ttl": DnsRecord.ttl,
    "routing_policy": DnsRecord.routing_policy,
    "created_at": DnsRecord.created_at,
}

# Route 53 shows the apex NS then SOA first, then everything alphabetically by name/type.
_DEFAULT_ORDER = (
    desc(DnsRecord.is_default),
    case((DnsRecord.type == "NS", 0), (DnsRecord.type == "SOA", 1), else_=2),
    asc(DnsRecord.name),
    asc(DnsRecord.type),
    asc(DnsRecord.set_identifier),
    asc(DnsRecord.id),
)


@dataclass(frozen=True)
class PreparedRecord:
    """A fully validated and normalized record ready to be stored."""

    name: str
    type: str
    ttl: int | None
    values: list[str]
    routing_policy: str
    set_identifier: str | None
    weight: int | None
    is_alias: bool
    alias_target: str | None
    evaluate_target_health: bool | None
    health_check_id: str | None
    comment: str | None


# --- serialization -------------------------------------------------------------------------


def to_out(record: DnsRecord) -> RecordOut:
    return RecordOut(
        id=record.id,
        zone_id=record.zone_id,
        name=record.name,
        type=record.type,  # type: ignore[arg-type]
        ttl=record.ttl,
        values=record.value_list,
        routing_policy=record.routing_policy,  # type: ignore[arg-type]
        set_identifier=record.set_identifier,
        weight=record.weight,
        is_alias=record.is_alias,
        alias_target=record.alias_target,
        evaluate_target_health=record.evaluate_target_health,
        health_check_id=record.health_check_id,
        comment=record.comment,
        is_default=record.is_default,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


# --- queries --------------------------------------------------------------------------------


def _base_query(zone_id: str) -> Select[tuple[DnsRecord]]:
    return (
        select(DnsRecord)
        .where(DnsRecord.zone_id == zone_id)
        .options(selectinload(DnsRecord.values))
    )


def list_records(
    db: Session,
    zone: HostedZone,
    *,
    q: str | None = None,
    record_type: str | None = None,
    routing_policy: str | None = None,
    alias: bool | None = None,
    name: str | None = None,
    sort: str | None = None,
    order: str | None = None,
    page: Page,
) -> tuple[list[RecordOut], int]:
    stmt = _base_query(zone.id)
    if q:
        needle = f"%{q.strip().lower()}%"
        value_match = exists(
            select(RecordValue.id).where(
                RecordValue.record_id == DnsRecord.id, RecordValue.value.ilike(needle)
            )
        )
        stmt = stmt.where(
            or_(
                DnsRecord.name.ilike(needle),
                DnsRecord.alias_target.ilike(needle),
                DnsRecord.set_identifier.ilike(needle),
                value_match,
            )
        )
    if record_type:
        stmt = stmt.where(DnsRecord.type == validators.validate_record_type(record_type))
    if routing_policy:
        policy, _, _ = validators.validate_routing(routing_policy, "x", 0)
        stmt = stmt.where(DnsRecord.routing_policy == policy)
    if alias is not None:
        stmt = stmt.where(DnsRecord.is_alias.is_(alias))
    if name:
        stmt = stmt.where(DnsRecord.name.ilike(f"%{name.strip().lower()}%"))

    if sort:
        column, descending = resolve_sort(sort, order, _SORTABLE, "name")
        stmt = stmt.order_by(desc(column) if descending else asc(column), *_DEFAULT_ORDER)
    else:
        stmt = stmt.order_by(*_DEFAULT_ORDER)

    rows, total = paginate(db, stmt, page)
    return [to_out(row[0]) for row in rows], total


def get_record(db: Session, zone: HostedZone, record_id: int) -> DnsRecord:
    record = db.scalar(_base_query(zone.id).where(DnsRecord.id == record_id))
    if record is None:
        raise NotFoundError(
            f"No record with ID {record_id} in hosted zone {display_name(zone.name)}.",
            code="NoSuchRecord",
        )
    return record


def _records_at_name(db: Session, zone: HostedZone, name: str) -> list[DnsRecord]:
    return list(db.scalars(_base_query(zone.id).where(DnsRecord.name == name)).all())


# --- validation -----------------------------------------------------------------------------


def _field(prefix: str, name: str) -> str:
    return f"{prefix}{name}" if prefix else name


def _reprefix(error: BadRequestError, prefix: str) -> BadRequestError:
    if not prefix:
        return error
    return BadRequestError(
        error.message,
        fields={_field(prefix, k): v for k, v in error.fields.items()},
        code=error.code,
        status_code=error.status_code,
    )


def prepare(zone: HostedZone, data: RecordBase, *, prefix: str = "") -> PreparedRecord:
    """Validate every rule that does not need the database."""
    try:
        name = normalize_record_name(data.name, zone.name)
        rtype = validators.validate_record_type(data.type)
        if rtype == "SOA":
            raise BadRequestError(
                "SOA records are created automatically with the hosted zone and cannot be added.",
                fields={"type": "SOA cannot be created manually."},
                code="InvalidRecordType",
            )
        if rtype == "CNAME" and name == zone.name:
            raise BadRequestError(
                f"RRSet of type CNAME with DNS name {display_name(zone.name)} is not permitted "
                f"at apex in zone {display_name(zone.name)}.",
                fields={"type": "A CNAME record cannot be created at the zone apex."},
                code="InvalidChangeBatch",
            )
        values, ttl, alias_target = validators.validate_alias(
            rtype, data.is_alias, data.alias_target, data.values, data.ttl
        )
        policy, set_identifier, weight = validators.validate_routing(
            data.routing_policy, data.set_identifier, data.weight
        )
        comment = validators.validate_comment(data.comment)
    except BadRequestError as exc:
        raise _reprefix(exc, prefix) from exc

    return PreparedRecord(
        name=name,
        type=rtype,
        ttl=ttl,
        values=values,
        routing_policy=policy,
        set_identifier=set_identifier,
        weight=weight,
        is_alias=data.is_alias,
        alias_target=alias_target,
        evaluate_target_health=(bool(data.evaluate_target_health) if data.is_alias else None),
        health_check_id=(data.health_check_id or "").strip() or None,
        comment=comment,
    )


def _conflict(
    message: str, field: str, prefix: str, code: str = "InvalidChangeBatch"
) -> ConflictError:
    return ConflictError(message, fields={_field(prefix, field): message}, code=code)


def check_conflicts(
    db: Session,
    zone: HostedZone,
    prepared: PreparedRecord,
    *,
    exclude_id: int | None = None,
    pending: Iterable[PreparedRecord] = (),
    prefix: str = "",
) -> None:
    """Enforce the CNAME exclusivity and uniqueness rules against stored and pending records."""
    shown = display_name(prepared.name)
    existing: list[tuple[str, str, str | None]] = [
        (r.type, r.routing_policy, r.set_identifier)
        for r in _records_at_name(db, zone, prepared.name)
        if r.id != exclude_id
    ]
    existing += [
        (p.type, p.routing_policy, p.set_identifier) for p in pending if p.name == prepared.name
    ]

    if prepared.type == "CNAME":
        if any(t != "CNAME" for t, _, _ in existing):
            raise _conflict(
                f"A CNAME record cannot be created for {shown} because other record types "
                "already exist with that name.",
                "name",
                prefix,
            )
    elif any(t == "CNAME" for t, _, _ in existing):
        raise _conflict(
            f"A {prepared.type} record cannot be created for {shown} because a CNAME record "
            "already exists with that name.",
            "name",
            prefix,
        )

    same_type = [(policy, sid) for t, policy, sid in existing if t == prepared.type]
    if any(policy != prepared.routing_policy for policy, _ in same_type):
        raise _conflict(
            f"All {prepared.type} records named {shown} must use the same routing policy.",
            "routing_policy",
            prefix,
        )
    if any(sid == prepared.set_identifier for _, sid in same_type):
        if prepared.routing_policy == "Simple":
            message = f"A {prepared.type} record named {shown} already exists."
            field = "name"
        else:
            message = (
                f"A {prepared.type} record named {shown} with record ID "
                f"'{prepared.set_identifier}' already exists."
            )
            field = "set_identifier"
        raise _conflict(message, field, prefix, code="RecordAlreadyExists")


# --- mutations ------------------------------------------------------------------------------


def _apply(record: DnsRecord, prepared: PreparedRecord) -> None:
    record.name = prepared.name
    record.type = prepared.type
    record.ttl = prepared.ttl
    record.routing_policy = prepared.routing_policy
    record.set_identifier = prepared.set_identifier
    record.weight = prepared.weight
    record.is_alias = prepared.is_alias
    record.alias_target = prepared.alias_target
    record.evaluate_target_health = prepared.evaluate_target_health
    record.health_check_id = prepared.health_check_id
    record.comment = prepared.comment
    record.values = [RecordValue(position=i, value=v) for i, v in enumerate(prepared.values)]


def create_records(db: Session, zone: HostedZone, items: Sequence[RecordBase]) -> list[DnsRecord]:
    """Create one or many records atomically (the quick-create 'Add another record' flow)."""
    if not items:
        raise BadRequestError("Provide at least one record.", fields={"records": "Required."})
    multi = len(items) > 1
    prepared_list: list[PreparedRecord] = []
    for index, item in enumerate(items):
        prefix = f"records.{index}." if multi else ""
        prepared = prepare(zone, item, prefix=prefix)
        check_conflicts(db, zone, prepared, pending=prepared_list, prefix=prefix)
        prepared_list.append(prepared)

    created: list[DnsRecord] = []
    for prepared in prepared_list:
        record = DnsRecord(zone_id=zone.id)
        _apply(record, prepared)
        db.add(record)
        created.append(record)
    db.commit()
    return [get_record(db, zone, r.id) for r in created]


def update_record(db: Session, zone: HostedZone, record: DnsRecord, data: RecordBase) -> DnsRecord:
    if record.is_default:
        # Apex NS/SOA: only TTL and values (and comment) may change.
        values = validators.validate_values(record.type, data.values)
        record.ttl = validators.validate_ttl(data.ttl)
        record.comment = validators.validate_comment(data.comment)
        record.values = [RecordValue(position=i, value=v) for i, v in enumerate(values)]
        db.commit()
        return get_record(db, zone, record.id)

    prepared = prepare(zone, data)
    check_conflicts(db, zone, prepared, exclude_id=record.id)
    _apply(record, prepared)
    db.commit()
    return get_record(db, zone, record.id)


def _refuse_default(record: DnsRecord) -> ConflictError:
    return ConflictError(
        f"The default {record.type} record for the hosted zone cannot be deleted.",
        code="InvalidChangeBatch",
    )


def delete_record(db: Session, record: DnsRecord) -> None:
    if record.is_default:
        raise _refuse_default(record)
    db.delete(record)
    db.commit()


def bulk_delete(db: Session, zone: HostedZone, ids: Sequence[int]) -> BulkDeleteResponse:
    results: list[BulkDeleteItem] = []
    for record_id in dict.fromkeys(ids):  # de-duplicate, keep order
        record = db.scalar(_base_query(zone.id).where(DnsRecord.id == record_id))
        if record is None:
            results.append(
                BulkDeleteItem(id=record_id, status="not_found", message="Record not found.")
            )
        elif record.is_default:
            results.append(
                BulkDeleteItem(
                    id=record_id,
                    status="skipped",
                    message=f"The default {record.type} record cannot be deleted.",
                )
            )
        else:
            db.delete(record)
            results.append(BulkDeleteItem(id=record_id, status="deleted"))
    db.commit()
    return BulkDeleteResponse(
        results=results,
        deleted=sum(r.status == "deleted" for r in results),
        skipped=sum(r.status == "skipped" for r in results),
        not_found=sum(r.status == "not_found" for r in results),
    )


def all_records(db: Session, zone: HostedZone) -> list[DnsRecord]:
    return list(db.scalars(_base_query(zone.id).order_by(*_DEFAULT_ORDER)).all())
