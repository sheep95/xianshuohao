from pydantic import BaseModel, ConfigDict, Field

from app.schemas.rooms import Identifier


class RewrittenRule(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    friction_key: Identifier
    level_id: Identifier
    real_friction: str = Field(min_length=1, max_length=300)
    text: str = Field(min_length=1, max_length=160)
    execution_hint: str = Field(min_length=1, max_length=60)
