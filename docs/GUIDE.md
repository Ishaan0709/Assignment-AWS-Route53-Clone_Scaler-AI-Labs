AWS Route53 Clone: Complete Build Guide
A start-to-finish plan covering every requirement of the assignment, so you never need to reopen the PDF.
---
0. The assignment in one page
Objective: Build a functional clone of the AWS Route53 console with persistent storage and a backend API. The focus is the Route53 user experience and workflows, not real DNS. UI and UX must match the original: look and feel "exactly the same".
Stack (mandatory): Next.js (TypeScript) frontend, FastAPI backend, SQLite database.
Required scope
Area	Requirement
Authentication	Simple mocked auth: Login, Logout, Session persistence. IAM, AWS accounts, Organizations, Billing may be mocked
Hosted Zones	Full CRUD: View, Search, Create, Edit, Delete. Persist in SQLite
DNS Records	Full CRUD inside a hosted zone: View, Search, Create, Edit, Delete. Types: A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA. Persist in SQLite
Route53 experience	Navigation structure, hosted zone management, DNS record management, tables, forms, search, filters, pagination, modals, notifications
Mocked sections	Dashboard, Traffic Policies, Health Checks, Resolver, Profiles: a "Coming Soon" page is enough
Bonus (optional)	Import BIND zone files, export as JSON or BIND, Dark Mode, Keyboard Shortcuts, Bulk Operations
Deliverables
GitHub repo with `frontend/` and `backend/`.
README with: setup instructions, architecture overview, database schema, API overview.
A hosted, working demo link.
Evaluation criteria: UI similarity to Route53, frontend engineering quality, backend/API design, database design, code quality and maintainability, documentation, overall completeness.
> **Strategy:** UI similarity is listed first and is the hardest to fake. Spend about 40% of your time on it. Do every bonus item, since "overall completeness" rewards it. Keep the code clean, because graders read it.
---
1. Decisions to make up front
Decision	Choice	Why
UI library	Cloudscape Design System (`@cloudscape-design/components`)	It is the open-source design system AWS uses for the console, so tables, forms, modals, flashbars, side nav, pagination and property filters match natively
Next.js	14 or 15, App Router, TypeScript strict	Modern, expected
Data fetching	TanStack Query (React Query)	Caching, loading and error states, invalidation after mutations
Forms	react-hook-form + zod (or Cloudscape controlled inputs with a small validator)	Clean validation, shared types
Backend	FastAPI, Pydantic v2, SQLAlchemy 2.0	Typed, auto OpenAPI docs
DB	SQLite with `PRAGMA foreign_keys=ON`	Required. Use WAL mode for concurrency
Migrations	Alembic (bonus) or `create_all` plus seed script	Alembic scores extra on DB design
Auth	Session token in an httpOnly cookie, stored in a `sessions` table	Real session persistence, secure, simple
Cross-origin	Next.js `rewrites()` proxy `/api/*` to the backend	Same-origin cookies, no CORS pain
Tests	pytest (backend), Vitest + React Testing Library (a few), optional Playwright smoke test	Shows engineering quality
Tooling	ESLint, Prettier, ruff, mypy or pyright, pre-commit	Code-quality points
---
2. Repository layout
```
route53-clone/
├── README.md
├── docker-compose.yml
├── .gitignore
├── docs/
│   ├── screenshots/
│   ├── er-diagram.png
│   └── architecture.png
├── backend/
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── alembic/ (optional)
│   ├── app/
│   │   ├── main.py            # app factory, middleware, routers, startup seed
│   │   ├── core/
│   │   │   ├── config.py      # pydantic-settings (DB URL, secret, cookie flags)
│   │   │   ├── security.py    # password hashing, session token
│   │   │   └── errors.py      # custom exceptions + handlers
│   │   ├── db/
│   │   │   ├── session.py     # engine, SessionLocal, get_db, PRAGMAs
│   │   │   └── base.py
│   │   ├── models/            # user.py, session.py, hosted_zone.py, dns_record.py, tag.py
│   │   ├── schemas/           # Pydantic request/response models
│   │   ├── routers/           # auth.py, hosted_zones.py, records.py, bind.py
│   │   ├── services/          # zone_service.py, record_service.py, validators.py, bind_io.py
│   │   ├── deps.py            # get_current_user dependency
│   │   └── seed.py
│   └── tests/
│       ├── conftest.py        # in-memory SQLite, client, auth fixture
│       ├── test_auth.py
│       ├── test_zones.py
│       ├── test_records.py
│       └── test_validators.py
└── frontend/
    ├── package.json, next.config.mjs, tsconfig.json
    ├── app/
    │   ├── layout.tsx, providers.tsx, globals.css
    │   ├── login/page.tsx
    │   └── (console)/
    │       ├── layout.tsx                    # TopNav + AppLayout + SideNav + Flashbar
    │       ├── dashboard/page.tsx            # Coming Soon
    │       ├── hostedzones/page.tsx          # list
    │       ├── hostedzones/create/page.tsx
    │       ├── hostedzones/[zoneId]/page.tsx # detail with tabs
    │       ├── hostedzones/[zoneId]/records/create/page.tsx
    │       ├── hostedzones/[zoneId]/records/[recordId]/edit/page.tsx
    │       ├── health-checks/page.tsx, traffic-policies/page.tsx
    │       ├── resolver/page.tsx, profiles/page.tsx   # Coming Soon
    ├── components/
    │   ├── layout/ (TopBar, SideNav, ConsoleShell, Breadcrumbs)
    │   ├── zones/ (ZonesTable, ZoneForm, DeleteZoneModal, EditZoneModal)
    │   ├── records/ (RecordsTable, RecordForm, DeleteRecordsModal, ImportModal)
    │   └── common/ (ComingSoon, EmptyState, NotificationProvider, ErrorBoundary)
    ├── lib/ (api.ts, queryClient.ts, validators.ts, format.ts)
    ├── hooks/ (useZones, useRecords, useAuth, useNotifications, useHotkeys)
    └── types/ (api.ts)
```
---
3. Phase 1: Environment setup
```bash
mkdir route53-clone && cd route53-clone && git init

# Backend
mkdir backend && cd backend
python -m venv .venv && source .venv/bin/activate
pip install fastapi "uvicorn[standard]" sqlalchemy pydantic pydantic-settings \
    bcrypt python-multipart dnspython pytest httpx ruff alembic
pip freeze > requirements.txt
cd ..

# Frontend
npx create-next-app@latest frontend --typescript --eslint --app --no-tailwind --src-dir=false
cd frontend
npm i @cloudscape-design/components @cloudscape-design/global-styles \
      @cloudscape-design/collection-hooks @tanstack/react-query zod
npm i -D vitest @testing-library/react prettier
```
`next.config.mjs` (proxy so cookies stay same-origin):
```js
const API = process.env.API_URL || "http://localhost:8000";
export default {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
};
```
Cloudscape requires client components: put `"use client"` at the top of any file that imports from it, and import `@cloudscape-design/global-styles/index.css` once in `app/layout.tsx`.
---
4. Phase 2: Database design
SQLite, SQLAlchemy 2.0 models. Enable on every connection: `PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;`
```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  account_id    TEXT NOT NULL,            -- mocked 12-digit AWS account id
  username      TEXT NOT NULL UNIQUE,     -- mocked IAM user
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,            -- random 32-byte urlsafe token
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME NOT NULL
);
CREATE INDEX ix_sessions_user ON sessions(user_id);

CREATE TABLE hosted_zones (
  id            TEXT PRIMARY KEY,          -- 'Z' + 20 uppercase alnum, e.g. Z0123456789ABCDEFGHIJ
  name          TEXT NOT NULL,             -- normalized: lowercase, trailing dot
  type          TEXT NOT NULL CHECK (type IN ('public','private')),
  description   TEXT,
  vpc_id        TEXT,                      -- private zones only (mocked)
  vpc_region    TEXT,
  created_by    TEXT NOT NULL DEFAULT 'Route 53',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (name, type)
);
CREATE INDEX ix_zones_name ON hosted_zones(name);

CREATE TABLE dns_records (
  id                      INTEGER PRIMARY KEY,
  zone_id                 TEXT NOT NULL REFERENCES hosted_zones(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,   -- FQDN, lowercase, trailing dot ('' apex stored as zone name)
  type                    TEXT NOT NULL CHECK (type IN ('A','AAAA','CNAME','TXT','MX','NS','PTR','SRV','CAA','SOA')),
  ttl                     INTEGER,         -- NULL when alias
  routing_policy          TEXT NOT NULL DEFAULT 'Simple',  -- Simple|Weighted|Latency|Failover|Geolocation|Multivalue
  set_identifier          TEXT,            -- required for non-Simple policies
  weight                  INTEGER,
  is_alias                BOOLEAN NOT NULL DEFAULT 0,
  alias_target            TEXT,
  evaluate_target_health  BOOLEAN,
  health_check_id         TEXT,
  comment                 TEXT,
  is_default              BOOLEAN NOT NULL DEFAULT 0,      -- apex NS/SOA created with the zone
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (zone_id, name, type, set_identifier)
);
CREATE INDEX ix_records_zone_type ON dns_records(zone_id, type);
CREATE INDEX ix_records_zone_name ON dns_records(zone_id, name);

CREATE TABLE record_values (               -- one row per value (normalized, ordered)
  id         INTEGER PRIMARY KEY,
  record_id  INTEGER NOT NULL REFERENCES dns_records(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  value      TEXT NOT NULL
);
CREATE INDEX ix_values_record ON record_values(record_id);

CREATE TABLE tags (
  id       INTEGER PRIMARY KEY,
  zone_id  TEXT NOT NULL REFERENCES hosted_zones(id) ON DELETE CASCADE,
  key      TEXT NOT NULL,
  value    TEXT NOT NULL DEFAULT '',
  UNIQUE (zone_id, key)
);
```
Design notes for the README: UUID-style `Z...` ids mimic AWS; `record_values` is normalized so multi-value records (several A addresses, several TXT strings) are queryable; cascading deletes keep data consistent; `record_count` is computed (`COUNT(*)`) rather than stored, so it can't drift; composite indexes back the list and filter queries.
Default records on zone creation (exactly what Route53 does):
`NS` at the apex, TTL 172800, four values like `ns-1234.awsdns-12.org.`, `ns-567.awsdns-34.com.`, `ns-890.awsdns-56.net.`, `ns-12.awsdns-01.co.uk.` (generate randomly per zone).
`SOA` at the apex, TTL 900, value `ns-1234.awsdns-12.org. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400`.
Both flagged `is_default=1`. A fresh zone therefore shows Record count = 2, just like AWS.
Private zones get no awsdns NS values in real AWS, but the clone can still create an SOA and NS for consistency.
---
5. Phase 3: Backend
5.1 Conventions
Prefix all routes with `/api`. Version it if you like (`/api/v1`).
Return JSON with consistent error shape: `{"error": {"code": "InvalidInput", "message": "...", "fields": {"name": "..."}}}`.
Status codes: `200` read/update, `201` create, `204` delete, `400` bad request, `401` unauthenticated, `404` not found, `409` conflict (duplicate, CNAME clash, zone not empty), `422` schema validation.
Every router except `/auth/login` depends on `get_current_user`.
Pagination response: `{"items": [...], "total": 42, "page": 1, "page_size": 10}`.
Use service-layer functions (`zone_service`, `record_service`) so routers stay thin. Pydantic schemas separate from ORM models.
5.2 Authentication (mocked, with real session persistence)
Endpoint	Behavior
`POST /api/auth/login`	Body: `account_id`, `username`, `password`. Verify against seeded user (bcrypt). Create a `sessions` row with a random token and 7-day expiry. Set cookie `session` (`HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`). Return the user
`POST /api/auth/logout`	Delete the session row, clear the cookie. `204`
`GET /api/auth/me`	Return the current user or `401`. The frontend calls this on load, which is how session persistence works across refreshes
Seed user: account id `123456789012`, username `admin`, password `admin123` (put these on the login page hint and in the README).
5.3 Hosted zones

