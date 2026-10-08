import json

import pytest
from fastapi.testclient import TestClient

from app.services.bind_io import parse_zone_text
from tests.test_records import list_records
from tests.test_zones import add_record, create_zone

SAMPLE_ZONE = """\
$ORIGIN example.com.
$TTL 3600
@       IN  SOA   ns-1.awsdns-01.org. awsdns-hostmaster.amazon.com. (
                    1 7200 900 1209600 86400 )
@       IN  NS    ns-1.awsdns-01.org.
@       IN  NS    ns-2.awsdns-02.com.
@       IN  A     192.0.2.1
@       IN  A     192.0.2.2
www     300 IN  CNAME example.com.           ; web
mail    IN  A     203.0.113.10
@       IN  MX    10 mail.example.com.
@       IN  TXT   "v=spf1 include:_spf.example.com ~all"
_sip._tcp IN SRV 10 5 5060 sip.example.com.
@       IN  CAA   0 issue "letsencrypt.org"
sub     IN  NS    ns-9.awsdns-09.net.
ptr     IN  PTR   mail.example.com.
v6      IN  AAAA  2001:db8::1
"""


@pytest.fixture
def zone(auth_client: TestClient) -> dict:
    return create_zone(auth_client, "example.com")


def import_url(zone: dict) -> str:
    return f"/api/hostedzones/{zone['id']}/import"


# --- parser ---------------------------------------------------------------------------------


def test_parse_handles_directives_parentheses_comments_and_continuations() -> None:
    result = parse_zone_text(SAMPLE_ZONE, "example.com.")
    assert result.errors == []
    by_key = {(r.name, r.type): r for r in result.records}
    assert ("example.com.", "SOA") in by_key
    assert by_key[("www.example.com.", "CNAME")].ttl == 300
    assert by_key[("www.example.com.", "CNAME")].values == ["example.com."]
    assert by_key[("mail.example.com.", "A")].ttl == 3600  # from $TTL
    assert by_key[("example.com.", "TXT")].values == ['"v=spf1 include:_spf.example.com ~all"']
    assert by_key[("_sip._tcp.example.com.", "SRV")].values == ["10 5 5060 sip.example.com."]
    assert by_key[("example.com.", "CAA")].values == ['0 issue "letsencrypt.org"']


def test_parse_reports_line_numbers_and_precise_messages_for_bad_lines() -> None:
    text = (
        "www IN A 192.0.2.1\n"
        "bad IN FOO something\n"
        "mail IN A not-an-ip\n"
        "ok IN A 192.0.2.3\n"
        "empty 300 IN MX\n"
        "mx IN MX 10\n"
        "nothing\n"
    )
    result = parse_zone_text(text, "example.com.")
    assert [line for line, _ in result.errors] == [2, 3, 5, 6, 7]
    messages = dict(result.errors)
    assert messages[2] == "Unknown record type 'FOO'."
    assert messages[3] == "'not-an-ip' is not a valid IPv4 address."
    assert messages[5] == "MX record is missing a value."
    assert "MX value must be" in messages[6]
    assert messages[7] == "Record is missing a type and value."
    assert [r.name for r in result.records] == ["www.example.com.", "ok.example.com."]


def test_parse_relative_origin_and_unknown_directive() -> None:
    text = "$ORIGIN sub\nhost IN A 192.0.2.1\n$INCLUDE other.zone\n$GENERATE 1-2 x A 1.1.1.$\n"
    result = parse_zone_text(text, "example.com.")
    assert [r.name for r in result.records] == ["host.sub.example.com."]
    assert [line for line, _ in result.errors] == [3, 4]


def test_parse_missing_owner_on_first_line() -> None:
    result = parse_zone_text("   IN A 192.0.2.1\n", "example.com.")
    assert result.records == []
    assert result.errors[0][1] == "Record has no owner name."


def test_parse_keeps_semicolons_and_escaped_quotes_inside_txt() -> None:
    text = 'txt IN TXT "a;b" ; real comment\nesc IN TXT "say \\"hi\\"; ok"\n'
    result = parse_zone_text(text, "example.com.")
    assert result.errors == []
    values = {r.name: r.values for r in result.records}
    assert values["txt.example.com."] == ['"a;b"']
    assert values["esc.example.com."] == ['"say \\"hi\\"; ok"']


@pytest.mark.parametrize(
    ("text", "fragment"),
    [
        ("$ORIGIN\n", "$ORIGIN requires"),
        ("$ORIGIN a b\n", "$ORIGIN requires"),
        ("$TTL\n", "$TTL requires"),
        ("$TTL abc\n", "$TTL requires"),
        ("$TTL 1x\n", "$TTL requires"),
    ],
)
def test_parse_directive_errors(text: str, fragment: str) -> None:
    result = parse_zone_text(text, "example.com.")
    assert result.records == []
    assert len(result.errors) == 1
    assert fragment in result.errors[0][1]


def test_parse_unbalanced_parentheses_at_end_of_file() -> None:
    text = "@ IN SOA ns. host. (\n 1 2 3 4 5\n"
    result = parse_zone_text(text, "example.com.")
    assert [r.type for r in result.records] == ["SOA"]


