import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DnsRecord, HostedZone, Tag

ZONE_ID_RE = re.compile(r"^Z[A-Z0-9]{20}$")


def create_zone(client: TestClient, name: str = "example.com", **extra: object) -> dict:
    response = client.post("/api/hostedzones", json={"name": name, **extra})
    assert response.status_code == 201, response.text
    return response.json()


def add_record(client: TestClient, zone_id: str, **payload: object) -> dict:
    body = {"name": "www", "type": "A", "ttl": 300, "values": ["192.0.2.1"], **payload}
    response = client.post(f"/api/hostedzones/{zone_id}/records", json=body)
    assert response.status_code == 201, response.text
    return response.json()[0]


# --- auth guard -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/hostedzones"),
        ("post", "/api/hostedzones"),
        ("get", "/api/hostedzones/Z1"),
        ("put", "/api/hostedzones/Z1"),
        ("delete", "/api/hostedzones/Z1"),
        ("put", "/api/hostedzones/Z1/tags"),
        ("get", "/api/hostedzones/Z1/records"),
        ("post", "/api/hostedzones/Z1/records"),
        ("get", "/api/hostedzones/Z1/export"),
        ("post", "/api/hostedzones/Z1/import"),
    ],
)
def test_endpoints_require_session(client: TestClient, method: str, path: str) -> None:
    response = client.request(method, path, json={})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "Unauthorized"


# --- create ---------------------------------------------------------------------------------


def test_create_zone_normalizes_name_and_adds_default_ns_and_soa(
    auth_client: TestClient, db: Session
) -> None:
    zone = create_zone(auth_client, "Example.COM", description="  Primary site ")

    assert ZONE_ID_RE.match(zone["id"])
    assert zone["name"] == "example.com."
    assert zone["type"] == "public"
    assert zone["description"] == "Primary site"
    assert zone["created_by"] == "Route 53"
    assert zone["record_count"] == 2
    assert len(zone["name_servers"]) == 4
    assert all(
        re.match(r"^ns-\d+\.awsdns-\d{2}\.(org|com|net|co\.uk)\.$", ns)
        for ns in zone["name_servers"]
    )

    records = db.scalars(select(DnsRecord).where(DnsRecord.zone_id == zone["id"])).all()
    by_type = {r.type: r for r in records}
    assert set(by_type) == {"NS", "SOA"}
    assert by_type["NS"].is_default and by_type["SOA"].is_default
    assert by_type["NS"].ttl == 172800
    assert by_type["SOA"].ttl == 900
    assert by_type["NS"].name == by_type["SOA"].name == "example.com."
    assert by_type["NS"].value_list == zone["name_servers"]
    assert by_type["SOA"].value_list == [
        f"{zone['name_servers'][0]} awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400"
    ]


def test_create_zone_with_tags(auth_client: TestClient) -> None:
    zone = create_zone(
        auth_client,
        tags=[{"key": "Environment", "value": "prod"}, {"key": "Team", "value": ""}],
    )
    assert zone["tags"] == [
        {"key": "Environment", "value": "prod"},
        {"key": "Team", "value": ""},
    ]


def test_create_zone_duplicate_name_and_type_returns_409(auth_client: TestClient) -> None:
    create_zone(auth_client, "example.com")
    response = auth_client.post("/api/hostedzones", json={"name": "EXAMPLE.com."})
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "HostedZoneAlreadyExists"
    assert "name" in error["fields"]


def test_same_name_allowed_for_public_and_private(auth_client: TestClient) -> None:
    create_zone(auth_client, "example.com")
    private = create_zone(
        auth_client, "example.com", type="private", vpc_id="vpc-123", vpc_region="us-east-1"
    )
    assert private["type"] == "private"
    assert private["vpc_id"] == "vpc-123"


def test_private_zone_requires_vpc(auth_client: TestClient) -> None:
    response = auth_client.post("/api/hostedzones", json={"name": "corp.local", "type": "private"})
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "InvalidVPC"
    assert set(error["fields"]) == {"vpc_id", "vpc_region"}


def test_public_zone_ignores_vpc_fields(auth_client: TestClient) -> None:
    zone = create_zone(auth_client, vpc_id="vpc-1", vpc_region="us-east-1")
    assert zone["vpc_id"] is None and zone["vpc_region"] is None


