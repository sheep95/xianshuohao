from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import JSON, CheckConstraint, Column, UniqueConstraint
from sqlmodel import Field, SQLModel


def new_id() -> str:
    return str(uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class Identity(SQLModel, table=True):
    __tablename__ = "identities"
    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    token_hash: str = Field(unique=True, index=True, max_length=64)
    created_at: datetime = Field(default_factory=utcnow)
    expires_at: datetime


class Room(SQLModel, table=True):
    __tablename__ = "rooms"
    __table_args__ = (
        CheckConstraint("status IN ('setup','draft','finalized')", name="ck_room_status"),
        CheckConstraint("revision >= 1", name="ck_room_revision"),
    )
    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    code: str = Field(unique=True, index=True, max_length=10)
    space_type: str = Field(max_length=20)
    duration: str = Field(max_length=20)
    duration_days: int
    group_name: str = Field(max_length=40)
    status: str = Field(default="setup", max_length=12)
    revision: int = 1
    selections: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)
    finalized_at: datetime | None = None


class Participant(SQLModel, table=True):
    __tablename__ = "participants"
    __table_args__ = (
        UniqueConstraint("room_id", "identity_id", name="uq_participant_room_identity"),
    )
    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    room_id: str = Field(foreign_key="rooms.id", index=True, max_length=36)
    identity_id: str = Field(foreign_key="identities.id", index=True, max_length=36)
    nickname: str = Field(max_length=20)
    is_owner: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class Rule(SQLModel, table=True):
    __tablename__ = "rules"
    __table_args__ = (
        UniqueConstraint("room_id", "position", name="uq_rule_room_position"),
        UniqueConstraint("room_id", "friction_key", name="uq_rule_room_friction"),
        CheckConstraint("status IN ('pending','claimed','debating')", name="ck_rule_status"),
        CheckConstraint("position >= 1 AND position <= 5", name="ck_rule_position"),
    )
    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    room_id: str = Field(foreign_key="rooms.id", index=True, max_length=36)
    friction_key: str = Field(max_length=64)
    level_id: str = Field(max_length=64)
    variant_index: int = 0
    text: str = Field(max_length=160)
    action: str = Field(max_length=70)
    execution_hint: str = Field(max_length=60)
    status: str = Field(default="pending", max_length=12)
    source: str = Field(default="template", max_length=20)
    version: int = 1
    position: int


class Claim(SQLModel, table=True):
    __tablename__ = "claims"
    __table_args__ = (
        UniqueConstraint("rule_id", "participant_id", name="uq_claim_rule_participant"),
    )
    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    rule_id: str = Field(foreign_key="rules.id", index=True, max_length=36)
    participant_id: str = Field(foreign_key="participants.id", max_length=36)
    rule_version: int
    created_at: datetime = Field(default_factory=utcnow)


class FinalizedSnapshot(SQLModel, table=True):
    __tablename__ = "finalized_snapshots"
    room_id: str = Field(primary_key=True, foreign_key="rooms.id", max_length=36)
    content: dict = Field(sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)


class Operation(SQLModel, table=True):
    __tablename__ = "operations"
    __table_args__ = (
        UniqueConstraint("room_id", "participant_id", "kind", "key", name="uq_operation_key"),
    )
    id: str = Field(default_factory=new_id, primary_key=True, max_length=36)
    room_id: str = Field(foreign_key="rooms.id", max_length=36)
    participant_id: str = Field(foreign_key="participants.id", max_length=36)
    kind: str = Field(max_length=64)
    key: str = Field(max_length=80)
    fingerprint: str = Field(max_length=64)
    created_at: datetime = Field(default_factory=utcnow)