def test_parse_ttl_units_and_class_omitted() -> None:
    text = "$TTL 1h\nwww A 192.0.2.1\n"
    result = parse_zone_text(text, "example.com.")
    assert result.errors == []
    assert result.records[0].ttl == 3600


# --- import endpoint ------------------------------------------------------------------------


def test_import_dry_run_previews_without_writing(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(import_url(zone), data={"text": SAMPLE_ZONE, "dry_run": "true"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["dry_run"] is True
    assert body["errors"] == []
    statuses = {(r["name"], r["type"]): r["status"] for r in body["records"]}
    assert statuses[("example.com.", "SOA")] == "skipped"
    assert statuses[("example.com.", "NS")] == "skipped"
    assert statuses[("sub.example.com.", "NS")] == "new"  # delegation NS is importable
    assert statuses[("example.com.", "A")] == "new"
    assert body["imported"] == 10
    assert body["skipped"] == 2
    # Two A lines at the apex were merged into one record with two values.
    apex_a = next(r for r in body["records"] if r["name"] == "example.com." and r["type"] == "A")
    assert apex_a["values"] == ["192.0.2.1", "192.0.2.2"]

    assert list_records(auth_client, zone)["total"] == 2


def test_import_commits_records_in_one_go(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(import_url(zone), data={"text": SAMPLE_ZONE})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["dry_run"] is False and body["imported"] == 10
    listing = list_records(auth_client, zone, page_size=100)
    assert listing["total"] == 12
    cname = next(r for r in listing["items"] if r["type"] == "CNAME")
    assert cname["name"] == "www.example.com." and cname["ttl"] == 300
    # Default NS values are untouched by the file's apex NS lines.
    ns = next(r for r in listing["items"] if r["is_default"] and r["type"] == "NS")
    assert ns["values"] == zone["name_servers"]


def test_import_via_file_upload(auth_client: TestClient, zone: dict) -> None:
    files = {"file": ("example.com.zone", SAMPLE_ZONE.encode(), "text/plain")}
    response = auth_client.post(import_url(zone), files=files)
    assert response.status_code == 200
    assert response.json()["imported"] == 10


def test_import_skips_existing_duplicates_and_reports_conflicts(
    auth_client: TestClient, zone: dict
) -> None:
    add_record(auth_client, zone["id"], name="www", type="A", values=["192.0.2.50"])
    add_record(auth_client, zone["id"], name="mail", type="A", values=["203.0.113.10"])

    text = "www IN CNAME example.com.\nmail IN A 203.0.113.10\nnew IN A 192.0.2.9\n"
    body = auth_client.post(import_url(zone), data={"text": text}).json()
    statuses = {r["name"]: (r["status"], r["reason"]) for r in body["records"]}
    assert statuses["www.example.com."][0] == "skipped"  # CNAME conflicts with existing A
    assert "CNAME" in statuses["www.example.com."][1]
    assert statuses["mail.example.com."][0] == "skipped"  # duplicate
    assert statuses["new.example.com."] == ("new", None)
    assert body["imported"] == 1 and body["skipped"] == 2


def test_import_reports_validation_errors_with_lines(auth_client: TestClient, zone: dict) -> None:
    text = "good IN A 192.0.2.1\nbad IN A 192.0.2.1 extra\n@ IN CNAME nope.example.net.\n"
    body = auth_client.post(import_url(zone), data={"text": text, "dry_run": "true"}).json()
    assert body["imported"] == 1
    lines = sorted(e["line"] for e in body["errors"])
    assert lines == [2, 3]
    apex_cname = next(r for r in body["records"] if r["type"] == "CNAME")
    assert apex_cname["status"] == "error" and "apex" in apex_cname["reason"]


def test_import_requires_file_or_text(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(import_url(zone), data={"text": "   "})
    assert response.status_code == 400
    assert "file" in response.json()["error"]["fields"]


def test_import_rejects_binary_file(auth_client: TestClient, zone: dict) -> None:
    files = {"file": ("x.zone", b"\xff\xfe\x00\x01", "application/octet-stream")}
    response = auth_client.post(import_url(zone), files=files)
    assert response.status_code == 400


def test_import_unknown_zone(auth_client: TestClient) -> None:
    assert auth_client.post("/api/hostedzones/Z404/import", data={"text": "x"}).status_code == 404


def test_import_rejects_oversized_text_and_too_many_records(
    auth_client: TestClient, zone: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import bind_io

    monkeypatch.setattr(bind_io, "MAX_IMPORT_BYTES", 50)
    too_big = auth_client.post(import_url(zone), data={"text": "x" * 51})
    assert too_big.status_code == 400
    assert "too large" in too_big.json()["error"]["message"].lower()

    files = {"file": ("x.zone", b"y" * 51, "text/plain")}
    assert auth_client.post(import_url(zone), files=files).status_code == 400

    monkeypatch.setattr(bind_io, "MAX_IMPORT_BYTES", 1_000_000)
    monkeypatch.setattr(bind_io, "MAX_IMPORT_RECORDS", 2)
    text = "\n".join(f"h{i} IN A 192.0.2.{i}" for i in range(1, 4))
    too_many = auth_client.post(import_url(zone), data={"text": text, "dry_run": "true"})
    assert too_many.status_code == 400
    assert "more than 2 records" in too_many.json()["error"]["message"]


def test_import_unsupported_type_is_reported_not_imported(
    auth_client: TestClient, zone: dict
) -> None:
    text = "h IN A 192.0.2.1\n_443._tcp IN TLSA 3 1 1 abcdef\n"
    body = auth_client.post(import_url(zone), data={"text": text, "dry_run": "true"}).json()
    tlsa = next(r for r in body["records"] if r["type"] == "TLSA")
    assert tlsa["status"] == "error" and "not supported" in tlsa["reason"]
    assert body["imported"] == 1
    assert any("TLSA" in e["message"] for e in body["errors"])


# --- export ---------------------------------------------------------------------------------


def test_export_json_has_download_header_and_full_payload(
    auth_client: TestClient, zone: dict
) -> None:
    add_record(auth_client, zone["id"], name="www")
    response = auth_client.get(f"/api/hostedzones/{zone['id']}/export", params={"format": "json"})
    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="example.com.json"'
    assert response.headers["content-type"].startswith("application/json")
    payload = json.loads(response.text)
    assert payload["hosted_zone"]["id"] == zone["id"]
    assert payload["hosted_zone"]["name_servers"] == zone["name_servers"]
    assert [r["type"] for r in payload["records"]] == ["NS", "SOA", "A"]
    assert "zone_id" not in payload["records"][0]


def test_export_bind_format(auth_client: TestClient, zone: dict) -> None:
    add_record(auth_client, zone["id"], name="www", values=["192.0.2.1", "192.0.2.2"])
    add_record(auth_client, zone["id"], name="", type="TXT", values=['"hello"'])
    add_record(
        auth_client,
        zone["id"],
        name="cdn",
        ttl=None,
        values=[],
        is_alias=True,
        alias_target="d1.cloudfront.net.",
    )
    add_record(
        auth_client,
        zone["id"],
        name="api",
        routing_policy="Weighted",
        set_identifier="blue",
        weight=7,
    )
    response = auth_client.get(f"/api/hostedzones/{zone['id']}/export", params={"format": "bind"})
    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="example.com.zone"'
    text = response.text
    assert "$ORIGIN example.com." in text
    assert "$TTL 300" in text
    assert text.count("IN\tA\t192.0.2.") == 3  # www x2 + api
    assert 'IN\tTXT\t"hello"' in text
    assert "; ALIAS cdn.example.com. A -> d1.cloudfront.net." in text
    assert '; Weighted routing, record ID "blue" weight 7' in text
    assert "172800\tIN\tNS\t" in text


def test_export_default_format_is_json(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.get(f"/api/hostedzones/{zone['id']}/export")
    assert response.headers["content-disposition"].endswith('example.com.json"')
    assert (
        auth_client.get(
            f"/api/hostedzones/{zone['id']}/export", params={"format": "xml"}
        ).status_code
        == 422
    )


# --- round trip -----------------------------------------------------------------------------


def test_bind_export_import_round_trip(auth_client: TestClient, zone: dict) -> None:
    auth_client.post(
        f"/api/hostedzones/{zone['id']}/records",
        json=[
            {"name": "", "type": "A", "ttl": 60, "values": ["192.0.2.1", "192.0.2.2"]},
            {"name": "v6", "type": "AAAA", "values": ["2001:db8::1"]},
            {"name": "www", "type": "CNAME", "ttl": 120, "values": ["example.com."]},
            {"name": "", "type": "TXT", "values": ['"v=spf1 -all"', '"a" "b"']},
            {"name": "", "type": "MX", "values": ["10 mail.example.com.", "20 mail2.example.com."]},
            {"name": "sub", "type": "NS", "values": ["ns-9.awsdns-09.net."]},
            {"name": "ptr", "type": "PTR", "values": ["mail.example.com."]},
            {"name": "_sip._tcp", "type": "SRV", "values": ["10 5 5060 sip.example.com."]},
            {
                "name": "",
                "type": "CAA",
                "values": ['0 issue "letsencrypt.org"', '0 iodef "mailto:a@example.com"'],
            },
            {"name": "*.wild", "type": "A", "values": ["192.0.2.7"]},
        ],
    ).raise_for_status()
    original = list_records(auth_client, zone, page_size=100)["items"]
    exported = auth_client.get(
        f"/api/hostedzones/{zone['id']}/export", params={"format": "bind"}
    ).text

    target = create_zone(
        auth_client, "example.com", type="private", vpc_id="v", vpc_region="us-east-1"
    )
    summary = auth_client.post(import_url(target), data={"text": exported}).json()
    assert summary["errors"] == []
    assert summary["imported"] == 10
    assert summary["skipped"] == 2  # SOA + apex NS

    imported = list_records(auth_client, target, page_size=100)["items"]

    def signature(records: list[dict]) -> set[tuple]:
        return {
            (r["name"], r["type"], r["ttl"], tuple(r["values"]))
            for r in records
            if not r["is_default"]
        }

    assert signature(imported) == signature(original)
