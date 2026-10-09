# Audit

Checked against `docs/ASSIGNMENT.md` and `docs/GUIDE.md` on 9 October 2026. The live demo is https://frontend-lyart-two-57.vercel.app (account `123456789012`, user `admin`, password `admin123`). The API is https://route53-clone-api-production-2895.up.railway.app/docs.

## Assignment

| Requirement | Status |
| --- | --- |
| Login, logout, session kept across refresh | Done. HttpOnly session cookie. |
| Unauthenticated users sent to login | Done. |
| Hosted zones: view, search, create, edit, delete, SQLite | Done. Delete of a non-empty zone is blocked. Empty zones need the word `delete`. |
| Records: A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA | Done, with validation. SOA is created with the zone and is not a user type. |
| View, search, create, edit, delete records | Done. |
| Navigation, tables, forms, search, filters, pagination, modals, notifications | Done with Cloudscape. |
| Dashboard, traffic policies, health checks, resolver, profiles | Done. Each route renders Coming Soon. Domain pages do too. |
| BIND import | Done. Parse preview includes a per-type breakdown, then Confirm. |
| Export JSON or BIND | Done, plus CSV. |
| Dark mode | Done. Light unless a saved choice or the OS preference says dark. Login and menus use Cloudscape color tokens. The top bar stays navy. |
| Keyboard shortcuts | Done. `/`, `c`, `g` then `h`, `?`, `Esc`. Ignored while typing or while a dialog is open. |
| Bulk operations | Done for records and for hosted zones. Several zones show a result per zone. |
| README: setup, architecture, schema, API | Done. |
| Hosted working link | Done. Login, create zone, create a record, refresh, logout passed against the live URL. |

## Guide extras

| Extra | Status |
| --- | --- |
| Density toggle | Done. Comfortable is the default. Compact is stored in `r53.density`. |
| CSV export | Done. Export menu item and `format=csv`. |
| Alembic | Done. File databases run `0001_initial`. A database created earlier with `create_all` is stamped so existing rows stay. Tests still use an in-memory database. |
| Docker Compose | Written. `docker compose up` was not run: the Docker engine was not running on this machine. |

## Tests

| Suite | Count |
| --- | --- |
| Backend pytest | 271 (98% coverage) |
| Frontend Vitest | 170 |
| Playwright | 41, one worker |

The latest GitHub Actions run on `docs: record the bonus features, test counts, and live demo` finished green (Python 3.12, Python 3.13, frontend, Playwright). Older commits on 9 October stay red because each push cancelled the run in progress, and the commits before the lockfile fix failed Prettier or could not start Vitest. Those historical checks are not the current tree.

## Not the same as production Route 53

Cloudscape matches the console's components, spacing and wording more closely than a custom layout would. It is not a pixel copy of the current AWS console: the account menu, billing and DNSSEC signing are mocked, and latency, failover and geolocation details are stored inside the set id.
