"""Initial schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-09
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Text(), nullable=False),
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_sessions_user", "sessions", ["user_id"])
    op.create_table(
        "hosted_zones",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("vpc_id", sa.Text(), nullable=True),
        sa.Column("vpc_region", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Text(), nullable=False, server_default="Route 53"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.CheckConstraint("type IN ('public','private')", name="ck_hosted_zones_type"),
        sa.UniqueConstraint("name", "type", name="uq_hosted_zones_name_type"),
    )
    op.create_index("ix_zones_name", "hosted_zones", ["name"])
    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("zone_id", sa.Text(), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["zone_id"], ["hosted_zones.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("zone_id", "key", name="uq_tags_zone_key"),
    )
    op.create_table(
        "dns_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("zone_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("ttl", sa.Integer(), nullable=True),
        sa.Column("routing_policy", sa.Text(), nullable=False, server_default="Simple"),
        sa.Column("set_identifier", sa.Text(), nullable=True),
        sa.Column("weight", sa.Integer(), nullable=True),
        sa.Column("is_alias", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("alias_target", sa.Text(), nullable=True),
        sa.Column("evaluate_target_health", sa.Boolean(), nullable=True),
        sa.Column("health_check_id", sa.Text(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.CheckConstraint(
            "type IN ('A','AAAA','CNAME','TXT','MX','NS','PTR','SRV','CAA','SOA')",
            name="ck_dns_records_type",
        ),
        sa.ForeignKeyConstraint(["zone_id"], ["hosted_zones.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "zone_id",
            "name",
            "type",
            "set_identifier",
            name="uq_dns_records_zone_name_type_set",
        ),
    )
    op.create_index("ix_records_zone_type", "dns_records", ["zone_id", "type"])
    op.create_index("ix_records_zone_name", "dns_records", ["zone_id", "name"])
    op.create_table(
        "record_values",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("record_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["record_id"], ["dns_records.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_values_record", "record_values", ["record_id"])


def downgrade() -> None:
    op.drop_index("ix_values_record", table_name="record_values")
    op.drop_table("record_values")
    op.drop_index("ix_records_zone_name", table_name="dns_records")
    op.drop_index("ix_records_zone_type", table_name="dns_records")
    op.drop_table("dns_records")
    op.drop_table("tags")
    op.drop_index("ix_zones_name", table_name="hosted_zones")
    op.drop_table("hosted_zones")
    op.drop_index("ix_sessions_user", table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("users")
