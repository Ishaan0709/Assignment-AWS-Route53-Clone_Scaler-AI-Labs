"""Unit tests for every rule in guide section 5.4 (plus domain-name rules from 5.3)."""

import pytest

from app.core.errors import BadRequestError
from app.services import validators
from app.services.domain import (
    display_name,
    is_valid_hostname,
    normalize_domain,
    normalize_record_name,
)

ZONE = "example.com."


def _fields(exc_info: pytest.ExceptionInfo[BadRequestError]) -> dict[str, str]:
    return exc_info.value.fields


# --- domain names ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("example.com", "example.com."),
        ("Example.COM.", "example.com."),
        ("  sub.example.co.uk ", "sub.example.co.uk."),
        ("xn--bcher-kva.example", "xn--bcher-kva.example."),
        ("a" * 63 + ".com", "a" * 63 + ".com."),
    ],
)
def test_normalize_domain_valid(raw: str, expected: str) -> None:
    assert normalize_domain(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "localhost",  # no dot
        "com.",  # single label
        "-bad.com",
        "bad-.com",
        "bad..com",
        "a" * 64 + ".com",  # label too long
        ("a" * 63 + ".") * 4 + "com",  # total > 253
        "under_score.com",
        "white space.com",
        "ünicode.com",
    ],
)
def test_normalize_domain_invalid(raw: str) -> None:
    with pytest.raises(BadRequestError) as exc_info:
        normalize_domain(raw)
    assert "name" in _fields(exc_info)
    assert exc_info.value.code == "InvalidDomainName"


def test_display_name_strips_trailing_dot() -> None:
    assert display_name("example.com.") == "example.com"
    assert display_name("example.com") == "example.com"


# --- record names ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", ZONE),
        ("@", ZONE),
        ("example.com", ZONE),
        ("example.com.", ZONE),
        ("www", "www.example.com."),
        ("WWW", "www.example.com."),
        ("www.example.com", "www.example.com."),
        ("www.example.com.", "www.example.com."),
        ("other.com", "other.com.example.com."),  # no trailing dot => relative label
        ("_dmarc", "_dmarc.example.com."),
        ("_sip._tcp", "_sip._tcp.example.com."),
        ("*", "*.example.com."),
        ("*.staging", "*.staging.example.com."),
        ("a.b.c", "a.b.c.example.com."),
    ],
)
def test_normalize_record_name_valid(raw: str, expected: str) -> None:
    assert normalize_record_name(raw, ZONE) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "www.other.com.",  # outside the zone
        "notexample.com.",  # suffix trick
        "foo.*",  # wildcard not leftmost
        "a.*.b",
        "-bad",
        "bad-",
        "sp ace",
        "a" * 64,
        "x." * 130 + "y",  # too long
    ],
)
def test_normalize_record_name_invalid(raw: str) -> None:
    with pytest.raises(BadRequestError) as exc_info:
        normalize_record_name(raw, ZONE)
    assert exc_info.value.code == "InvalidRecordName"
    assert "name" in _fields(exc_info)


def test_record_name_error_field_can_be_prefixed() -> None:
    with pytest.raises(BadRequestError) as exc_info:
        normalize_record_name("bad..name", ZONE, field="records.1.name")
    assert "records.1.name" in _fields(exc_info)


# --- hostnames ------------------------------------------------------------------------------


@pytest.mark.parametrize("value", ["mail.example.com.", "mail.example.com", "a", "_tcp.example."])
def test_hostname_valid(value: str) -> None:
    assert is_valid_hostname(value)


@pytest.mark.parametrize("value", ["", ".", "-a.com", "a-.com", "a..b", "a b", "a" * 64 + ".com"])
def test_hostname_invalid(value: str) -> None:
    assert not is_valid_hostname(value)


