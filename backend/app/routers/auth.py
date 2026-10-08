from typing import Annotated

from fastapi import APIRouter, Cookie, Response, status

from app.deps import AppSettings, CurrentSession, DbSession
from app.schemas.auth import LoginRequest, SessionOut, UserOut
from app.schemas.common import ErrorResponse
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

_UNAUTHORIZED = {401: {"model": ErrorResponse, "description": "Not signed in or session expired"}}


def _set_session_cookie(
    response: Response, settings: AppSettings, token: str, max_age_seconds: int
) -> None:
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        max_age=max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


@router.post(
    "/login",
    response_model=SessionOut,
    summary="Sign in as IAM user",
    description=(
        "Mocked IAM sign-in. Verifies the account ID, user name and password against the "
        "seeded user, stores a session row and sets the `session` HttpOnly cookie "
        "(7-day expiry)."
    ),
    responses={401: {"model": ErrorResponse, "description": "Invalid credentials"}},
)
def login(
    payload: LoginRequest, response: Response, db: DbSession, settings: AppSettings
) -> SessionOut:
    user = auth_service.authenticate(db, payload.account_id, payload.username, payload.password)
    session = auth_service.create_session(db, user, settings.session_ttl_days)
    _set_session_cookie(response, settings, session.id, settings.session_ttl_days * 24 * 60 * 60)
    return SessionOut(user=UserOut.model_validate(user), expires_at=session.expires_at)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Sign out",
    description="Deletes the session row (if any) and clears the cookie. Always succeeds.",
)
def logout(
    response: Response,
    db: DbSession,
    settings: AppSettings,
    session: Annotated[str | None, Cookie()] = None,
) -> Response:
    if session:
        auth_service.revoke_session(db, session)
    response.delete_cookie(key=settings.cookie_name, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get(
    "/me",
    response_model=SessionOut,
    summary="Current user",
    description=(
        "Returns the signed-in user. The frontend calls this on load to restore the session."
    ),
    responses=_UNAUTHORIZED,
)
def me(session: CurrentSession) -> SessionOut:
    return SessionOut(user=UserOut.model_validate(session.user), expires_at=session.expires_at)
