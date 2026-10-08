import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.db.session import SessionLocal, create_all
from app.routers import auth, bind, hosted_zones, records
from app.seed import seed_if_empty

API_PREFIX = "/api"

log = logging.getLogger(__name__)

TAGS_METADATA = [
    {"name": "auth", "description": "Mocked IAM sign-in backed by a real `sessions` table."},
    {"name": "hosted zones", "description": "Hosted zone CRUD, search, pagination and tags."},
    {"name": "records", "description": "DNS record CRUD inside a hosted zone, with validation."},
    {"name": "zone files", "description": "BIND import with preview, JSON/BIND export."},
    {"name": "meta", "description": "Service health."},
]


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    create_all()
    if settings.seed_on_startup:
        with SessionLocal() as db:
            if seed_if_empty(db):
                log.info("Database was empty; demo data seeded.")
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s: %(message)s")
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "Backend for a functional clone of the AWS Route 53 console. "
            "All routes are prefixed with `/api`; every route except `/api/auth/login` "
            "requires the `session` cookie."
        ),
        openapi_tags=TAGS_METADATA,
        docs_url="/docs",
        openapi_url=f"{API_PREFIX}/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_error_handlers(app)

    @app.get(f"{API_PREFIX}/health", tags=["meta"], summary="Health check")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": settings.app_name}

    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(hosted_zones.router, prefix=API_PREFIX)
    app.include_router(records.router, prefix=API_PREFIX)
    app.include_router(bind.router, prefix=API_PREFIX)
    return app


app = create_app()
