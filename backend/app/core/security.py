import secrets

import bcrypt

# bcrypt silently truncates (or in newer versions rejects) passwords longer than 72 bytes.
MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    raw = password.encode("utf-8")
    if len(raw) > MAX_PASSWORD_BYTES:
        return False
    try:
        return bcrypt.checkpw(raw, password_hash.encode("ascii"))
    except ValueError:
        return False


def generate_session_token() -> str:
    """Random 32-byte URL-safe token used as the session primary key and cookie value."""
    return secrets.token_urlsafe(32)
