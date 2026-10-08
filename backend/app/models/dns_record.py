from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utcnow
from app.db.base import Base
from app.models.hosted_zone import HostedZone

RECORD_TYPES = ("A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA", "SOA")
ROUTING_POLICIES = ("Simple", "Weighted", "Latency", "Failover", "Geolocation", "Multivalue")


class DnsRecord(Base):
    __tablename__ = "dns_records"
    __table_args__ = (
        CheckConstraint(
            "type IN ('A','AAAA','CNAME','TXT','MX','NS','PTR','SRV','CAA','SOA')",
            name="ck_dns_records_type",
        ),
        UniqueConstraint(
            "zone_id", "name", "type", "set_identifier", name="uq_dns_records_zone_name_type_set"
        ),
        Index("ix_records_zone_type", "zone_id", "type"),
        Index("ix_records_zone_name", "zone_id", "name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    zone_id: Mapped[str] = mapped_column(
        Text, ForeignKey("hosted_zones.id", ondelete="CASCADE"), nullable=False
    )
    # FQDN, lowercase, trailing dot. The apex is stored as the zone name itself.
    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    ttl: Mapped[int | None] = mapped_column(Integer)  # NULL when alias
    routing_policy: Mapped[str] = mapped_column(
        Text, nullable=False, default="Simple", server_default="Simple"
    )
    set_identifier: Mapped[str | None] = mapped_column(Text)
    weight: Mapped[int | None] = mapped_column(Integer)
    is_alias: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0")
    )
    alias_target: Mapped[str | None] = mapped_column(Text)
    evaluate_target_health: Mapped[bool | None] = mapped_column(Boolean)
    health_check_id: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str | None] = mapped_column(Text)
    # Apex NS/SOA created together with the zone; cannot be deleted.
    is_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
        server_default=func.current_timestamp(),
    )

    zone: Mapped[HostedZone] = relationship(back_populates="records")
    values: Mapped[list["RecordValue"]] = relationship(
        back_populates="record",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="RecordValue.position",
    )

    @property
    def value_list(self) -> list[str]:
        return [v.value for v in self.values]


class RecordValue(Base):
    """One row per value so multi-value records (several A addresses, several TXT strings)
    stay normalized and queryable. ``position`` preserves the user's order."""

    __tablename__ = "record_values"
    __table_args__ = (Index("ix_values_record", "record_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    record_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("dns_records.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)

    record: Mapped[DnsRecord] = relationship(back_populates="values")
