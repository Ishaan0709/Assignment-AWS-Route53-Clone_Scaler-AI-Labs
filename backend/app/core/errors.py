"""Consistent error shape for every non-2xx response.

Every error body looks like::

    {"error": {"code": "InvalidInput", "message": "...", "fields": {"name": "..."}}}
"""

from collections.abc import Mapping
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    """Domain error carrying an HTTP status, a stable machine-readable code and an optional
    mapping of field name to field-specific message."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "InvalidInput"

    def __init__(
        self,
        message: str,
        *,
        fields: Mapping[str, str] | None = None,
        code: str | None = None,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.fields = dict(fields or {})
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code


class BadRequestError(ApiError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "InvalidInput"


class UnauthorizedError(ApiError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "Unauthorized"


class NotFoundError(ApiError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "NotFound"


class ConflictError(ApiError):
    status_code = status.HTTP_409_CONFLICT
    code = "Conflict"


def error_body(code: str, message: str, fields: Mapping[str, str] | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "fields": dict(fields or {})}}


_HTTP_CODES = {
    400: "InvalidInput",
    401: "Unauthorized",
    403: "Forbidden",
    404: "NotFound",
    405: "MethodNotAllowed",
    409: "Conflict",
    413: "PayloadTooLarge",
    415: "UnsupportedMediaType",
    422: "ValidationError",
    429: "TooManyRequests",
    500: "InternalError",
}


def _validation_fields(exc: RequestValidationError) -> dict[str, str]:
    fields: dict[str, str] = {}
    for err in exc.errors():
        loc = [str(part) for part in err.get("loc", ()) if part not in ("body", "query", "path")]
        key = ".".join(loc) or "_"
        if key not in fields:
            fields[key] = str(err.get("msg", "Invalid value"))
    return fields


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, exc.fields),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=error_body(
                "ValidationError", "Request validation failed.", _validation_fields(exc)
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "Error")
        detail = exc.detail if isinstance(exc.detail, str) else code
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(code, detail),
            headers=dict(exc.headers or {}),
        )