@pytest.mark.parametrize("name", ["localhost", "-bad.com", "bad_name.com", "a..b"])
def test_create_zone_invalid_domain_returns_400_with_field(
    auth_client: TestClient, name: str
) -> None:
    response = auth_client.post("/api/hostedzones", json={"name": name})
    assert response.status_code == 400
    assert "name" in response.json()["error"]["fields"]


def test_create_zone_schema_validation_returns_422(auth_client: TestClient) -> None:
    response = auth_client.post("/api/hostedzones", json={"type": "public"})
    assert response.status_code == 422
    assert "name" in response.json()["error"]["fields"]


@pytest.mark.parametrize(
    "tags",
    [
        [{"key": "a", "value": "1"}, {"key": "a", "value": "2"}],
        [{"key": "aws:reserved", "value": "x"}],
    ],
)
def test_create_zone_invalid_tags(auth_client: TestClient, tags: list[dict]) -> None:
    response = auth_client.post("/api/hostedzones", json={"name": "example.com", "tags": tags})
    assert response.status_code == 400
    assert "tags" in response.json()["error"]["fields"]


# --- list / search / pagination -----------------------------------------------------------


def test_list_zones_pagination_and_default_sort(auth_client: TestClient) -> None:
    for name in ["charlie.com", "alpha.com", "bravo.com"]:
        create_zone(auth_client, name)

    page1 = auth_client.get("/api/hostedzones", params={"page_size": 2}).json()
    assert page1["total"] == 3 and page1["page"] == 1 and page1["page_size"] == 2
    assert [z["name"] for z in page1["items"]] == ["alpha.com.", "bravo.com."]
    assert all(z["record_count"] == 2 for z in page1["items"])

    page2 = auth_client.get("/api/hostedzones", params={"page_size": 2, "page": 2}).json()
    assert [z["name"] for z in page2["items"]] == ["charlie.com."]


def test_list_zones_search_matches_name_description_id_and_type(auth_client: TestClient) -> None:
    a = create_zone(auth_client, "shop.example.org", description="Storefront")
    create_zone(auth_client, "internal.local", type="private", vpc_id="v", vpc_region="us-east-1")

    def names(**params: object) -> list[str]:
        return [
            z["name"] for z in auth_client.get("/api/hostedzones", params=params).json()["items"]
        ]

    assert names(q="shop") == ["shop.example.org."]
    assert names(q="storefront") == ["shop.example.org."]
    assert names(q=a["id"][-8:]) == ["shop.example.org."]
    assert names(q="private") == ["internal.local."]
    assert names(type="private") == ["internal.local."]
    assert names(name="example") == ["shop.example.org."]
    assert names(q="nothing-matches") == []


def test_list_zones_sorting(auth_client: TestClient) -> None:
    a = create_zone(auth_client, "a.com")
    create_zone(auth_client, "b.com")
    add_record(auth_client, a["id"])

    by_count = auth_client.get(
        "/api/hostedzones", params={"sort": "record_count", "order": "desc"}
    ).json()["items"]
    assert [z["name"] for z in by_count] == ["a.com.", "b.com."]
    assert by_count[0]["record_count"] == 3

    by_name_desc = auth_client.get("/api/hostedzones", params={"sort": "name", "order": "desc"})
    assert [z["name"] for z in by_name_desc.json()["items"]] == ["b.com.", "a.com."]

    bad = auth_client.get("/api/hostedzones", params={"sort": "password"})
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "InvalidSort"


def test_list_zones_rejects_bad_pagination(auth_client: TestClient) -> None:
    assert auth_client.get("/api/hostedzones", params={"page": 0}).status_code == 422
    assert auth_client.get("/api/hostedzones", params={"page_size": 101}).status_code == 422


# --- get ------------------------------------------------------------------------------------


def test_get_zone_includes_count_tags_and_name_servers(auth_client: TestClient) -> None:
    created = create_zone(auth_client, tags=[{"key": "k", "value": "v"}])
    add_record(auth_client, created["id"])

    zone = auth_client.get(f"/api/hostedzones/{created['id']}").json()
    assert zone["record_count"] == 3
    assert zone["tags"] == [{"key": "k", "value": "v"}]
    assert zone["name_servers"] == created["name_servers"]


def test_get_unknown_zone_returns_404(auth_client: TestClient) -> None:
    response = auth_client.get("/api/hostedzones/Z404")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NoSuchHostedZone"


