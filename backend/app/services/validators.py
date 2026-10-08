"""Per-record-type value validation plus TTL, routing-policy and alias rules.

Every public function raises :class:`BadRequestError` with a ``fields`` entry so the
frontend can attach the message to the right input.
"""

from __future__ import annotations

import ipaddress
import re
from collections.abc import Callable, Sequence

from app.core.errors import BadRequestError
from app.services.domain import is_valid_hostname, normalize_hostname

RECORD_TYPES: tuple[str, ...] = (
    "A",
    "AAAA",
    "CNAME",
    "TXT",
    "MX",
    "NS",
    "PTR",
    "SRV",
    "CAA",
    "SOA",
)
USER_RECORD_TYPES: tuple[str, ...] = tuple(t for t in RECORD_TYPES if t != "SOA")
ROUTING_POLICIES: tuple[str, ...] = (
    "Simple",
    "Weighted",
    "Latency",
    "Failover",
    "Geolocation",
    "Multivalue",
)
ALIAS_TYPES: tuple[str, ...] = ("A", "AAAA", "CNAME")

DEFAULT_TTL = 300
MIN_TTL = 0
MAX_TTL = 2_147_483_647
MAX_VALUES = 100

TXT_MAX_STRING = 255
TXT_MAX_TOTAL = 4000
CAA_TAGS = ("issue", "issuewild", "iodef")
MAX_SET_IDENTIFIER = 128
MAX_WEIGHT = 255
MAX_COMMENT = 256

_UINT16 = (0, 65535)
_QUOTED = re.compile(r'"((?:[^"\\]|\\.)*)"')


def _error(
    message: str, field: str = "values", code: str = "InvalidRecordValue"
) -> BadRequestError:
    return BadRequestError(message, fields={field: message}, code=code)


def _int_in_range(token: str, lo: int, hi: int, what: str) -> int:
    try:
        number = int(token)
    except ValueError as exc:
        raise _error(f"{what} must be an integer between {lo} and {hi}.") from exc
    if not lo <= number <= hi:
        raise _error(f"{what} must be between {lo} and {hi}.")
    return number


def _hostname(token: str, what: str) -> str:
    if not is_valid_hostname(token):
        raise _error(f"{what} must be a valid hostname, e.g. mail.example.com.")
    return normalize_hostname(token)


# --- per-type validators -------------------------------------------------------------------


def _validate_a(value: str) -> str:
    try:
        return str(ipaddress.IPv4Address(value))
    except ipaddress.AddressValueError as exc:
        raise _error(f"'{value}' is not a valid IPv4 address.") from exc


def _validate_aaaa(value: str) -> str:
    try:
        return str(ipaddress.IPv6Address(value))
    except ipaddress.AddressValueError as exc:
        raise _error(f"'{value}' is not a valid IPv6 address.") from exc


def _validate_hostname_value(value: str) -> str:
    return _hostname(value, "Value")


def _validate_mx(value: str) -> str:
    parts = value.split()
    if len(parts) != 2:
        raise _error("MX value must be '<priority> <mail server>', e.g. 10 mail.example.com.")
    priority = _int_in_range(parts[0], *_UINT16, "MX priority")
    return f"{priority} {_hostname(parts[1], 'MX mail server')}"


def _validate_srv(value: str) -> str:
    parts = value.split()
    if len(parts) != 4:
        raise _error(
            "SRV value must be '<priority> <weight> <port> <target>', "
            "e.g. 10 5 5060 sip.example.com."
        )
    priority = _int_in_range(parts[0], *_UINT16, "SRV priority")
    weight = _int_in_range(parts[1], *_UINT16, "SRV weight")
    port = _int_in_range(parts[2], *_UINT16, "SRV port")
    return f"{priority} {weight} {port} {_hostname(parts[3], 'SRV target')}"


