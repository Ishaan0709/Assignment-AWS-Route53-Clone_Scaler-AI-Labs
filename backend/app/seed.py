"""Demo data: the mocked IAM user plus hosted zones with records covering every type.

Run automatically on startup when the database is empty (``SEED_ON_STARTUP``), or by hand::

    python -m app.seed          # demo user + 5 showcase zones
    python -m app.seed --many   # additionally 30 small zones so pagination is visible
"""

from __future__ import annotations

import argparse
import logging
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, create_all
from app.models import DnsRecord, HostedZone, RecordValue, Tag, User
from app.services import auth_service
from app.services.ids import generate_name_servers, generate_zone_id, soa_value

log = logging.getLogger(__name__)

DEMO_ACCOUNT_ID = "123456789012"
DEMO_USERNAME = "admin"
DEMO_PASSWORD = "admin123"
DEMO_DISPLAY_NAME = "Administrator"

DEFAULT_NS_TTL = 172800
DEFAULT_SOA_TTL = 900


@dataclass(frozen=True)
class SeedRecord:
    name: str  # relative label ('' = apex)
    type: str
    values: tuple[str, ...] = ()
    ttl: int | None = 300
    routing_policy: str = "Simple"
    set_identifier: str | None = None
    weight: int | None = None
    alias_target: str | None = None
    evaluate_target_health: bool | None = None
    comment: str | None = None


@dataclass(frozen=True)
class SeedZone:
    name: str
    type: str = "public"
    description: str | None = None
    vpc_id: str | None = None
    vpc_region: str | None = None
    tags: tuple[tuple[str, str], ...] = ()
    records: tuple[SeedRecord, ...] = field(default_factory=tuple)


def _alias(name: str, type_: str, target: str, eth: bool = False) -> SeedRecord:
    return SeedRecord(name, type_, ttl=None, alias_target=target, evaluate_target_health=eth)