# --- update ---------------------------------------------------------------------------------


def test_update_zone_changes_only_description_and_tags(
    auth_client: TestClient, db: Session
) -> None:
    zone = create_zone(auth_client, "example.com", description="old")

    response = auth_client.put(
        f"/api/hostedzones/{zone['id']}",
        json={
            "description": "new",
            "name": "hacked.com",  # ignored
            "type": "private",  # ignored
            "tags": [{"key": "Owner", "value": "me"}],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["description"] == "new"
    assert body["name"] == "example.com."
    assert body["type"] == "public"
    assert body["tags"] == [{"key": "Owner", "value": "me"}]

    stored = db.get(HostedZone, zone["id"])
    assert stored is not None and stored.name == "example.com." and stored.type == "public"


def test_update_zone_without_tags_keeps_them(auth_client: TestClient) -> None:
    zone = create_zone(auth_client, tags=[{"key": "k", "value": "v"}])
    body = auth_client.put(f"/api/hostedzones/{zone['id']}", json={"description": "x"}).json()
    assert body["tags"] == [{"key": "k", "value": "v"}]


def test_update_zone_keeps_existing_tag_key_and_adds_another(auth_client: TestClient) -> None:
    """Regression: re-sending an existing key used to hit the (zone_id, key) unique index."""
    zone = create_zone(auth_client, tags=[{"key": "Environment", "value": "dev"}])
    response = auth_client.put(
        f"/api/hostedzones/{zone['id']}",
        json={
            "tags": [
                {"key": "Environment", "value": "prod"},
                {"key": "Team", "value": "platform"},
            ]
        },
    )
    assert response.status_code == 200
    assert response.json()["tags"] == [
        {"key": "Environment", "value": "prod"},
        {"key": "Team", "value": "platform"},
    ]


def test_update_zone_can_clear_description(auth_client: TestClient) -> None:
    zone = create_zone(auth_client, description="old")
    body = auth_client.put(f"/api/hostedzones/{zone['id']}", json={"description": ""}).json()
    assert body["description"] is None


def test_replace_tags_endpoint(auth_client: TestClient, db: Session) -> None:
    zone = create_zone(auth_client, tags=[{"key": "a", "value": "1"}, {"key": "b", "value": "2"}])
    body = auth_client.put(
        f"/api/hostedzones/{zone['id']}/tags", json={"tags": [{"key": "c", "value": "3"}]}
    ).json()
    assert body["tags"] == [{"key": "c", "value": "3"}]
    assert db.scalars(select(Tag).where(Tag.zone_id == zone["id"])).all().__len__() == 1


# --- delete ---------------------------------------------------------------------------------


def test_delete_zone_with_only_defaults_succeeds_and_cascades(
    auth_client: TestClient, db: Session
) -> None:
    zone = create_zone(auth_client, tags=[{"key": "k", "value": "v"}])
    response = auth_client.delete(f"/api/hostedzones/{zone['id']}")
    assert response.status_code == 204
    assert auth_client.get(f"/api/hostedzones/{zone['id']}").status_code == 404
    assert db.scalars(select(DnsRecord).where(DnsRecord.zone_id == zone["id"])).all() == []
    assert db.scalars(select(Tag).where(Tag.zone_id == zone["id"])).all() == []


def test_delete_zone_with_records_returns_409_until_cleared(auth_client: TestClient) -> None:
    zone = create_zone(auth_client)
    record = add_record(auth_client, zone["id"])

    response = auth_client.delete(f"/api/hostedzones/{zone['id']}")
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "HostedZoneNotEmpty"
    assert "NS and SOA" in error["message"]

    assert (
        auth_client.delete(f"/api/hostedzones/{zone['id']}/records/{record['id']}").status_code
        == 204
    )
    assert auth_client.delete(f"/api/hostedzones/{zone['id']}").status_code == 204


def test_force_delete_zone_with_records(auth_client: TestClient) -> None:
    zone = create_zone(auth_client)
    add_record(auth_client, zone["id"])
    assert (
        auth_client.delete(f"/api/hostedzones/{zone['id']}", params={"force": "true"}).status_code
        == 204
    )


def test_delete_unknown_zone_returns_404(auth_client: TestClient) -> None:
    assert auth_client.delete("/api/hostedzones/Z404").status_code == 404