# --- per-type values -----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("rtype", "values", "expected"),
    [
        ("A", ["192.0.2.1"], ["192.0.2.1"]),
        ("A", ["192.0.2.1", " 198.51.100.7 "], ["192.0.2.1", "198.51.100.7"]),
        ("AAAA", ["2001:db8::1"], ["2001:db8::1"]),
        ("AAAA", ["2001:0DB8:0000:0000:0000:0000:0000:0001"], ["2001:db8::1"]),
        ("CNAME", ["Target.Example.com."], ["target.example.com."]),
        ("TXT", ['"v=spf1 -all"'], ['"v=spf1 -all"']),
        ("TXT", ['"part one" "part two"'], ['"part one" "part two"']),
        ("TXT", ["v=spf1 -all"], ['"v=spf1 -all"']),  # auto-quoted
        ("MX", ["10 mail.example.com."], ["10 mail.example.com."]),
        ("MX", ["65535 mx.example.com"], ["65535 mx.example.com"]),
        ("NS", ["ns1.example.com.", "ns2.example.com."], ["ns1.example.com.", "ns2.example.com."]),
        ("PTR", ["host.example.com."], ["host.example.com."]),
        ("SRV", ["10 5 5060 sip.example.com."], ["10 5 5060 sip.example.com."]),
        ("CAA", ['0 issue "letsencrypt.org"'], ['0 issue "letsencrypt.org"']),
        ("CAA", ['128 ISSUEWILD ";"'], ['128 issuewild ";"']),
        ("CAA", ['0 iodef "mailto:sec@example.com"'], ['0 iodef "mailto:sec@example.com"']),
        (
            "SOA",
            ["ns-1.awsdns-01.org. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400"],
            ["ns-1.awsdns-01.org. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400"],
        ),
    ],
)
def test_values_valid(rtype: str, values: list[str], expected: list[str]) -> None:
    assert validators.validate_values(rtype, values) == expected


@pytest.mark.parametrize(
    ("rtype", "values", "fragment"),
    [
        ("A", ["256.0.0.1"], "IPv4"),
        ("A", ["2001:db8::1"], "IPv4"),
        ("A", ["not-an-ip"], "IPv4"),
        ("AAAA", ["192.0.2.1"], "IPv6"),
        ("AAAA", ["2001:db8::zz"], "IPv6"),
        ("CNAME", ["a.example.com.", "b.example.com."], "exactly one"),
        ("CNAME", ["bad host"], "hostname"),
        ("TXT", ['"' + "x" * 256 + '"'], "255"),
        ("TXT", ['"unterminated'], "double-quoted"),
        ("TXT", ['"ok" trailing'], "double-quoted"),
        ("TXT", ['"' + "x" * 255 + '" '] * 16 + ['"' + "y" * 255 + '"'], "4000"),
        ("MX", ["mail.example.com."], "priority"),
        ("MX", ["65536 mail.example.com."], "between 0 and 65535"),
        ("MX", ["-1 mail.example.com."], "between 0 and 65535"),
        ("MX", ["ten mail.example.com."], "integer"),
        ("MX", ["10 bad host"], "priority"),
        ("NS", ["not valid!"], "hostname"),
        ("PTR", ["a.example.com.", "b.example.com."], "exactly one"),
        ("PTR", ["bad!"], "hostname"),
        ("SRV", ["10 5 sip.example.com."], "SRV value"),
        ("SRV", ["10 5 70000 sip.example.com."], "between 0 and 65535"),
        ("SRV", ["x 5 5060 sip.example.com."], "integer"),
        ("CAA", ['issue "letsencrypt.org"'], "CAA value"),
        ("CAA", ['256 issue "letsencrypt.org"'], "between 0 and 255"),
        ("CAA", ['0 bogus "letsencrypt.org"'], "tag"),
        ("CAA", ["0 issue letsencrypt.org"], "double quotes"),
        ("SOA", ["ns.example.com. hostmaster.example.com. 1 7200 900"], "seven fields"),
        ("SOA", ["ns.example.com. hostmaster.example.com. x 7200 900 1209600 86400"], "integer"),
        ("A", [], "at least one"),
        ("A", ["", "  "], "at least one"),
        ("A", ["192.0.2.1", "192.0.2.1"], "Duplicate"),
        ("A", [f"192.0.2.{i}" for i in range(101)], "at most 100"),
    ],
)
def test_values_invalid(rtype: str, values: list[str], fragment: str) -> None:
    with pytest.raises(BadRequestError) as exc_info:
        validators.validate_values(rtype, values)
    assert fragment.lower() in exc_info.value.message.lower()
    assert "values" in _fields(exc_info)


def test_txt_unquoted_long_value_is_chunked_into_255_char_strings() -> None:
    raw = "a" * 600
    (value,) = validators.validate_values("TXT", [raw])
    assert value == f'"{"a" * 255}" "{"a" * 255}" "{"a" * 90}"'


