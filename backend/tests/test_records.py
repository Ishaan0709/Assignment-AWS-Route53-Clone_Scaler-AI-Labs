import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DnsRecord, RecordValue
from tests.test_zones import add_record, create_zone


@pytest.fixture
def zone(auth_client: TestClient) -> dict:
    return create_zone(auth_client, "example.com")


def records_url(zone: dict) -> str:
    return f"/api/hostedzones/{zone['id']}/records"


def list_records(client: TestClient, zone: dict, **params: object) -> dict:
    response = client.get(records_url(zone), params=params)
    assert response.status_code == 200, response.text
    return response.json()


def defaults(client: TestClient, zone: dict) -> dict[str, dict]:
    return {r["type"]: r for r in list_records(client, zone)["items"] if r["is_default"]}


# --- create: every type ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("name", "rtype", "values"),
    [
        ("", "A", ["192.0.2.1", "192.0.2.2"]),
        ("ipv6", "AAAA", ["2001:db8::1"]),
        ("blog", "CNAME", ["example.github.io."]),
        ("", "TXT", ['"v=spf1 -all"', '"verification=abc"']),
        ("", "MX", ["10 mail.example.com.", "20 mail2.example.com."]),
        ("sub", "NS", ["ns-1.awsdns-01.com.", "ns-2.awsdns-02.net."]),
        ("ptr", "PTR", ["host.example.com."]),
        ("_sip._tcp", "SRV", ["10 5 5060 sip.example.com."]),
        ("", "CAA", ['0 issue "letsencrypt.org"']),
    ],
)
def test_create_each_record_type_and_read_back(
    auth_client: TestClient, zone: dict, db: Session, name: str, rtype: str, values: list[str]
) -> None:
    response = auth_client.post(
        records_url(zone), json={"name": name, "type": rtype, "ttl": 600, "values": values}
    )
    assert response.status_code == 201, response.text
    (created,) = response.json()
    expected_name = "example.com." if name == "" else f"{name}.example.com."
    assert created["name"] == expected_name
    assert created["type"] == rtype
    assert created["ttl"] == 600
    assert created["values"] == values
    assert created["routing_policy"] == "Simple"
    assert created["is_default"] is False

    fetched = auth_client.get(f"{records_url(zone)}/{created['id']}").json()
    assert fetched == created

    stored = db.scalars(
        select(RecordValue)
        .where(RecordValue.record_id == created["id"])
        .order_by(RecordValue.position)
    ).all()
    assert [v.value for v in stored] == values


def test_create_uses_default_ttl_300(auth_client: TestClient, zone: dict) -> None:
    created = add_record(auth_client, zone["id"], ttl=None)
    assert created["ttl"] == 300


