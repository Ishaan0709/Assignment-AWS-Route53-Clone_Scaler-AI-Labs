from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ApiModel(BaseModel):
    """Base for response models; reads attributes straight from ORM objects."""

    model_config = ConfigDict(from_attributes=True)


class Paginated(BaseModel, Generic[T]):
    items: list[T]
    total: int = Field(examples=[42])
    page: int = Field(examples=[1])
    page_size: int = Field(examples=[10])


class ErrorDetail(BaseModel):
    code: str = Field(examples=["InvalidInput"])
    message: str = Field(examples=["Domain name is not valid."])
    fields: dict[str, str] = Field(default_factory=dict, examples=[{"name": "Invalid label."}])


class ErrorResponse(BaseModel):
    """Shape of every non-2xx response."""

    error: ErrorDetail


class MessageResponse(BaseModel):
    message: str
