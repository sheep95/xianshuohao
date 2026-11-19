from typing import Literal

from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"] = "ok"
    service: Literal["temporary-constitution-api"] = "temporary-constitution-api"
    stage: Literal[6] = 6