def test_create_invalid_value_returns_400_with_field(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(
        records_url(zone), json={"name": "www", "type": "A", "values": ["999.1.1.1"]}
    )
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "InvalidRecordValue"
    assert "values" in error["fields"]


def test_create_name_outside_zone_returns_400(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(
        records_url(zone), json={"name": "www.other.com.", "type": "A", "values": ["192.0.2.1"]}
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "InvalidRecordName"


def test_create_soa_manually_is_rejected(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(
        records_url(zone),
        json={"name": "", "type": "SOA", "values": ["ns. host. 1 2 3 4 5"]},
    )
    assert response.status_code == 400
    assert "type" in response.json()["error"]["fields"]


def test_create_unknown_type_returns_422(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(
        records_url(zone), json={"name": "x", "type": "FOO", "values": ["x"]}
    )
    assert response.status_code == 422


def test_create_in_unknown_zone_returns_404(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/api/hostedzones/Z404/records", json={"name": "x", "type": "A", "values": ["192.0.2.1"]}
    )
    assert response.status_code == 404


# --- create: batch ("Add another record") --------------------------------------------------


def test_create_multiple_records_atomically(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(
        records_url(zone),
        json=[
            {"name": "mail", "type": "A", "values": ["203.0.113.10"]},
            {"name": "", "type": "MX", "values": ["10 mail.example.com."]},
        ],
    )
    assert response.status_code == 201
    assert [r["type"] for r in response.json()] == ["A", "MX"]
    assert list_records(auth_client, zone)["total"] == 4


def test_batch_with_one_invalid_record_creates_nothing_and_prefixes_field(
    auth_client: TestClient, zone: dict
) -> None:
    response = auth_client.post(
        records_url(zone),
        json=[
            {"name": "ok", "type": "A", "values": ["192.0.2.1"]},
            {"name": "bad", "type": "A", "values": ["nope"]},
        ],
    )
    assert response.status_code == 400
    assert "records.1.values" in response.json()["error"]["fields"]
    assert list_records(auth_client, zone)["total"] == 2


def test_batch_detects_conflicts_inside_the_batch(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(
        records_url(zone),
        json=[
            {"name": "www", "type": "A", "values": ["192.0.2.1"]},
            {"name": "www", "type": "CNAME", "values": ["other.example.com."]},
        ],
    )
    assert response.status_code == 409
    assert "records.1.name" in response.json()["error"]["fields"]


def test_empty_batch_is_rejected(auth_client: TestClient, zone: dict) -> None:
    assert auth_client.post(records_url(zone), json=[]).status_code == 400


# --- CNAME rules ----------------------------------------------------------------------------


def test_cname_at_apex_is_rejected(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(
        records_url(zone), json={"name": "", "type": "CNAME", "values": ["x.example.net."]}
    )
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "InvalidChangeBatch"
    assert "apex" in error["message"]


def test_cname_cannot_coexist_with_other_type_at_same_name(
    auth_client: TestClient, zone: dict
) -> None:
    add_record(auth_client, zone["id"], name="www", type="A")
    response = auth_client.post(
        records_url(zone), json={"name": "www", "type": "CNAME", "values": ["x.example.net."]}
    )
    assert response.status_code == 409
    assert "CNAME" in response.json()["error"]["message"]


def test_other_type_cannot_be_added_where_cname_exists(auth_client: TestClient, zone: dict) -> None:
    add_record(auth_client, zone["id"], name="alias", type="CNAME", values=["x.example.net."])
    for rtype, values in [("A", ["192.0.2.1"]), ("TXT", ['"x"']), ("MX", ["10 m.example.com."])]:
        response = auth_client.post(
            records_url(zone), json={"name": "alias", "type": rtype, "values": values}
        )
        assert response.status_code == 409, rtype


def test_duplicate_cname_is_rejected(auth_client: TestClient, zone: dict) -> None:
    add_record(auth_client, zone["id"], name="alias", type="CNAME", values=["x.example.net."])
    response = auth_client.post(
        records_url(zone), json={"name": "alias", "type": "CNAME", "values": ["y.example.net."]}
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "RecordAlreadyExists"


# --- uniqueness and routing -----------------------------------------------------------------


def test_duplicate_simple_record_returns_409(auth_client: TestClient, zone: dict) -> None:
    add_record(auth_client, zone["id"], name="www", type="A")
    response = auth_client.post(
        records_url(zone), json={"name": "WWW", "type": "A", "values": ["192.0.2.9"]}
    )
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "RecordAlreadyExists"
    assert "name" in error["fields"]


def test_weighted_pair_and_duplicate_identifier(auth_client: TestClient, zone: dict) -> None:
    blue = add_record(
        auth_client,
        zone["id"],
        name="api",
        routing_policy="Weighted",
        set_identifier="blue",
        weight=70,
    )
    green = add_record(
        auth_client,
        zone["id"],
        name="api",
        values=["192.0.2.2"],
        routing_policy="Weighted",
        set_identifier="green",
        weight=30,
    )
    assert blue["weight"] == 70 and green["set_identifier"] == "green"

    duplicate = auth_client.post(
        records_url(zone),
        json={
            "name": "api",
            "type": "A",
            "values": ["192.0.2.3"],
            "routing_policy": "Weighted",
            "set_identifier": "blue",
            "weight": 1,
        },
    )
    assert duplicate.status_code == 409
    assert "set_identifier" in duplicate.json()["error"]["fields"]


def test_weighted_requires_identifier_and_weight(auth_client: TestClient, zone: dict) -> None:
    missing_id = auth_client.post(
        records_url(zone),
        json={"name": "api", "type": "A", "values": ["192.0.2.1"], "routing_policy": "Weighted"},
    )
    assert missing_id.status_code == 400
    assert "set_identifier" in missing_id.json()["error"]["fields"]

    bad_weight = auth_client.post(
        records_url(zone),
        json={
            "name": "api",
            "type": "A",
            "values": ["192.0.2.1"],
            "routing_policy": "Weighted",
            "set_identifier": "x",
            "weight": 300,
        },
    )
    assert bad_weight.status_code == 400
    assert "weight" in bad_weight.json()["error"]["fields"]


def test_mixing_simple_and_weighted_for_same_name_type_is_rejected(
    auth_client: TestClient, zone: dict
) -> None:
    add_record(auth_client, zone["id"], name="api")
    response = auth_client.post(
        records_url(zone),
        json={
            "name": "api",
            "type": "A",
            "values": ["192.0.2.2"],
            "routing_policy": "Weighted",
            "set_identifier": "x",
            "weight": 1,
        },
    )
    assert response.status_code == 409
    assert "routing_policy" in response.json()["error"]["fields"]


# --- alias ----------------------------------------------------------------------------------


def test_alias_record_has_no_ttl_or_values(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(
        records_url(zone),
        json={
            "name": "cdn",
            "type": "A",
            "ttl": 300,
            "is_alias": True,
            "alias_target": "d111111abcdef8.cloudfront.net.",
            "evaluate_target_health": True,
        },
    )
    assert response.status_code == 201, response.text
    (alias,) = response.json()
    assert alias["is_alias"] is True
    assert alias["ttl"] is None
    assert alias["values"] == []
    assert alias["alias_target"] == "d111111abcdef8.cloudfront.net."
    assert alias["evaluate_target_health"] is True


def test_alias_not_allowed_for_txt(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(
        records_url(zone),
        json={"name": "t", "type": "TXT", "is_alias": True, "alias_target": "x.example.net."},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "InvalidAlias"


# --- list: ordering, filters, pagination ----------------------------------------------------


def test_default_ordering_puts_apex_ns_then_soa_first(auth_client: TestClient, zone: dict) -> None:
    auth_client.post(
        records_url(zone),
        json=[
            {"name": "zzz", "type": "A", "values": ["192.0.2.1"]},
            {"name": "aaa", "type": "TXT", "values": ['"x"']},
            {"name": "aaa", "type": "A", "values": ["192.0.2.2"]},
            {"name": "", "type": "A", "values": ["192.0.2.3"]},
        ],
    )
    items = list_records(auth_client, zone)["items"]
    assert [(r["name"], r["type"]) for r in items] == [
        ("example.com.", "NS"),
        ("example.com.", "SOA"),
        ("aaa.example.com.", "A"),
        ("aaa.example.com.", "TXT"),
        ("example.com.", "A"),
        ("zzz.example.com.", "A"),
    ]


def test_list_filters(auth_client: TestClient, zone: dict) -> None:
    add_record(auth_client, zone["id"], name="www", type="A", values=["192.0.2.1"])
    add_record(auth_client, zone["id"], name="mail", type="A", values=["203.0.113.5"])
    add_record(auth_client, zone["id"], name="", type="TXT", values=['"hello world"'])
    add_record(
        auth_client,
        zone["id"],
        name="cdn",
        type="A",
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
        weight=1,
    )

    def names(**params: object) -> list[str]:
        return [r["name"] for r in list_records(auth_client, zone, **params)["items"]]

    assert names(type="TXT") == ["example.com."]
    assert names(q="203.0.113") == ["mail.example.com."]  # matches a value
    assert names(q="hello") == ["example.com."]
    assert names(q="cloudfront") == ["cdn.example.com."]  # matches alias target
    assert names(q="blue") == ["api.example.com."]  # matches record ID
    assert names(alias="true") == ["cdn.example.com."]
    assert names(routing_policy="Weighted") == ["api.example.com."]
    assert names(name="mail") == ["mail.example.com."]
    assert set(names(type="A", alias="false")) == {
        "www.example.com.",
        "mail.example.com.",
        "api.example.com.",
    }


def test_list_pagination_and_sort(auth_client: TestClient, zone: dict) -> None:
    auth_client.post(
        records_url(zone),
        json=[
            {"name": f"h{i}", "type": "A", "ttl": 100 * i, "values": [f"192.0.2.{i}"]}
            for i in range(1, 6)
        ],
    )
    page = list_records(auth_client, zone, page=2, page_size=3)
    assert page["total"] == 7 and len(page["items"]) == 3

    by_ttl = list_records(auth_client, zone, sort="ttl", order="desc")["items"]
    assert by_ttl[0]["ttl"] == 172800  # NS

    assert auth_client.get(records_url(zone), params={"sort": "nope"}).status_code == 400
    assert auth_client.get(records_url(zone), params={"type": "NOPE"}).status_code == 422


# --- update ---------------------------------------------------------------------------------


def test_update_record_replaces_everything(
    auth_client: TestClient, zone: dict, db: Session
) -> None:
    record = add_record(auth_client, zone["id"], name="www", values=["192.0.2.1"])
    response = auth_client.put(
        f"{records_url(zone)}/{record['id']}",
        json={
            "name": "web",
            "type": "AAAA",
            "ttl": 60,
            "values": ["2001:db8::1", "2001:db8::2"],
            "comment": "moved",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "web.example.com."
    assert body["type"] == "AAAA"
    assert body["ttl"] == 60
    assert body["values"] == ["2001:db8::1", "2001:db8::2"]
    assert body["comment"] == "moved"
    # Old values are gone (no orphans).
    assert db.scalar(select(RecordValue).where(RecordValue.value == "192.0.2.1")) is None


def test_update_record_conflict_with_other_record(auth_client: TestClient, zone: dict) -> None:
    add_record(auth_client, zone["id"], name="a")
    other = add_record(auth_client, zone["id"], name="b")
    response = auth_client.put(
        f"{records_url(zone)}/{other['id']}",
        json={"name": "a", "type": "A", "values": ["192.0.2.5"]},
    )
    assert response.status_code == 409


def test_update_record_to_its_own_name_is_fine(auth_client: TestClient, zone: dict) -> None:
    record = add_record(auth_client, zone["id"], name="a")
    response = auth_client.put(
        f"{records_url(zone)}/{record['id']}",
        json={"name": "a", "type": "A", "values": ["192.0.2.5"]},
    )
    assert response.status_code == 200


def test_update_default_ns_only_changes_ttl_and_values(auth_client: TestClient, zone: dict) -> None:
    ns = defaults(auth_client, zone)["NS"]
    response = auth_client.put(
        f"{records_url(zone)}/{ns['id']}",
        json={
            "name": "renamed",
            "type": "A",
            "ttl": 3600,
            "values": ["ns-1.example.net.", "ns-2.example.net."],
            "routing_policy": "Weighted",
            "set_identifier": "x",
            "weight": 1,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "example.com."
    assert body["type"] == "NS"
    assert body["ttl"] == 3600
    assert body["values"] == ["ns-1.example.net.", "ns-2.example.net."]
    assert body["routing_policy"] == "Simple"
    assert body["is_default"] is True


def test_update_default_soa_validates_seven_fields(auth_client: TestClient, zone: dict) -> None:
    soa = defaults(auth_client, zone)["SOA"]
    ok = auth_client.put(
        f"{records_url(zone)}/{soa['id']}",
        json={
            "type": "SOA",
            "ttl": 900,
            "values": ["ns-1.awsdns-01.org. hostmaster.example.com. 2 7200 900 1209600 300"],
        },
    )
    assert ok.status_code == 200
    bad = auth_client.put(
        f"{records_url(zone)}/{soa['id']}", json={"type": "SOA", "ttl": 900, "values": ["short"]}
    )
    assert bad.status_code == 400


def test_update_unknown_record_returns_404(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.put(
        f"{records_url(zone)}/999999", json={"name": "a", "type": "A", "values": ["192.0.2.1"]}
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NoSuchRecord"


# --- delete ---------------------------------------------------------------------------------


def test_delete_record_and_values(auth_client: TestClient, zone: dict, db: Session) -> None:
    record = add_record(auth_client, zone["id"])
    assert auth_client.delete(f"{records_url(zone)}/{record['id']}").status_code == 204
    assert db.get(DnsRecord, record["id"]) is None
    assert db.scalars(select(RecordValue).where(RecordValue.record_id == record["id"])).all() == []
    assert auth_client.delete(f"{records_url(zone)}/{record['id']}").status_code == 404


@pytest.mark.parametrize("rtype", ["NS", "SOA"])
def test_default_records_cannot_be_deleted(auth_client: TestClient, zone: dict, rtype: str) -> None:
    record = defaults(auth_client, zone)[rtype]
    response = auth_client.delete(f"{records_url(zone)}/{record['id']}")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "InvalidChangeBatch"
    assert list_records(auth_client, zone)["total"] == 2


def test_record_from_other_zone_is_not_visible(auth_client: TestClient, zone: dict) -> None:
    other = create_zone(auth_client, "other.com")
    foreign = add_record(auth_client, other["id"])
    assert auth_client.get(f"{records_url(zone)}/{foreign['id']}").status_code == 404
    assert auth_client.delete(f"{records_url(zone)}/{foreign['id']}").status_code == 404


# --- bulk delete ----------------------------------------------------------------------------


def test_bulk_delete_reports_per_item_results(auth_client: TestClient, zone: dict) -> None:
    a = add_record(auth_client, zone["id"], name="a")
    b = add_record(auth_client, zone["id"], name="b")
    ns = defaults(auth_client, zone)["NS"]

    response = auth_client.post(
        f"{records_url(zone)}/bulk-delete",
        json={"ids": [a["id"], b["id"], ns["id"], 424242, a["id"]]},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["deleted"] == 2 and body["skipped"] == 1 and body["not_found"] == 1
    assert [(r["id"], r["status"]) for r in body["results"]] == [
        (a["id"], "deleted"),
        (b["id"], "deleted"),
        (ns["id"], "skipped"),
        (424242, "not_found"),
    ]
    assert "default NS" in body["results"][2]["message"]
    assert list_records(auth_client, zone)["total"] == 2


def test_bulk_delete_requires_ids(auth_client: TestClient, zone: dict) -> None:
    assert auth_client.post(f"{records_url(zone)}/bulk-delete", json={"ids": []}).status_code == 422
