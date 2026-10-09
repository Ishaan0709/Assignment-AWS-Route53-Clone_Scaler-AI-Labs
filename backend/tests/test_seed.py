"""The seed data must obey the same rules as user input, so it can never drift."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DnsRecord, HostedZone, User
from app.schemas.dns_record import RecordBase
from app.seed import SHOWCASE_ZONES, SeedZone, is_empty, many_zone_specs, seed, seed_if_empty
from app.services import record_service, zone_service
from app.services.domain import normalize_domain
from app.services.record_service import PreparedRecord
from app.services.validators import USER_RECORD_TYPES

ALL_SPECS: list[SeedZone] = [*SHOWCASE_ZONES, *many_zone_specs(3)]


@pytest.mark.parametrize("spec", ALL_SPECS, ids=lambda s: s.name)
def test_every_seed_record_passes_validation_and_conflict_rules(spec: SeedZone) -> None:
    zone = HostedZone(id="ZSEED", name=normalize_domain(spec.name), type=spec.type)
    pending: list[PreparedRecord] = []
    for record in spec.records:
        prepared = record_service.prepare(
            zone,
            RecordBase(
                name=record.name,
                type=record.type,  # type: ignore[arg-type]
                ttl=record.ttl,
                values=list(record.values),
                routing_policy=record.routing_policy,  # type: ignore[arg-type]
                set_identifier=record.set_identifier,
                weight=record.weight,
                is_alias=record.alias_target is not None,
                alias_target=record.alias_target,
                evaluate_target_health=record.evaluate_target_health,
                comment=record.comment,
            ),
        )
        # Pure in-memory conflict check against the other records of the same zone.
        for other in pending:
            if other.name != prepared.name:
                continue
            assert not (prepared.type == "CNAME") ^ (other.type == "CNAME"), (
                f"CNAME coexistence violated at {prepared.name}"
            )
            if other.type == prepared.type:
                assert other.routing_policy == prepared.routing_policy
                assert other.set_identifier != prepared.set_identifier, (
                    f"duplicate {prepared.type} at {prepared.name}"
                )
        pending.append(prepared)


def test_showcase_covers_every_type_alias_and_weighted() -> None:
    types = {r.type for z in SHOWCASE_ZONES for r in z.records}
    assert types == set(USER_RECORD_TYPES)
    assert any(r.alias_target for z in SHOWCASE_ZONES for r in z.records)
    weighted = [r for z in SHOWCASE_ZONES for r in z.records if r.routing_policy == "Weighted"]
    assert len(weighted) >= 2
    assert any(z.type == "private" and z.vpc_id for z in SHOWCASE_ZONES)
    # Record count as shown in the console = user records + default NS and SOA.
    assert all(15 <= len(z.records) + 2 <= 30 for z in SHOWCASE_ZONES)


def test_seed_if_empty_runs_once_and_data_is_served(db: Session, client: TestClient) -> None:
    assert is_empty(db)
    assert seed_if_empty(db) is True
    assert seed_if_empty(db) is False  # idempotent
    assert db.scalar(select(func.count()).select_from(User)) == 1
    assert db.scalar(select(func.count()).select_from(HostedZone)) == len(SHOWCASE_ZONES)

    example = db.scalar(select(HostedZone).where(HostedZone.name == "example.com."))
    assert example is not None
    assert zone_service.record_count(db, example.id) == 26
    defaults = db.scalars(
        select(DnsRecord).where(DnsRecord.zone_id == example.id, DnsRecord.is_default.is_(True))
    ).all()
    assert {d.type for d in defaults} == {"NS", "SOA"}

    client.post(
        "/api/auth/login",
        json={"account_id": "123456789012", "username": "admin", "password": "admin123"},
    ).raise_for_status()
    listing = client.get("/api/hostedzones", params={"page_size": 50}).json()
    assert listing["total"] == len(SHOWCASE_ZONES)


def test_seed_many_adds_thirty_zones_and_skips_existing(db: Session) -> None:
    assert seed(db, many=True) == {"zones_created": len(SHOWCASE_ZONES) + 30}
    assert seed(db, many=True) == {"zones_created": 0}
    assert db.scalar(select(func.count()).select_from(HostedZone)) == len(SHOWCASE_ZONES) + 30


def test_seed_if_empty_honours_many_flag(db: Session) -> None:
    assert seed_if_empty(db, many=True) is True
    assert db.scalar(select(func.count()).select_from(HostedZone)) == len(SHOWCASE_ZONES) + 30