def _validate_caa(value: str) -> str:
    parts = value.split(maxsplit=2)
    if len(parts) != 3:
        raise _error(
            'CAA value must be \'<flags> <tag> "<value>"\', e.g. 0 issue "letsencrypt.org".'
        )
    flags = _int_in_range(parts[0], 0, 255, "CAA flags")
    tag = parts[1].lower()
    if tag not in CAA_TAGS:
        raise _error(f"CAA tag must be one of: {', '.join(CAA_TAGS)}.")
    quoted = parts[2].strip()
    if len(quoted) < 2 or not (quoted.startswith('"') and quoted.endswith('"')):
        raise _error("CAA value must be wrapped in double quotes.")
    return f"{flags} {tag} {quoted}"


def _validate_soa(value: str) -> str:
    parts = value.split()
    if len(parts) != 7:
        raise _error(
            "SOA value must have seven fields: primary name server, admin email, serial, "
            "refresh, retry, expire, minimum."
        )
    primary = _hostname(parts[0], "SOA primary name server")
    admin = _hostname(parts[1], "SOA admin email")
    numbers = [
        _int_in_range(token, 0, 4_294_967_295, name)
        for token, name in zip(
            parts[2:], ("Serial", "Refresh", "Retry", "Expire", "Minimum"), strict=True
        )
    ]
    return " ".join([primary, admin, *map(str, numbers)])


def _split_txt_strings(value: str) -> list[str] | None:
    """Return the quoted strings in ``value`` or ``None`` if it is not fully quoted."""
    stripped = value.strip()
    if not stripped.startswith('"'):
        return None
    strings: list[str] = []
    pos = 0
    while pos < len(stripped):
        match = _QUOTED.match(stripped, pos)
        if match is None:
            return None
        strings.append(match.group(1))
        pos = match.end()
        while pos < len(stripped) and stripped[pos] == " ":
            pos += 1
    return strings


def _chunk(text: str, size: int) -> list[str]:
    return [text[i : i + size] for i in range(0, len(text), size)] or [""]


def _validate_txt(value: str) -> str:
    strings = _split_txt_strings(value)
    if strings is None:
        if '"' in value:
            raise _error(
                "TXT value must be one or more double-quoted strings, "
                'e.g. "v=spf1 include:_spf.example.com ~all".'
            )
        # Unquoted input: quote it (splitting into 255-character strings) like the console.
        strings = _chunk(value.strip().replace("\\", "\\\\").replace('"', '\\"'), TXT_MAX_STRING)
    for string in strings:
        if len(string) > TXT_MAX_STRING:
            raise _error(
                f"Each quoted TXT string must be at most {TXT_MAX_STRING} characters; split "
                'longer text into several strings: "part one" "part two".'
            )
    return " ".join(f'"{s}"' for s in strings)


_VALUE_VALIDATORS: dict[str, Callable[[str], str]] = {
    "A": _validate_a,
    "AAAA": _validate_aaaa,
    "CNAME": _validate_hostname_value,
    "TXT": _validate_txt,
    "MX": _validate_mx,
    "NS": _validate_hostname_value,
    "PTR": _validate_hostname_value,
    "SRV": _validate_srv,
    "CAA": _validate_caa,
    "SOA": _validate_soa,
}

# Types that accept exactly one value.
_SINGLE_VALUE_TYPES = ("CNAME", "PTR", "SOA")


def validate_record_type(record_type: str) -> str:
    rtype = record_type.strip().upper()
    if rtype not in RECORD_TYPES:
        raise _error(
            f"Unsupported record type '{record_type}'.", field="type", code="InvalidRecordType"
        )
    return rtype


