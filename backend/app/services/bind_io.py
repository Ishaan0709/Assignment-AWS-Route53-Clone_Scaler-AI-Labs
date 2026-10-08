"""BIND zone-file import (with dry-run preview) and JSON/BIND export.

Parsing is done per logical line with dnspython so that each error can be reported with
its line number and valid lines are still imported.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

import dns.exception
import dns.name
import dns.rdataclass
import dns.rdatatype
import dns.ttl
import dns.zone
from sqlalchemy.orm import Session

from app.core.errors import ApiError, BadRequestError, ConflictError
from app.models import DnsRecord, HostedZone
from app.schemas.bind import ImportLineError, ImportRecordPreview, ImportSummary
from app.schemas.dns_record import RecordBase
from app.services import record_service
from app.services.domain import display_name, ensure_dot
from app.services.record_service import PreparedRecord
from app.services.validators import DEFAULT_TTL, USER_RECORD_TYPES
from app.services.zone_service import name_servers_of

MAX_IMPORT_BYTES = 1_000_000
MAX_IMPORT_RECORDS = 1000


@dataclass
class ParsedRecord:
    line: int
    name: str
    type: str
    ttl: int | None
    values: list[str]


@dataclass
class ParseResult:
    records: list[ParsedRecord] = field(default_factory=list)
    errors: list[tuple[int | None, str]] = field(default_factory=list)


# --- tokenizing -----------------------------------------------------------------------------


def _strip_comment(line: str) -> str:
    """Remove a ``;`` comment that is not inside double quotes."""
    out: list[str] = []
    in_quotes = False
    escaped = False
    for ch in line:
        if escaped:
            out.append(ch)
            escaped = False
            continue
        if ch == "\\":
            out.append(ch)
            escaped = True
            continue
        if ch == '"':
            in_quotes = not in_quotes
        elif ch == ";" and not in_quotes:
            break
        out.append(ch)
    return "".join(out)


@dataclass(frozen=True)
class LogicalLine:
    number: int  # first physical line number
    text: str  # comment-free, parentheses joined, stripped
    has_owner: bool  # first physical line did not start with whitespace


def _logical_lines(text: str) -> list[LogicalLine]:
    """Join parenthesised multi-line entries into single logical lines."""
    lines: list[LogicalLine] = []
    buffer: list[str] = []
    start = 0
    has_owner = True
    depth = 0
    for number, raw in enumerate(text.splitlines(), start=1):
        content = _strip_comment(raw)
        if depth == 0:
            if not content.strip():
                continue
            start = number
            has_owner = not content[:1].isspace()
        buffer.append(content)
        depth += content.count("(") - content.count(")")
        if depth <= 0:
            joined = " ".join(part.strip() for part in buffer).replace("(", " ").replace(")", " ")
            lines.append(LogicalLine(start, " ".join(joined.split()), has_owner))
            buffer = []
            depth = 0
    if buffer:
        joined = " ".join(part.strip() for part in buffer).replace("(", " ").replace(")", " ")
        lines.append(LogicalLine(start, " ".join(joined.split()), has_owner))
    return lines


_TTL_RE = re.compile(r"^\d+[smhdw]?$", re.IGNORECASE)


def parse_zone_text(text: str, zone_name: str) -> ParseResult:
    """Parse BIND text into records with per-line errors. Owner names are made absolute."""
    result = ParseResult()
    origin = ensure_dot(zone_name.lower())
    default_ttl: int | None = None
    last_owner: str | None = None

    for logical in _logical_lines(text):
        line_no, stripped = logical.number, logical.text
        upper = stripped.upper()
        if upper.startswith("$ORIGIN"):
            parts = stripped.split()
            if len(parts) != 2:
                result.errors.append((line_no, "$ORIGIN requires exactly one argument."))
                continue
            try:
                origin = dns.name.from_text(parts[1], origin=dns.name.from_text(origin)).to_text()
            except dns.exception.DNSException as exc:
                result.errors.append((line_no, f"Invalid $ORIGIN: {exc}"))
            continue
        if upper.startswith("$TTL"):
            parts = stripped.split()
            if len(parts) != 2 or not _TTL_RE.match(parts[1]):
                result.errors.append((line_no, "$TTL requires a single TTL value."))
                continue
            try:
                default_ttl = dns.ttl.from_text(parts[1])
            except dns.exception.DNSException as exc:
                result.errors.append((line_no, f"Invalid $TTL: {exc}"))
            continue
        if upper.startswith("$"):
            result.errors.append((line_no, f"Directive {stripped.split()[0]} is not supported."))
            continue

        # Continuation lines (leading whitespace) reuse the previous owner name.
        if logical.has_owner:
            last_owner = stripped.split()[0]
            record_text = stripped
        else:
            if last_owner is None:
                result.errors.append((line_no, "Record has no owner name."))
                continue
            record_text = f"{last_owner} {stripped}"

        ttl_line = f"$TTL {default_ttl if default_ttl is not None else DEFAULT_TTL}"
        snippet = f"$ORIGIN {origin}\n{ttl_line}\n{record_text}\n"
        try:
            zone = dns.zone.from_text(
                snippet,
                origin=origin,
                rdclass=dns.rdataclass.IN,
                relativize=False,
                check_origin=False,
                allow_include=False,
            )
        except dns.exception.DNSException as exc:
            result.errors.append((line_no, _clean_dns_error(str(exc))))
            continue
        except Exception as exc:
            result.errors.append((line_no, _clean_dns_error(str(exc)) or "Could not parse record."))
            continue

        for name, node in zone.nodes.items():
            for rdataset in node.rdatasets:
                result.records.append(
                    ParsedRecord(
                        line=line_no,
                        name=name.to_text().lower(),
                        type=dns.rdatatype.to_text(rdataset.rdtype),
                        ttl=int(rdataset.ttl),
                        values=[rdata.to_text() for rdata in rdataset],
                    )
                )
    return result


def _clean_dns_error(message: str) -> str:
    # dnspython prefixes messages with "<string>:3: "; strip that location noise.
    return re.sub(r"^<string>:\d+:\s*", "", message).strip()


def _merge(records: list[ParsedRecord]) -> list[ParsedRecord]:
    """Combine lines with the same (name, type) into one multi-value record, keeping order."""
    merged: dict[tuple[str, str], ParsedRecord] = {}
    for record in records:
        key = (record.name, record.type)
        if key in merged:
            existing = merged[key]
            for value in record.values:
                if value not in existing.values:
                    existing.values.append(value)
        else:
            merged[key] = ParsedRecord(
                record.line, record.name, record.type, record.ttl, list(record.values)
            )
    return list(merged.values())


# --- import ---------------------------------------------------------------------------------


def import_zone_text(db: Session, zone: HostedZone, text: str, *, dry_run: bool) -> ImportSummary:
    if len(text.encode("utf-8", errors="ignore")) > MAX_IMPORT_BYTES:
        raise BadRequestError(
            "Zone file is too large (limit 1 MB).", fields={"file": "File too large."}
        )
    parsed = parse_zone_text(text, zone.name)
    errors = [ImportLineError(line=line, message=message) for line, message in parsed.errors]
    previews: list[ImportRecordPreview] = []
    pending: list[PreparedRecord] = []

    records = _merge(parsed.records)
    if len(records) > MAX_IMPORT_RECORDS:
        raise BadRequestError(
            f"Zone file contains more than {MAX_IMPORT_RECORDS} records.",
            fields={"file": "Too many records."},
        )

    for record in records:
        preview = ImportRecordPreview(
            line=record.line,
            name=record.name,
            type=record.type,
            ttl=record.ttl,
            values=list(record.values),
            status="new",
        )
        if record.type == "SOA":
            preview.status, preview.reason = "skipped", "The SOA record is managed by Route 53."
        elif record.type == "NS" and record.name == zone.name:
            preview.status, preview.reason = (
                "skipped",
                "Apex NS records are managed by Route 53.",
            )
        elif record.type not in USER_RECORD_TYPES:
            preview.status = "error"
            preview.reason = f"Record type {record.type} is not supported."
            errors.append(ImportLineError(line=record.line, message=preview.reason))
        else:
            try:
                prepared = record_service.prepare(
                    zone,
                    RecordBase(
                        name=record.name, type=record.type, ttl=record.ttl, values=record.values
                    ),
                )
                record_service.check_conflicts(db, zone, prepared, pending=pending)
            except ConflictError as exc:
                preview.status, preview.reason = "skipped", exc.message
            except ApiError as exc:
                preview.status, preview.reason = "error", exc.message
                errors.append(ImportLineError(line=record.line, message=exc.message))
            else:
                pending.append(prepared)
        previews.append(preview)

    if not dry_run and pending:
        for prepared in pending:
            new_record = DnsRecord(zone_id=zone.id)
            record_service._apply(new_record, prepared)
            db.add(new_record)
        db.commit()

    return ImportSummary(
        dry_run=dry_run,
        imported=len(pending),
        skipped=sum(p.status == "skipped" for p in previews),
        errors=errors,
        records=previews,
    )


# --- export ---------------------------------------------------------------------------------


def export_filename(zone: HostedZone, fmt: str) -> str:
    base = display_name(zone.name)
    return f"{base}.zone" if fmt == "bind" else f"{base}.json"


def export_json(zone: HostedZone, records: list[DnsRecord]) -> str:
    payload: dict[str, Any] = {
        "hosted_zone": {
            "id": zone.id,
            "name": zone.name,
            "type": zone.type,
            "description": zone.description,
            "vpc_id": zone.vpc_id,
            "vpc_region": zone.vpc_region,
            "created_by": zone.created_by,
            "created_at": zone.created_at.isoformat(),
            "name_servers": name_servers_of(zone),
            "tags": [{"key": t.key, "value": t.value} for t in zone.tags],
        },
        "records": [
            record_service.to_out(record).model_dump(mode="json", exclude={"zone_id"})
            for record in records
        ],
    }
    return json.dumps(payload, indent=2)


def export_bind(zone: HostedZone, records: list[DnsRecord]) -> str:
    lines = [
        f"; Exported from Route 53 clone - hosted zone {display_name(zone.name)} ({zone.id})",
        f"$ORIGIN {zone.name}",
        f"$TTL {DEFAULT_TTL}",
        "",
    ]
    width = max((len(r.name) for r in records), default=20) + 2
    for record in records:
        if record.is_alias:
            health = "yes" if record.evaluate_target_health else "no"
            lines.append(
                f"; ALIAS {record.name} {record.type} -> {record.alias_target} "
                f"(evaluate target health: {health}); aliases are Route 53 specific"
            )
            continue
        if record.routing_policy != "Simple":
            extra = f" weight {record.weight}" if record.weight is not None else ""
            lines.append(
                f'; {record.routing_policy} routing, record ID "{record.set_identifier}"{extra}'
            )
        ttl = record.ttl if record.ttl is not None else DEFAULT_TTL
        for value in record.value_list:
            lines.append(f"{record.name.ljust(width)}{ttl}\tIN\t{record.type}\t{value}")
    lines.append("")
    return "\n".join(lines)
