from datetime import datetime

from pydantic import BaseModel, Field

from app.core.security import MAX_PASSWORD_BYTES
from app.schemas.common import ApiModel


class LoginRequest(BaseModel):
    account_id: str = Field(
        min_length=1,
        max_length=64,
        description="12-digit AWS account ID or account alias.",
        examples=["123456789012"],
    )
    username: str = Field(min_length=1, max_length=64, examples=["admin"])
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_BYTES, examples=["admin123"])
    remember: bool = Field(default=False, description="Mocked 'Remember this account' flag.")


class UserOut(ApiModel):
    id: int
    account_id: str = Field(examples=["123456789012"])
    username: str = Field(examples=["admin"])
    display_name: str = Field(examples=["Administrator"])
    created_at: datetime


class SessionOut(ApiModel):
    user: UserOut
    expires_at: datetime
