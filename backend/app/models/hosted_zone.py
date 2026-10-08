from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Index, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utcnow
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.dns_record import DnsRecord
    from app.models.tag import Tag

ZONE_TYPES = ("public", "private")


class HostedZone(Base):
    __tablename__ = "hosted_zones"
    __table_args__ = (
        CheckConstraint("type IN ('public','private')", name="ck_hosted_zones_type"),
        UniqueConstraint("name", "type", name="uq_hosted_zones_name_type"),
        Index("ix_zones_name", "name"),
    )

    # 'Z' + 20 uppercase alphanumerics, e.g. Z0123456789ABCDEFGHIJ
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    # Normalized: lowercase with a trailing dot, e.g. "example.com."
    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    vpc_id: Mapped[str | None] = mapped_column(Text)
    vpc_region: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(
        Text, nullable=False, default="Route 53", server_default="Route 53"
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

    records: Mapped[list["DnsRecord"]] = relationship(
        back_populates="zone", cascade="all, delete-orphan", passive_deletes=True
    )
    tags: Mapped[list["Tag"]] = relationship(
        back_populates="zone",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Tag.key",
    )
