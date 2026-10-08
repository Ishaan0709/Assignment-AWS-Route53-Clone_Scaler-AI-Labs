"""Shared fixtures.

The environment is configured *before* ``app`` is imported so the engine is created against
an in-memory SQLite database (StaticPool) and startup seeding is disabled. Every test gets a
fresh schema.
"""

import os
from collections.abc import Iterator

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SEED_ON_STARTUP"] = "false"
os.environ["COOKIE_SECURE"] = "false"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, create_all, drop_all
from app.main import app
from app.models import User
from app.seed import DEMO_ACCOUNT_ID, DEMO_PASSWORD, DEMO_USERNAME, seed_user

LOGIN_PAYLOAD = {
    "account_id": DEMO_ACCOUNT_ID,
    "username": DEMO_USERNAME,
    "password": DEMO_PASSWORD,
}


@pytest.fixture(autouse=True)
def _fresh_database() -> Iterator[None]:
    drop_all()
    create_all()
    yield
    drop_all()


@pytest.fixture
def db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def demo_user(db: Session) -> User:
    return seed_user(db)


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_client(client: TestClient, demo_user: User) -> TestClient:
    response = client.post("/api/auth/login", json=LOGIN_PAYLOAD)
    assert response.status_code == 200, response.text
    return client