SHOWCASE_ZONES: tuple[SeedZone, ...] = (
    SeedZone(
        name="example.com",
        description="Primary marketing site and corporate mail",
        tags=(("Environment", "production"), ("Team", "platform"), ("CostCenter", "1001")),
        records=(
            SeedRecord("", "A", ("93.184.216.34", "93.184.216.35")),
            SeedRecord("", "AAAA", ("2606:2800:220:1:248:1893:25c8:1946",)),
            _alias("www", "A", "d111111abcdef8.cloudfront.net."),
            _alias("app", "A", "dualstack.app-alb-1234567890.us-east-1.elb.amazonaws.com.", True),
            SeedRecord("blog", "CNAME", ("example.github.io.",)),
            SeedRecord("docs", "CNAME", ("example-docs.netlify.app.",), ttl=3600),
            SeedRecord(
                "",
                "TXT",
                (
                    '"v=spf1 include:_spf.google.com ~all"',
                    '"google-site-verification=abc123def456"',
                ),
                ttl=3600,
            ),
            SeedRecord(
                "_dmarc",
                "TXT",
                ('"v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"',),
                ttl=3600,
            ),
            SeedRecord("_acme-challenge", "TXT", ('"k3yV4lu3-acme-validation-token"',), ttl=60),
            SeedRecord("", "MX", ("10 mail.example.com.", "20 mail2.example.com."), ttl=3600),
            SeedRecord("mail", "A", ("203.0.113.10",)),
            SeedRecord("mail2", "A", ("203.0.113.11",)),
            SeedRecord("dev", "NS", ("ns-1.awsdns-01.com.", "ns-2.awsdns-02.net."), ttl=172800),
            SeedRecord("host", "A", ("203.0.113.50",)),
            SeedRecord("ptr", "PTR", ("host.example.com.",)),
            SeedRecord("_sip._tcp", "SRV", ("10 5 5060 sip.example.com.",)),
            SeedRecord("_xmpp-server._tcp", "SRV", ("5 0 5269 xmpp.example.com.",)),
            SeedRecord("sip", "A", ("198.51.100.20",)),
            SeedRecord("xmpp", "A", ("198.51.100.21",)),
            SeedRecord(
                "",
                "CAA",
                (
                    '0 issue "letsencrypt.org"',
                    '0 issuewild ";"',
                    '0 iodef "mailto:security@example.com"',
                ),
                ttl=3600,
            ),
            SeedRecord(
                "api",
                "A",
                ("198.51.100.10",),
                ttl=60,
                routing_policy="Weighted",
                set_identifier="api-blue",
                weight=70,
                comment="Blue stack",
            ),
            SeedRecord(
                "api",
                "A",
                ("198.51.100.11",),
                ttl=60,
                routing_policy="Weighted",
                set_identifier="api-green",
                weight=30,
                comment="Green stack",
            ),
            SeedRecord("*.staging", "A", ("198.51.100.30",), ttl=60),
            SeedRecord("cdn", "CNAME", ("d222222abcdef8.cloudfront.net.",)),
        ),
    ),
    SeedZone(
        name="acme-corp.io",
        description="ACME Corp SaaS platform",
        tags=(("Environment", "production"), ("Team", "saas")),
        records=(
            SeedRecord("", "A", ("198.51.100.42",)),
            SeedRecord("", "AAAA", ("2001:db8:85a3::8a2e:370:7334",)),
            _alias("www", "A", "d333333abcdef8.cloudfront.net."),
            _alias("api", "A", "dualstack.acme-api-987654321.eu-west-1.elb.amazonaws.com.", True),
            SeedRecord("status", "CNAME", ("acme.statuspage.io.",)),
            SeedRecord("", "TXT", ('"v=spf1 include:mailgun.org ~all"',), ttl=3600),
            SeedRecord("", "MX", ("10 mxa.mailgun.org.", "10 mxb.mailgun.org."), ttl=3600),
            SeedRecord("", "CAA", ('0 issue "amazon.com"',), ttl=3600),
            SeedRecord("_sip._tls", "SRV", ("100 1 443 sip.acme-corp.io.",)),
            SeedRecord("sip", "A", ("198.51.100.43",)),
            SeedRecord("eu", "NS", ("ns-100.awsdns-12.com.", "ns-200.awsdns-25.org."), ttl=172800),
            SeedRecord("vpn", "A", ("203.0.113.77",), ttl=60),
            SeedRecord("vpn", "AAAA", ("2001:db8::77",), ttl=60),
            SeedRecord("git", "CNAME", ("acme-corp.github.io.",)),
            SeedRecord("ptr", "PTR", ("vpn.acme-corp.io.",)),
            SeedRecord(
                "web",
                "A",
                ("198.51.100.50",),
                routing_policy="Weighted",
                set_identifier="web-primary",
                weight=200,
            ),
            SeedRecord(
                "web",
                "A",
                ("198.51.100.51",),
                routing_policy="Weighted",
                set_identifier="web-canary",
                weight=10,
            ),
        ),
    ),
    SeedZone(
        name="internal.local",
        type="private",
        description="Private zone for the shared services VPC",
        vpc_id="vpc-0a1b2c3d4e5f67890",
        vpc_region="us-east-1",
        tags=(("Environment", "shared"), ("Visibility", "private")),
        records=(
            SeedRecord("db", "A", ("10.0.1.10",)),
            SeedRecord("db-replica", "A", ("10.0.1.11",)),
            SeedRecord("cache", "A", ("10.0.2.10", "10.0.2.11", "10.0.2.12")),
            SeedRecord("queue", "A", ("10.0.3.10",)),
            SeedRecord("db", "AAAA", ("fd00::10",)),
            SeedRecord("primary-db", "CNAME", ("db.internal.local.",)),
            SeedRecord("vault", "CNAME", ("vault-0.internal.local.",)),
            SeedRecord("vault-0", "A", ("10.0.4.10",)),
            SeedRecord("_ldap._tcp", "SRV", ("0 100 389 ldap.internal.local.",)),
            SeedRecord("ldap", "A", ("10.0.5.10",)),
            SeedRecord("", "TXT", ('"owner=platform-team"',)),
            SeedRecord("10.1.0.10", "PTR", ("db.internal.local.",)),
            SeedRecord("", "MX", ("10 smtp.internal.local.",)),
            SeedRecord("smtp", "A", ("10.0.6.10",)),
            SeedRecord("corp", "NS", ("ns1.corp.internal.local.", "ns2.corp.internal.local.")),
        ),
    ),
    SeedZone(
        name="shop.example.org",
        description="E-commerce storefront",
        tags=(("Environment", "production"), ("Team", "commerce")),
        records=(
            _alias("", "A", "d444444abcdef8.cloudfront.net."),
            _alias("", "AAAA", "d444444abcdef8.cloudfront.net."),
            _alias("www", "A", "d444444abcdef8.cloudfront.net."),
            SeedRecord("checkout", "CNAME", ("checkout.shopify.com.",)),
            SeedRecord("images", "CNAME", ("shop-images.s3-website-us-east-1.amazonaws.com.",)),
            SeedRecord("", "TXT", ('"v=spf1 include:spf.protection.outlook.com -all"',)),
            SeedRecord("", "MX", ("0 shop-example-org.mail.protection.outlook.com.",)),
            SeedRecord("", "CAA", ('0 issue "letsencrypt.org"', '0 issue "digicert.com"')),
            SeedRecord("admin", "A", ("203.0.113.200",), ttl=60),
            SeedRecord("_sip._tcp", "SRV", ("10 10 5060 pbx.shop.example.org.",)),
            SeedRecord("pbx", "A", ("203.0.113.201",)),
            SeedRecord("ptr", "PTR", ("admin.shop.example.org.",)),
            SeedRecord("search", "AAAA", ("2001:db8:1::5",)),
            SeedRecord("partners", "NS", ("ns-55.awsdns-06.net.", "ns-66.awsdns-08.org.")),
        ),
    ),
    SeedZone(
        name="dev.example.net",
        description="Developer sandboxes and preview environments",
        tags=(("Environment", "development"),),
        records=(
            SeedRecord("", "A", ("192.0.2.10",)),
            SeedRecord("*", "A", ("192.0.2.20",), ttl=60),
            SeedRecord("*", "AAAA", ("2001:db8:2::20",), ttl=60),
            SeedRecord("preview", "CNAME", ("preview.vercel.app.",)),
            SeedRecord("", "TXT", ('"v=spf1 -all"',)),
            SeedRecord("", "MX", ("10 mail.dev.example.net.",)),
            SeedRecord("mail", "A", ("192.0.2.25",)),
            SeedRecord("", "CAA", ('0 issue "letsencrypt.org"',)),
            SeedRecord("_minecraft._tcp", "SRV", ("0 5 25565 mc.dev.example.net.",)),
            SeedRecord("mc", "A", ("192.0.2.30",)),
            SeedRecord("ptr", "PTR", ("mc.dev.example.net.",)),
            SeedRecord("lab", "NS", ("ns-11.awsdns-01.com.", "ns-22.awsdns-02.net.")),
            SeedRecord("ci", "A", ("192.0.2.40",), comment="GitHub Actions runners"),
        ),
    ),
)