def test_unknown_record_type() -> None:
    with pytest.raises(BadRequestError) as exc_info:
        validators.validate_values("FOO", ["x"])
    assert exc_info.value.code == "InvalidRecordType"
    assert "type" in _fields(exc_info)


# --- TTL ------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("ttl", "expected"), [(None, 300), (0, 0), (60, 60), (2147483647, 2147483647)]
)
def test_ttl_valid(ttl: int | None, expected: int) -> None:
    assert validators.validate_ttl(ttl) == expected


@pytest.mark.parametrize("ttl", [-1, 2147483648, True])
def test_ttl_invalid(ttl: object) -> None:
    with pytest.raises(BadRequestError) as exc_info:
        validators.validate_ttl(ttl)  # type: ignore[arg-type]
    assert "ttl" in _fields(exc_info)


# --- routing policy -------------------------------------------------------------------------


def test_routing_simple_drops_identifier_and_weight() -> None:
    assert validators.validate_routing("Simple", "ignored", 5) == ("Simple", None, None)
    assert validators.validate_routing(None, None, None) == ("Simple", None, None)
    assert validators.validate_routing("simple", None, None) == ("Simple", None, None)


def test_routing_weighted_valid() -> None:
    assert validators.validate_routing("Weighted", " blue ", 0) == ("Weighted", "blue", 0)
    assert validators.validate_routing("Weighted", "green", 255) == ("Weighted", "green", 255)


@pytest.mark.parametrize(
    ("policy", "identifier", "weight", "field"),
    [
        ("Weighted", None, 10, "set_identifier"),
        ("Weighted", "", 10, "set_identifier"),
        ("Weighted", "x" * 129, 10, "set_identifier"),
        ("Weighted", "blue", None, "weight"),
        ("Weighted", "blue", 256, "weight"),
        ("Weighted", "blue", -1, "weight"),
        ("Latency", None, None, "set_identifier"),
        ("Failover", None, None, "set_identifier"),
        ("Bogus", "x", None, "routing_policy"),
    ],
)
def test_routing_invalid(
    policy: str, identifier: str | None, weight: int | None, field: str
) -> None:
    with pytest.raises(BadRequestError) as exc_info:
        validators.validate_routing(policy, identifier, weight)
    assert field in _fields(exc_info)


def test_routing_other_policies_keep_identifier_but_no_weight() -> None:
    assert validators.validate_routing("Latency", "eu", 5) == ("Latency", "eu", None)
    assert validators.validate_routing("Multivalue", "m1", None) == ("Multivalue", "m1", None)


# --- alias ----------------------------------------------------------------------------------


@pytest.mark.parametrize("rtype", ["A", "AAAA", "CNAME"])
def test_alias_valid_types(rtype: str) -> None:
    values, ttl, target = validators.validate_alias(rtype, True, " D111.CloudFront.net. ", [], 300)
    assert values == [] and ttl is None and target == "d111.cloudfront.net."


@pytest.mark.parametrize("rtype", ["TXT", "MX", "NS", "PTR", "SRV", "CAA"])
def test_alias_rejected_for_other_types(rtype: str) -> None:
    with pytest.raises(BadRequestError) as exc_info:
        validators.validate_alias(rtype, True, "d111.cloudfront.net.", [], None)
    assert "is_alias" in _fields(exc_info)


def test_alias_requires_target_and_forbids_values() -> None:
    with pytest.raises(BadRequestError) as exc_info:
        validators.validate_alias("A", True, "", [], None)
    assert "alias_target" in _fields(exc_info)
    with pytest.raises(BadRequestError) as exc_info:
        validators.validate_alias("A", True, "d111.cloudfront.net.", ["192.0.2.1"], None)
    assert "values" in _fields(exc_info)


def test_non_alias_validates_values_and_ttl() -> None:
    assert validators.validate_alias("A", False, None, ["192.0.2.1"], None) == (
        ["192.0.2.1"],
        300,
        None,
    )
    with pytest.raises(BadRequestError):
        validators.validate_alias("A", False, None, [], 300)


# --- comment --------------------------------------------------------------------------------


def test_comment_normalization() -> None:
    assert validators.validate_comment(None) is None
    assert validators.validate_comment("   ") is None
    assert validators.validate_comment(" hi ") == "hi"
    with pytest.raises(BadRequestError) as exc_info:
        validators.validate_comment("x" * 257)
    assert "comment" in _fields(exc_info)
