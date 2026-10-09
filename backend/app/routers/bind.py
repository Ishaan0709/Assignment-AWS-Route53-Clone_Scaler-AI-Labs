from typing import Annotated

from fastapi import APIRouter, File, Form, Query, UploadFile
from fastapi.responses import Response

from app.core.errors import BadRequestError
from app.deps import CurrentUser, DbSession
from app.schemas.bind import ExportFormat, ImportSummary
from app.schemas.common import ErrorResponse
from app.services import bind_io, record_service, zone_service

router = APIRouter(prefix="/hostedzones/{zone_id}", tags=["zone files"])

_NOT_FOUND = {404: {"model": ErrorResponse, "description": "Hosted zone not found"}}
_UNAUTHORIZED = {401: {"model": ErrorResponse, "description": "Not signed in"}}


async def _read_zone_text(file: UploadFile | None, text: str | None) -> str:
    if file is not None:
        raw = await file.read()
        if len(raw) > bind_io.MAX_IMPORT_BYTES:
            raise BadRequestError(
                "Zone file is too large (limit 1 MB).", fields={"file": "Too large."}
            )
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise BadRequestError(
                "Zone file must be UTF-8 text.", fields={"file": "Not a text file."}
            ) from exc
    if text and text.strip():
        return text
    raise BadRequestError(
        "Upload a zone file or paste its contents.", fields={"file": "Zone file is required."}
    )


@router.post(
    "/import",
    response_model=ImportSummary,
    summary="Import BIND zone file",
    description=(
        "Send a multipart form with either `file` (upload) or `text` (pasted contents). "
        "With `dry_run=true` nothing is written and the response previews what would be "
        "imported. SOA and apex NS entries are skipped; duplicates of existing records are "
        "skipped; invalid lines are reported with their line number."
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Missing or unreadable zone file"},
        **_NOT_FOUND,
        **_UNAUTHORIZED,
    },
)
async def import_zone_file(
    zone_id: str,
    db: DbSession,
    _: CurrentUser,
    file: Annotated[UploadFile | None, File(description="BIND zone file")] = None,
    text: Annotated[str | None, Form(description="Pasted zone file contents")] = None,
    dry_run: Annotated[bool, Form()] = False,
) -> ImportSummary:
    zone = zone_service.get_zone(db, zone_id)
    contents = await _read_zone_text(file, text)
    return bind_io.import_zone_text(db, zone, contents, dry_run=dry_run)


@router.get(
    "/export",
    summary="Export hosted zone",
    description=(
        "Downloads the zone and its records as JSON (`format=json`), a BIND zone file "
        "(`format=bind`), or CSV (`format=csv`). The response carries a "
        "`Content-Disposition: attachment` header."
    ),
    responses={
        200: {
            "content": {"application/json": {}, "text/plain": {}, "text/csv": {}},
            "description": "File download",
        },
        **_NOT_FOUND,
        **_UNAUTHORIZED,
    },
)
def export_zone(
    zone_id: str,
    db: DbSession,
    _: CurrentUser,
    format: Annotated[ExportFormat, Query()] = "json",
) -> Response:
    zone = zone_service.get_zone(db, zone_id)
    records = record_service.all_records(db, zone)
    filename = bind_io.export_filename(zone, format)
    if format == "bind":
        body = bind_io.export_bind(zone, records)
        media_type = "text/plain; charset=utf-8"
    elif format == "csv":
        body = bind_io.export_csv(zone, records)
        media_type = "text/csv; charset=utf-8"
    else:
        body = bind_io.export_json(zone, records)
        media_type = "application/json"
    return Response(
        content=body,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