def validate_values(record_type: str, values: Sequence[str]) -> list[str]:
    """Validate and normalize the value list for ``record_type``."""
    rtype = validate_record_type(record_type)
    cleaned = [v.strip() for v in values if v is not None and v.strip()]
    if not cleaned:
        raise _error("Enter at least one value.")
    if len(cleaned) > MAX_VALUES:
        raise _error(f"A record can have at most {MAX_VALUES} values.")
    if rtype in _SINGLE_VALUE_TYPES and len(cleaned) != 1:
        raise _error(f"{rtype} records must have exactly one value.")
    normalized = [_VALUE_VALIDATORS[rtype](v) for v in cleaned]
    if rtype == "TXT":
        total = sum(len(v) for v in normalized)
        if total > TXT_MAX_TOTAL:
            raise _error(f"TXT values must total at most {TXT_MAX_TOTAL} characters.")
    if len(set(normalized)) != len(normalized):
        raise _error("Duplicate values are not allowed in the same record.")
    return normalized


def validate_ttl(ttl: int | None) -> int:
    if ttl is None:
        return DEFAULT_TTL
    if not isinstance(ttl, int) or isinstance(ttl, bool) or not MIN_TTL <= ttl <= MAX_TTL:
        raise _error(f"TTL must be an integer between {MIN_TTL} and {MAX_TTL}.", field="ttl")
    return ttl


def validate_routing(
    routing_policy: str | None, set_identifier: str | None, weight: int | None
) -> tuple[str, str | None, int | None]:
    """Return ``(policy, set_identifier, weight)`` normalized for storage."""
    policy = (routing_policy or "Simple").strip()
    policy = next((p for p in ROUTING_POLICIES if p.lower() == policy.lower()), None) or policy
    if policy not in ROUTING_POLICIES:
        raise _error(
            f"Routing policy must be one of: {', '.join(ROUTING_POLICIES)}.",
            field="routing_policy",
            code="InvalidRoutingPolicy",
        )
    identifier = (set_identifier or "").strip() or None

    if policy == "Simple":
        return policy, None, None

    if identifier is None:
        raise _error(
            f"Record ID (set identifier) is required for {policy} routing.",
            field="set_identifier",
            code="InvalidRoutingPolicy",
        )
    if len(identifier) > MAX_SET_IDENTIFIER:
        raise _error(
            f"Record ID must be at most {MAX_SET_IDENTIFIER} characters.",
            field="set_identifier",
            code="InvalidRoutingPolicy",
        )
    if policy == "Weighted":
        if weight is None:
            raise _error("Weight is required for Weighted routing.", field="weight")
        if not 0 <= weight <= MAX_WEIGHT:
            raise _error(f"Weight must be between 0 and {MAX_WEIGHT}.", field="weight")
        return policy, identifier, weight
    return policy, identifier, None


def validate_alias(
    record_type: str,
    is_alias: bool,
    alias_target: str | None,
    values: Sequence[str],
    ttl: int | None,
) -> tuple[list[str], int | None, str | None]:
    """Apply the alias rules and return ``(values, ttl, alias_target)`` for storage.

    Alias records are only supported for A, AAAA and CNAME; they route to an AWS target,
    have no TTL and no plain values. Non-alias records must have values.
    """
    rtype = validate_record_type(record_type)
    if is_alias:
        if rtype not in ALIAS_TYPES:
            raise _error(
                f"Alias is only supported for {', '.join(ALIAS_TYPES)} records.",
                field="is_alias",
                code="InvalidAlias",
            )
        target = (alias_target or "").strip()
        if not target or not is_valid_hostname(target):
            raise _error(
                "Choose a valid alias target, e.g. d111111abcdef8.cloudfront.net.",
                field="alias_target",
                code="InvalidAlias",
            )
        if any(v.strip() for v in values):
            raise _error(
                "Alias records cannot have values; remove them or turn alias off.",
                field="values",
                code="InvalidAlias",
            )
        return [], None, normalize_hostname(target)
    return validate_values(rtype, values), validate_ttl(ttl), None


def validate_comment(comment: str | None) -> str | None:
    if comment is None:
        return None
    text = comment.strip()
    if len(text) > MAX_COMMENT:
        raise _error(f"Comment must be at most {MAX_COMMENT} characters.", field="comment")
    return text or None
