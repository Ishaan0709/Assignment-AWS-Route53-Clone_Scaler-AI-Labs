# Progress

Handoff note for the Route 53 clone. Phases 1–5 are accepted and pushed on `main`. This file is the place to resume from if a later session is long.

## Done (Phases 1–5)

| Phase | What landed |
| --- | --- |
| 1 | Next.js 15 (App Router, strict TypeScript) and FastAPI, Cloudscape, TanStack Query, Vitest, Playwright, Ruff, pytest, GitHub Actions |
| 2 | SQLite models: users, sessions, hosted zones, DNS records, record values, tags. WAL + foreign keys. Alembic not used; `create_all` on startup |
| 3 | Cookie session auth, hosted-zone CRUD (search, sort, pagination, default NS/SOA, tags, non-empty delete guard), record CRUD for all 10 stored types, per-type validators, CNAME rules, alias, routing policies, bulk delete, BIND import/export |
| 4 | Console shell (top nav, side nav, breadcrumbs, flashbar, bottom bar), IAM-style login, route guard, theme toggle persisted in `localStorage` (OS preference when nothing is stored) |
| 5 | Hosted zones list (server-side filter, sort, pagination, preferences), create page, edit and delete modals, zone detail header and details panel. Seeded `--many` data (35 zones) so pagination is visible |

Accepted test counts at the end of Phase 5:

- Backend: 268 pytest
- Frontend: 73 vitest
- Playwright: 31 (login, shell, hosted zones). Screenshot specs are opt-in via `SCREENSHOTS=1` and are not part of that count

`HEAD` at the Phase 5 gate: `5bf8632` (`test(e2e): assert the sort request params when sorting by record count`). CI was green.

## Known gaps (before Phase 6)

- Zone detail has no records table, tabs, tag editor, or record create/edit/delete UI. The API for all of that already exists.
- Nav stubs (Dashboard, Health checks, Traffic policies, Policy records, Resolver, Profiles, Domains) render `PagePlaceholder`, not the shared Coming Soon page.
- Bonus UI is not wired: zone-file import modal, export downloads, keyboard shortcuts, density toggle, bulk select on zones. Dark mode works; the login page and a few custom shells still use hand-picked colors.
- Record-list preferences key is reserved (`r53.density` exists) but density is not applied yet.

## Conventions

- Commits: Conventional Commits, small, pushed to `origin/main`. Do not amend or force-push.
- Backend: routers stay thin; rules live in `backend/app/services/` (`validators.py`, `domain.py`, `record_service.py`, `zone_service.py`, `bind_io.py`). Errors are `{ error: { code, message, fields } }`.
- Frontend: no `any`. One hook module per resource (`useZones`, `useAuth`, `useNotifications`, `useTheme`, `usePersistedState`). API access only through `lib/api.ts`. Shared types in `types/api.ts` mirror the Pydantic schemas.
- Tables: Cloudscape `Table` with `stickyHeader`. The sticky header duplicates column headers; end-to-end tests click the first `th` (`clickableColumnHeader` in `frontend/e2e/zones.spec.ts`) and assert on the accessible `columnheader`.
- List state is server-side (filter, sort, page). `CollectionPreferences` persist in `localStorage`. Mutations invalidate the React Query keys they affect.
- Client validation mirrors `services/validators.py` and `services/domain.py`. Server `fields` map onto the same inputs.
- Tests: pytest for the backend module you changed, Vitest for the frontend file you changed, then before a commit the full frontend gate (`vitest`, `tsc --noEmit`, `eslint`, `prettier`). Playwright, `next build`, and full pytest run at the end of a phase, not while typing.
- Playwright runs against the production build in CI (`next build` + `next start`). Do not point it at `next dev`.
- Demo login: account `123456789012`, user `admin`, password `admin123`.
- No secrets in git. Line endings are LF (`.gitattributes`).

## Scratch files

`r53_inspect.py`, `r53_http_auth.py`, `r53_http_all.py`, and `r53_shots.mjs` were temp scripts under the OS temp directory, not part of this repo, so there was nothing to commit for that cleanup. They have been deleted.