def _normalize_zone_name(name: str) -> str:
    name = name.strip().lower().rstrip(".")
    return f"{name}."


def _fqdn(zone_name: str, relative: str) -> str:
    return zone_name if relative == "" else f"{relative.lower()}.{zone_name}"


def _build_record(zone: HostedZone, spec: SeedRecord) -> DnsRecord:
    is_alias = spec.alias_target is not None
    record = DnsRecord(
        zone=zone,
        name=_fqdn(zone.name, spec.name),
        type=spec.type,
        ttl=None if is_alias else spec.ttl,
        routing_policy=spec.routing_policy,
        set_identifier=spec.set_identifier,
        weight=spec.weight,
        is_alias=is_alias,
        alias_target=spec.alias_target,
        evaluate_target_health=spec.evaluate_target_health if is_alias else None,
        comment=spec.comment,
    )
    record.values = [RecordValue(position=i, value=v) for i, v in enumerate(spec.values)]
    return record


def add_zone(db: Session, spec: SeedZone) -> HostedZone:
    """Insert one zone with its default NS/SOA and the given records (single transaction)."""
    zone = HostedZone(
        id=generate_zone_id(),
        name=_normalize_zone_name(spec.name),
        type=spec.type,
        description=spec.description,
        vpc_id=spec.vpc_id,
        vpc_region=spec.vpc_region,
    )
    name_servers = generate_name_servers()
    zone.records.append(
        DnsRecord(
            name=zone.name,
            type="NS",
            ttl=DEFAULT_NS_TTL,
            is_default=True,
            values=[RecordValue(position=i, value=ns) for i, ns in enumerate(name_servers)],
        )
    )
    zone.records.append(
        DnsRecord(
            name=zone.name,
            type="SOA",
            ttl=DEFAULT_SOA_TTL,
            is_default=True,
            values=[RecordValue(position=0, value=soa_value(name_servers[0]))],
        )
    )
    for record_spec in spec.records:
        zone.records.append(_build_record(zone, record_spec))
    zone.tags = [Tag(key=k, value=v) for k, v in spec.tags]
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return zone


