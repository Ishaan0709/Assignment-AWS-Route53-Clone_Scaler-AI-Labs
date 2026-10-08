from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import UnauthorizedError
from app.db.session import get_db
from app.models import User, UserSession
from app.services import auth_service

DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


def get_current_session(
    db: DbSession,
    settings: AppSettings,
    session: Annotated[str | None, Cookie()] = None,
) -> UserSession:
    """Resolve the session cookie to a live session row or raise 401."""
    if not session:
        raise UnauthorizedError("You must sign in to continue.")
    live = auth_service.get_session(db, session)
    if live is None:
        raise UnauthorizedError("Your session has expired. Please sign in again.")
    return live


CurrentSession = Annotated[UserSession, Depends(get_current_session)]


def get_current_user(session: CurrentSession) -> User:
    return session.user


CurrentUser = Annotated[User, Depends(get_current_user)]
