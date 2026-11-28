from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""

class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: str
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def assume_utc(cls, value):

        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
