from sqlalchemy import ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.hosted_zone import HostedZone


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("zone_id", "key", name="uq_tags_zone_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    zone_id: Mapped[str] = mapped_column(
        Text, ForeignKey("hosted_zones.id", ondelete="CASCADE"), nullable=False
    )
    key: Mapped[str] = mapped_column(Text, nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")

    zone: Mapped[HostedZone] = relationship(back_populates="tags")