def _existing_zone_names(db: Session) -> set[str]:
    return set(db.scalars(select(HostedZone.name)).all())


def seed_user(db: Session) -> User:
    user = db.scalar(select(User).where(User.username == DEMO_USERNAME))
    if user is not None:
        return user
    log.info("Seeding demo user %s", DEMO_USERNAME)
    return auth_service.create_user(
        db,
        account_id=DEMO_ACCOUNT_ID,
        username=DEMO_USERNAME,
        password=DEMO_PASSWORD,
        display_name=DEMO_DISPLAY_NAME,
    )


def seed_zones(db: Session, specs: tuple[SeedZone, ...] | list[SeedZone]) -> int:
    existing = _existing_zone_names(db)
    created = 0
    for spec in specs:
        if _normalize_zone_name(spec.name) in existing:
            continue
        add_zone(db, spec)
        created += 1
    return created


def many_zone_specs(count: int = 30) -> list[SeedZone]:
    specs: list[SeedZone] = []
    for i in range(1, count + 1):
        specs.append(
            SeedZone(
                name=f"tenant-{i:02d}.example.net",
                description=f"Tenant {i:02d} customer site",
                tags=(("Environment", "production"), ("Tenant", f"{i:02d}")),
                records=(
                    SeedRecord("", "A", (f"203.0.113.{i}",)),
                    SeedRecord("www", "CNAME", (f"tenant-{i:02d}.example.net.",)),
                    SeedRecord("", "TXT", (f'"tenant-id={i:02d}"',)),
                ),
            )
        )
    return specs


def seed(db: Session, *, many: bool = False) -> dict[str, int]:
    seed_user(db)
    created = seed_zones(db, SHOWCASE_ZONES)
    if many:
        created += seed_zones(db, many_zone_specs())
    return {"zones_created": created}


def is_empty(db: Session) -> bool:
    users = db.scalar(select(func.count()).select_from(User)) or 0
    zones = db.scalar(select(func.count()).select_from(HostedZone)) or 0
    return users == 0 and zones == 0


def seed_if_empty(db: Session, *, many: bool = False) -> bool:
    if not is_empty(db):
        return False
    result = seed(db, many=many)
    log.info("Seeded demo data: %s", result)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Route 53 clone database.")
    parser.add_argument(
        "--many", action="store_true", help="Also create 30 small zones for pagination demos."
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    create_all()
    with SessionLocal() as db:
        result = seed(db, many=args.many)
    log.info("Done: %s", result)


if __name__ == "__main__":
    main()
