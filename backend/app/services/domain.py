"""Domain-name and record-name normalization and validation.

Storage convention (see the schema): zone and record names are lowercase FQDNs with a
trailing dot. ``display_name`` strips the dot for table views.
"""

import re

from app.core.errors import BadRequestError

MAX_LABEL = 63
MAX_DOMAIN = 253
MAX_RECORD_NAME = 255

_DOMAIN_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
# Record labels may also contain underscores (e.g. _dmarc, _sip._tcp).
_RECORD_LABEL = re.compile(r"^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$")
# Hostnames used as values (CNAME/NS/MX/SRV targets): like record labels, dots optional.
_HOST_LABEL = _RECORD_LABEL


def strip_dot(name: str) -> str:
    return name[:-1] if name.endswith(".") else name


def ensure_dot(name: str) -> str:
    return name if name.endswith(".") else f"{name}."


def display_name(name: str) -> str:
    """``example.com.`` -> ``example.com`` (how the hosted zones table shows it)."""
    return strip_dot(name)


def _domain_error(message: str, field: str = "name") -> BadRequestError:
    return BadRequestError(message, fields={field: message}, code="InvalidDomainName")


def normalize_domain(raw: str, *, field: str = "name") -> str:
    """Validate a hosted zone name and return it normalized (lowercase, trailing dot).

    Rules: labels 1-63 chars of ``a-z 0-9 -`` not starting/ending with ``-``; whole name
    at most 253 chars; at least one dot (a TLD alone is not accepted).
    """
    name = strip_dot(raw.strip().lower())
    if not name:
        raise _domain_error("Domain name is required.", field)
    if len(name) > MAX_DOMAIN:
        raise _domain_error(f"Domain name must be at most {MAX_DOMAIN} characters.", field)
    labels = name.split(".")
    if len(labels) < 2:
        raise _domain_error(
            "Enter a fully qualified domain name with at least two labels, e.g. example.com.",
            field,
        )
    for label in labels:
        if not label:
            raise _domain_error("Domain name contains an empty label.", field)
        if len(label) > MAX_LABEL:
            raise _domain_error(f"Each label must be at most {MAX_LABEL} characters.", field)
        if label.startswith("-") or label.endswith("-"):
            raise _domain_error("Labels cannot start or end with a hyphen.", field)
        if not _DOMAIN_LABEL.match(label):
            raise _domain_error(
                "Domain name can only contain lowercase letters, digits, hyphens and dots.",
                field,
            )
    return ensure_dot(name)


def normalize_record_name(raw: str, zone_name: str, *, field: str = "name") -> str:
    """Validate a record name within ``zone_name`` and return the FQDN (trailing dot).

    Accepts ``""`` (apex), a relative label (``www``), or an absolute name with or
    without the trailing dot. The result must be the zone itself or end with
    ``.<zone>``. A wildcard ``*`` is only allowed as the whole first label.
    """
    zone = ensure_dot(zone_name.lower())
    zone_bare = strip_dot(zone)
    name = raw.strip().lower()

    if name in ("", "@", zone, zone_bare):
        return zone

    if name.endswith("."):
        fqdn = name
    elif name == zone_bare or name.endswith(f".{zone_bare}"):
        fqdn = f"{name}."
    else:
        fqdn = f"{name}.{zone}"

    if fqdn != zone and not fqdn.endswith(f".{zone}"):
        raise BadRequestError(
            f"Record name must be within the hosted zone {display_name(zone)}.",
            fields={field: f"Record name must end with .{display_name(zone)}"},
            code="InvalidRecordName",
        )
    if len(fqdn) > MAX_RECORD_NAME:
        raise BadRequestError(
            f"Record name must be at most {MAX_RECORD_NAME} characters.",
            fields={field: "Record name is too long."},
            code="InvalidRecordName",
        )

    relative = fqdn[: -len(zone) - 1] if fqdn != zone else ""
    labels = relative.split(".") if relative else []
    for index, label in enumerate(labels):
        if label == "*":
            if index != 0:
                raise BadRequestError(
                    "A wildcard (*) is only allowed as the leftmost label.",
                    fields={field: "A wildcard (*) is only allowed as the leftmost label."},
                    code="InvalidRecordName",
                )
            continue
        if not label or len(label) > MAX_LABEL or not _RECORD_LABEL.match(label):
            raise BadRequestError(
                "Record name contains an invalid label.",
                fields={
                    field: (
                        "Labels must be 1-63 characters of letters, digits, hyphens or "
                        "underscores and cannot start or end with a hyphen."
                    )
                },
                code="InvalidRecordName",
            )
    return fqdn


def is_valid_hostname(value: str) -> bool:
    """Loose hostname check for record values such as CNAME/NS/MX/SRV targets."""
    host = strip_dot(value.strip().lower())
    if not host or len(host) > MAX_DOMAIN:
        return False
    return all(len(label) <= MAX_LABEL and _HOST_LABEL.match(label) for label in host.split("."))


def normalize_hostname(value: str) -> str:
    """Lowercase; keep the trailing dot if present (as Route 53 stores what you typed)."""
    return value.strip().lower()