Endpoint	Details
`GET /api/hostedzones`	Query: `q` (matches name, description, id, type), `type`, `name`, `page`, `page_size`, `sort`, `order`. Each item includes `record_count`
`POST /api/hostedzones`	Body: `name`, `type`, `description?`, `vpc_id?`, `vpc_region?`, `tags[]`. Validates domain, normalizes, rejects duplicates with `409`, generates id, creates default NS and SOA in one transaction. Private zones require a VPC
`GET /api/hostedzones/{id}`	Zone plus `record_count`, tags, name servers
`PUT /api/hostedzones/{id}`	Edit. Route53 only allows editing the comment/description (and tags). The name and type are immutable, so show them read-only. This mirrors real behavior and is a point of accuracy
`DELETE /api/hostedzones/{id}`	Real Route53 refuses to delete a zone that still has non-default records (`HostedZoneNotEmpty`). Implement that with `409` and a clear message. Also support `?force=true` for bulk or testing if you want
`PUT /api/hostedzones/{id}/tags`	Replace tag set
Domain-name validation: lowercase, labels 1 to 63 chars, total 253, characters `a-z 0-9 -`, labels cannot start or end with `-`, at least one dot, trailing dot stripped then re-added on storage. Display without the trailing dot in the table but keep it for the zone name in some detail views, as AWS does.
5.4 DNS records
Endpoint	Details
`GET /api/hostedzones/{id}/records`	Query: `q` (name or value), `type`, `routing_policy`, `alias`, `page`, `page_size`, `sort`, `order`. Default order like Route53: apex NS, SOA first, then alphabetical by name then type
`POST /api/hostedzones/{id}/records`	Create one record, or an array for the "Add another record" quick-create flow
`PUT /api/hostedzones/{id}/records/{rid}`	Edit. Name and type change allowed except on default NS/SOA (only TTL and values editable there; the SOA may be edited too)
`DELETE /api/hostedzones/{id}/records/{rid}`	`409` if `is_default` (AWS disallows deleting the apex NS and SOA)
`POST /api/hostedzones/{id}/records/bulk-delete`	Body `{"ids": [...]}`. Skips or rejects defaults, returns per-id result
Per-type validation (`services/validators.py`, unit test every rule):
Type	Value rule
A	One IPv4 per line (`ipaddress.IPv4Address`)
AAAA	One IPv6 per line
CNAME	Exactly one valid hostname. Cannot exist at the zone apex. Cannot coexist with any other record type at the same name. No other record can be created at a name that has a CNAME
TXT	Each value wrapped in double quotes, each string up to 255 characters (longer values must be split into multiple quoted strings); total up to 4000
MX	`priority hostname`, priority 0 to 65535, e.g. `10 mail.example.com.`
NS	One hostname per line
PTR	One hostname
SRV	`priority weight port target`, each of the first three 0 to 65535, e.g. `10 5 5060 sip.example.com.`
CAA	`flags tag "value"`, flags 0 to 255, tag in `issue`, `issuewild`, `iodef`, e.g. `0 issue "letsencrypt.org"`
SOA	Seven fields: primary NS, admin email, serial, refresh, retry, expire, minimum
Additional rules: record name must be the zone name or end with `.zone-name`; wildcard `*` allowed as first label only; TTL integer 0 to 2147483647 (default 300); duplicate `(name, type)` for Simple policy returns `409`; for Weighted routing require `set_identifier` and `weight` (0 to 255); Alias records have no TTL and an alias target (restrict alias to A, AAAA, CNAME, TXT-free types, as Route53 does).
5.5 Bonus endpoints
`POST /api/hostedzones/{id}/import` (multipart file or raw text): parse using `dnspython` (`dns.zone.from_text(text, origin=zone_name, relativize=False)`). Return a summary: `{imported, skipped, errors:[{line, message}]}`. Skip SOA and apex NS or merge. Run inside one transaction.
`GET /api/hostedzones/{id}/export?format=json|bind`: JSON (zone plus records) or BIND text (`$ORIGIN`, `$TTL`, then `name TTL IN TYPE value`). Send `Content-Disposition: attachment`.
5.6 Startup and seeding
On startup, create tables and, if empty, seed: the admin user plus 4 to 6 hosted zones (e.g. `example.com`, `acme-corp.io`, `internal.local` private, `shop.example.org`) with 15 to 30 varied records each, covering every record type, aliases, and a weighted pair. Enough data (more than 25 zones across seeds, or a `python -m app.seed --many`) makes pagination visibly work in the demo.
5.7 Backend tests (write at least these)
Auth: login success/failure, `me` without cookie returns 401, logout invalidates the session.
Zones: create adds default NS and SOA; duplicate returns 409; search; edit only changes description; delete non-empty returns 409; delete after clearing succeeds.
Records: CRUD for each type; each validator's valid and invalid cases; CNAME conflict rules; cannot delete default NS/SOA; pagination and filter; bulk delete.
BIND import and export round trip.
Run `ruff` and `pytest` in CI (GitHub Actions workflow) for a polished repo.
---
6. Phase 4: Frontend
6.1 Foundation
`providers.tsx`: `QueryClientProvider` and the notification (flashbar) provider.
`lib/api.ts`: typed `fetch` wrapper with `credentials: "include"`, JSON error parsing into an `ApiError` class, automatic redirect to `/login` on `401`.
`types/api.ts`: `HostedZone`, `DnsRecord`, `Paginated<T>`, `RecordType` union, mirrored from backend schemas.
Route protection: `(console)/layout.tsx` calls `useAuth()` (`/api/auth/me`); show a spinner while loading; redirect to `/login` on 401. Optionally add `middleware.ts` that checks for the cookie for instant redirects.
Theme: `applyMode(Mode.Dark)` from `@cloudscape-design/global-styles`, persisted in `localStorage`.
6.2 Console shell (the most visible similarity point)
Top bar (dark navy, `#0f1b2a`, sticky, `id="top-nav"`): AWS logo on the left, a "Services" menu button, a search field ("Search", shortcut hint `[Alt+S]`), then on the right: a notifications bell, help, settings (theme toggle), the region selector (shows Global, because Route53 is global), and the account menu showing `admin @ 1234-5678-9012` with Sign out. Use Cloudscape `TopNavigation` and style it with the dark variant, or a custom header, and pass `headerSelector="#top-nav"` to `AppLayout`.
Left navigation (Cloudscape `SideNavigation`, `AppLayout navigation`): the Route53 structure:
Route 53 (title) with a Dashboard link
Hosted zones
Health checks
Traffic flow: Traffic policies, Policy records
Resolver: VPCs, Inbound endpoints, Outbound endpoints, Rules, Query logging
Profiles
Domains: Registered domains, Requests
Divider, then a Documentation external link
Only Hosted zones is functional; every other link goes to its Coming Soon page. Highlight the active item. Collapse into a hamburger on small screens (AppLayout handles this).
Breadcrumbs on every page: `Route 53 > Hosted zones > example.com`. Footer is not needed in the console; AWS shows the CloudShell and Feedback bar at the bottom left. Add a simple dark bottom strip with "CloudShell", "Feedback" and copyright text for extra fidelity.
Flashbar notifications at the top of the content area: success (green), error (red), info (blue), dismissible, auto-dismiss after about 8 seconds, stackable. Wrap in a `useNotifications()` hook exposing `notify.success(title, content)`.
6.3 Login page
Mimic the AWS IAM user sign-in: centered white card on light gray, AWS logo, "Sign in as IAM user", fields Account ID or alias, IAM user name, Password, a "Remember this account" checkbox, an orange/primary Sign in button, validation messages, and a footer with links. Show a visible hint box with the demo credentials. On success go to `/hostedzones`. Persist the session via the cookie so refresh keeps you signed in. Logout from the account menu returns to `/login` with an info flash.
6.4 Hosted zones list page (`/hostedzones`)
Match Route53 exactly:
Header: Hosted zones with a count badge `(N)` and an "Info" link. Action buttons: View details, Edit, Delete (enabled depending on selection) and primary Create hosted zone.
Table (Cloudscape `Table`, single selection radio): columns Hosted zone name, Type (Public/Private), Created by, Record count, Description, Hosted zone ID. Zone name is a link to the detail page. Sortable columns, resizable columns, sticky header.
Filter: `PropertyFilter` with placeholder Filter hosted zones by property or value; filtering properties: name, type, description, id. Also a text-only fallback. Debounce, and send as `q` plus structured params to the API.
`Pagination` (default page size 10; `CollectionPreferences` for 10/20/50 and column visibility, wrap lines, striped rows).
Empty state ("No hosted zones" with a Create hosted zone button) and a no-matches state with "Clear filter". Loading skeleton or `loadingText`. Error state with Retry.
Row actions: View details, Edit (opens modal), Delete (opens modal).
6.5 Create hosted zone (`/hostedzones/create`)
A full page form (not a modal), as in AWS:
Breadcrumb and title Create hosted zone with description text.
Container "Hosted zone configuration": Domain name (hint: "Enter the fully qualified domain name, e.g. example.com"), Description (optional, max 256 chars), Type (radio: Public hosted zone, Private hosted zone). Private reveals Region and VPC ID selects.
Container "Tags": key/value rows with Add new tag (limit 50).
Sticky footer: Cancel and primary Create hosted zone. Inline field validation, and API errors (409 duplicate) mapped to the field.
On success navigate to the zone's detail page and show a green flash: "example.com was successfully created."
6.6 Edit hosted zone
Modal (or page) titled Edit hosted zone. Domain name and type read-only, Description editable, tags editable. Save then flash "Hosted zone updated successfully".
6.7 Delete hosted zone
Modal Delete hosted zone. If the zone has non-default records, show an error alert ("The hosted zone contains records other than NS and SOA. Delete those records first.") and disable the button, mirroring AWS. Otherwise show a warning with the zone name and require typing `delete` to enable the red/primary Delete button. Flash on success.
6.8 Hosted zone detail (`/hostedzones/[zoneId]`)
Header with the zone name and Info, buttons: Delete zone, Test record (mock modal), Configure query logging (mock), plus Export and Import zone file (bonus).
A Hosted zone details expandable container (name, type, ID, description, record count, name servers).
Tabs: Records (N), DNSSEC signing (Coming Soon placeholder), Hosted zone tags (N), and the tag editor.
Records tab table, columns: checkbox, Record name, Type, Routing policy, Differential, Alias, Value/Route traffic to (multi-values stacked on separate lines), TTL (seconds), Health check ID, Evaluate target health. Default NS/SOA rows have a disabled-style delete.
Toolbar: Delete record, Import zone file, Edit record, primary Create record. Filters: PropertyFilter Filter records by property or value, a Type select with All types and each type, a Routing policy select, an Alias filter.
Multi-select with select-all, pagination (10/50/100), preferences, empty and no-match states.
Tab bodies lazily load.
6.9 Create or edit record
Route53's Quick-create form on its own page or a drawer:
Record name: input with the zone suffix shown (`[ subdomain ] .example.com`), hint about leaving blank for the root.
Record type select (all 9 supported types plus the default SOA read-only), with helper text per type.
Alias toggle (for A, AAAA, CNAME). When on, show Route traffic to (a select of mocked AWS endpoints: CloudFront, ELB, S3 website, API Gateway, another record) and Evaluate target health toggle, and hide TTL and Value.
Value multi-line textarea (one per line) with a per-type placeholder and example that updates when the type changes.
TTL (seconds) with quick presets (1m, 5m, 1h, 1d) and the 300 default.
Routing policy select (Simple, Weighted, Latency, Failover, Geolocation, Multivalue answer); implement Simple and Weighted completely, and store set identifier and weight; other policies reveal their mock fields.
Add another record (quick create supports several records at once) with a remove button on each.
Footer: Cancel and Create records; edit page title Edit record with Save.
Validation messages identical in tone to AWS; map server `fields` errors onto inputs.
6.10 Delete records
Modal "Delete records?" listing the selected records (name and type), a warning, Cancel and Delete. Supports bulk. Flash "1 record deleted" or "3 records deleted". Block default NS/SOA with an explanatory alert.
6.11 Mocked pages
Dashboard, Traffic Policies, Health Checks, Resolver, Profiles (and the other nav stubs) render one shared `ComingSoon` component: title, breadcrumb, a Cloudscape `Box`/`Container` with an icon and "This feature is coming soon" text, and a button back to Hosted zones. The Dashboard at `/` may also show quick links. One component, reused, keeps the code DRY.
6.12 Quality details graders notice
Loading, empty, error and success states on every data view.
Optimistic or invalidated cache after each mutation (React Query `invalidateQueries`).
Accessible: labels, `ariaLabel`s, focus management in modals, keyboard operable (Cloudscape provides most).
Responsive layout.
No `any`; strict TS; shared types; small components; hooks per resource; constants in one file.
Disable submit while pending and prevent double submits.
Confirmation before destructive actions; Escape closes modals.
Page titles via `metadata` (`Hosted zones | Route 53 Global View`) and the AWS-like favicon.
Consistent date formatting (`Oct 9, 2026, 14:30 (UTC+05:30)`).
---
7. Bonus features, all of them
Bonus	Implementation
BIND import	`Import zone file` modal with file upload or paste area, "Parse" preview table showing records to import and errors, then Confirm. Backend uses dnspython
Export	Dropdown button Export with JSON and BIND options, downloads a file named `example.com.zone` or `.json`
Dark mode	Toggle in settings menu, `applyMode`, persisted, respects `prefers-color-scheme` on first load
Keyboard shortcuts	`/` focus filter, `c` create (hosted zone or record by page), `g h` go to Hosted zones, `?` open a Shortcuts help modal, `Esc` closes. Implement in `useHotkeys` and ignore when typing in inputs
Bulk operations	Multi-select, bulk delete with confirmation, and bulk delete endpoint with per-item results
Extras	Density toggle (comfortable/compact), CSV export, Alembic migrations
---
8. Phase 5: Deployment (the "hosted working link")
Frontend: Vercel. Set `API_URL` to the backend's public URL. The `rewrites()` proxy keeps cookies first-party.
Backend: Render, Railway or Fly.io with a Dockerfile. SQLite needs a persistent volume (Railway or Fly volumes; Render's persistent disk is paid). On free tiers with an ephemeral disk, rely on the startup seed so the demo always works, and say so in the README.
Backend `Dockerfile`: `python:3.12-slim`, install requirements, `CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
Environment variables: `DATABASE_URL`, `SECRET_KEY`, `COOKIE_SECURE=true`, `ALLOWED_ORIGINS`.
Include `docker-compose.yml` that runs both services locally with one command.
Smoke-test the live URL: login, create a zone, add every record type, edit, delete, refresh to prove persistence.
---
9. Phase 6: README (a documentation score on its own)
Sections, in order:
Title, one-paragraph summary, screenshots or a demo GIF, and the live demo URL with credentials.
Features checklist mapped to the assignment (Auth, Hosted Zones CRUD, Records CRUD, UX elements, mocked pages, each bonus).
Tech stack table.
Setup instructions: prerequisites (Node 20+, Python 3.11+), backend (`venv`, `pip install`, `uvicorn app.main:app --reload`), frontend (`npm i`, `npm run dev`), env vars, seed command, running tests, Docker option.
Architecture overview: diagram of Browser, Next.js, rewrite proxy, FastAPI (router, service, model layers), SQLite; explain auth flow and data flow.
Database schema: ER diagram plus the table list and design rationale.
API overview: table of method, path, description, auth; link to the Swagger UI at `/docs`.
Record validation rules table.
Design decisions and trade-offs (Cloudscape, cookie sessions, computed record count, immutable zone name).
Testing, project structure, known limitations, and future work.
---
10. Suggested timeline (about 7 days; compress as needed)
Day	Work
1	Repo, tooling, DB models, auth endpoints, seed
2	Hosted zone and record endpoints, validators, tests
3	Console shell, login, route protection, notifications
4	Hosted zones list, create, edit, delete
5	Zone detail, records table, create/edit/delete record forms
6	Mocked pages, bonuses (import, export, dark mode, hotkeys, bulk)
7	Polish against real Route53 screenshots, deployment, README, final QA
---
11. Final full-marks checklist
Authentication: login, logout, refresh keeps session, unauthenticated users redirected.
Hosted zones: list, search, create, edit (description and tags), delete (with non-empty guard and typed confirmation), persisted in SQLite, record counts correct, default NS and SOA created.
Records: A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA all creatable with validation; view, search, filter by type, create, edit, delete, bulk delete; persisted.
Route53 experience: nav structure, tables, forms, search, filters, pagination, modals, flash notifications, breadcrumbs, empty and loading states.
Mocked sections: Dashboard, Traffic Policies, Health Checks, Resolver, Profiles each reachable with Coming Soon.
Bonus: BIND import, JSON and BIND export, dark mode, keyboard shortcuts, bulk operations.
Deliverables: public GitHub repo with `frontend/` and `backend/`, README with setup, architecture, schema, API; working hosted link.
Quality: tests pass, linters clean, no console errors, no hard-coded secrets, meaningful commit history (small, descriptive commits across the days), `.env.example` files committed.
> **Final tip:** open the real Route53 console (or screenshots of it) side by side with your app and compare spacing, labels, button order and wording line by line. Matching small details like column order, helper texts, and flash message wording is what separates a good clone from a full-marks clone.
If you'd like, I can now generate the actual code, starting with the FastAPI backend (models, schemas, routers, validators, seed, tests), then the Next.js frontend page by page.