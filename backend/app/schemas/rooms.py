import unicodedata
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.schemas.library import SpaceKey

Identifier = Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[a-z0-9_]+$")]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Selection(InputModel):
    friction_key: Identifier
    level_id: Identifier
    custom_execution_hint: str | None = Field(default=None, max_length=60)

    @field_validator("custom_execution_hint")
    @classmethod
    def validate_custom_hint(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if any(unicodedata.category(c).startswith("C") or c in "<>" for c in value):
            raise ValueError("退路只能填写不含控制符或 HTML 的单行文字")
        return value.strip() or None


class RoomCreate(InputModel):
    space_type: SpaceKey
    group_name: str = Field(default="临时空间", min_length=1, max_length=40)
    nickname: str | None = Field(default=None, min_length=1, max_length=20)
    selections: list[Selection] = Field(default_factory=list, max_length=5)

    @field_validator("group_name", "nickname")
    @classmethod
    def plain_display_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value or any(unicodedata.category(c).startswith("C") or c in "<>" for c in value):
            raise ValueError("请填写不含控制符或 HTML 的简短文字")
        return value

    @model_validator(mode="after")
    def unique_frictions(self) -> Self:
        if len({s.friction_key for s in self.selections}) != len(self.selections):
            raise ValueError("同一个摩擦点只能选择一个行为水位")
        return self


class JoinRequest(InputModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=20)
    _plain = field_validator("nickname")(RoomCreate.plain_display_text.__func__)


class GenerateRequest(InputModel):
    expected_revision: int = Field(ge=1)
    confirm_suggestions: bool = False


class ClaimRequest(InputModel):
    expected_version: int = Field(ge=1)


class SwapRequest(InputModel):
    expected_version: int = Field(ge=1)
    expected_claim_count: int | None = Field(default=None, ge=0)
    mode: Literal["preview", "apply"] = "preview"
    target_level_id: Identifier | None = None
    confirmed: bool = False


class FinalizeRequest(InputModel):
    expected_revision: int = Field(ge=1)


class Viewer(BaseModel):
    participant_id: str
    nickname: str
    is_owner: bool


class SelectionView(BaseModel):
    friction_key: str
    level_id: str
    label: str
    action: str
    execution_hint: str
    suggested: bool


class ClaimView(BaseModel):
    participant_id: str
    nickname: str


class RuleView(BaseModel):
    id: str
    friction_key: str
    level_id: str
    text: str
    action: str
    execution_hint: str
    status: Literal["pending", "claimed", "debating"]
    source: Literal["template", "llm"]
    version: int
    order: int
    claim_count: int
    claimed_by_me: bool
    claims: list[ClaimView]


class CardRule(BaseModel):
    text: str
    execution_hint: str
    order: int


class CardSnapshot(BaseModel):
    code: str
    group_name: str
    space_type: SpaceKey
    space_label: str
    duration: str
    duration_days: int
    participant_count: int
    adopted_date: str
    effective_at: datetime
    expires_at: datetime
    rules: list[CardRule]
    oath: str


class RoomView(BaseModel):
    id: str
    code: str
    space_type: SpaceKey
    duration: str
    duration_days: int
    group_name: str
    status: Literal["setup", "draft", "finalized"]
    revision: int
    created_at: datetime
    finalized_at: datetime | None
    participant_count: int
    viewer: Viewer | None
    selections: list[SelectionView]
    rules: list[RuleView]
    snapshot: CardSnapshot | None


class SwapPreview(BaseModel):
    rule_id: str
    expected_version: int
    target_level_id: str
    old_action: str
    new_action: str
    text: str
    execution_hint: str
    boundary_changed: bool
    claims_to_clear: int
    requires_owner: bool
    requires_confirmation: Literal[True] = True
