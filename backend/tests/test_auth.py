from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import User, UserSession
from tests.conftest import LOGIN_PAYLOAD


def test_login_success_sets_httponly_cookie_and_returns_user(
    client: TestClient, demo_user: User, db: Session
) -> None:
    response = client.post("/api/auth/login", json=LOGIN_PAYLOAD)

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["username"] == "admin"
    assert body["user"]["account_id"] == "123456789012"
    assert "password_hash" not in body["user"]

    cookie = response.headers["set-cookie"]
    assert cookie.startswith("session=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie

    stored = db.scalars(select(UserSession)).all()
    assert len(stored) == 1
    assert stored[0].user_id == demo_user.id
    assert stored[0].id == client.cookies["session"]
    # 7-day expiry (allow a little slack for test execution time)
    delta = stored[0].expires_at - utcnow()
    assert timedelta(days=6, hours=23) < delta <= timedelta(days=7)


def test_login_accepts_dashed_account_id(client: TestClient, demo_user: User) -> None:
    payload = {**LOGIN_PAYLOAD, "account_id": "1234-5678-9012"}
    assert client.post("/api/auth/login", json=payload).status_code == 200


def test_login_wrong_password_returns_401_with_error_shape(
    client: TestClient, demo_user: User
) -> None:
    response = client.post("/api/auth/login", json={**LOGIN_PAYLOAD, "password": "nope"})

    assert response.status_code == 401
    assert response.json() == {
        "error": {
            "code": "InvalidCredentials",
            "message": "Your authentication information is incorrect. Please try again.",
            "fields": {},
        }
    }
    assert "set-cookie" not in response.headers


def test_login_wrong_account_or_user_returns_401(client: TestClient, demo_user: User) -> None:
    bad_account = {**LOGIN_PAYLOAD, "account_id": "000000000000"}
    bad_user = {**LOGIN_PAYLOAD, "username": "ghost"}
    assert client.post("/api/auth/login", json=bad_account).status_code == 401
    assert client.post("/api/auth/login", json=bad_user).status_code == 401


def test_login_missing_fields_returns_422_with_field_errors(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"username": "admin"})
    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "ValidationError"
    assert set(body["fields"]) == {"account_id", "password"}


def test_me_without_cookie_returns_401(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "Unauthorized"


def test_me_with_unknown_token_returns_401(client: TestClient) -> None:
    client.cookies.set("session", "not-a-real-token")
    assert client.get("/api/auth/me").status_code == 401


def test_me_returns_current_user_and_persists_across_requests(auth_client: TestClient) -> None:
    first = auth_client.get("/api/auth/me")
    second = auth_client.get("/api/auth/me")
    assert first.status_code == second.status_code == 200
    assert first.json()["user"]["username"] == "admin"


def test_logout_invalidates_session_and_clears_cookie(auth_client: TestClient, db: Session) -> None:
    token = auth_client.cookies["session"]

    response = auth_client.post("/api/auth/logout")

    assert response.status_code == 204
    assert 'session=""' in response.headers["set-cookie"]
    assert db.get(UserSession, token) is None

    # Even if a client replays the old cookie, it is rejected.
    auth_client.cookies.set("session", token)
    assert auth_client.get("/api/auth/me").status_code == 401


def test_logout_without_session_is_idempotent(client: TestClient) -> None:
    assert client.post("/api/auth/logout").status_code == 204


def test_expired_session_is_rejected_and_purged(auth_client: TestClient, db: Session) -> None:
    token = auth_client.cookies["session"]
    session = db.get(UserSession, token)
    assert session is not None
    session.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()

    response = auth_client.get("/api/auth/me")

    assert response.status_code == 401
    assert "expired" in response.json()["error"]["message"].lower()
    db.expire_all()
    assert db.get(UserSession, token) is None


def test_deleting_user_cascades_to_sessions(
    auth_client: TestClient, db: Session, demo_user: User
) -> None:
    token = auth_client.cookies["session"]
    db.delete(db.get(User, demo_user.id))
    db.commit()
    assert db.get(UserSession, token) is None
