from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.errors import UnauthorizedError
from app.core.security import generate_session_token, hash_password, verify_password
from app.core.time import utcnow
from app.models import User, UserSession

INVALID_CREDENTIALS = "Your authentication information is incorrect. Please try again."


def normalize_account_id(account_id: str) -> str:
    """Accept '1234-5678-9012' or '123456789012' (as the console does)."""
    return account_id.replace("-", "").strip()


def authenticate(db: Session, account_id: str, username: str, password: str) -> User:
    user = db.scalar(select(User).where(User.username == username.strip()))
    if user is None or user.account_id != normalize_account_id(account_id):
        raise UnauthorizedError(INVALID_CREDENTIALS, code="InvalidCredentials")
    if not verify_password(password, user.password_hash):
        raise UnauthorizedError(INVALID_CREDENTIALS, code="InvalidCredentials")
    return user


def create_session(db: Session, user: User, ttl_days: int) -> UserSession:
    session = UserSession(
        id=generate_session_token(),
        user_id=user.id,
        expires_at=utcnow() + timedelta(days=ttl_days),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session(db: Session, token: str) -> UserSession | None:
    """Return the live session for ``token`` or ``None``. Expired sessions are purged."""
    session = db.get(UserSession, token)
    if session is None:
        return None
    if session.is_expired():
        db.delete(session)
        db.commit()
        return None
    return session


def revoke_session(db: Session, token: str) -> None:
    db.execute(delete(UserSession).where(UserSession.id == token))
    db.commit()


def purge_expired_sessions(db: Session) -> int:
    result = db.execute(delete(UserSession).where(UserSession.expires_at <= utcnow()))
    db.commit()
    return int(result.rowcount or 0)


def create_user(
    db: Session, *, account_id: str, username: str, password: str, display_name: str
) -> User:
    user = User(
        account_id=normalize_account_id(account_id),
        username=username,
        password_hash=hash_password(password),
        display_name=display_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
