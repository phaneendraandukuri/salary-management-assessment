# ACME Salary Management

[Live application](https://acme-salary-management-gzll.onrender.com/) ·
[Demo video](https://drive.google.com/file/d/1Y5p6oXEaPKvJWwoAWRJbR4hjZmVD9fsj/view?usp=sharing)

Deployed on Render Free with Neon PostgreSQL. The candidate confirmed live login and the
seeded employee directory. HR demo credentials are provided privately in the submission
email and are not committed to the repository. Detailed automated and browser test evidence
records local checks; it does not establish a complete hosted regression or performance test.

Salary management for ACME's HR Manager. Product scope is in [REQUIREMENTS.md](REQUIREMENTS.md).
The backend includes salary/employee validation, PostgreSQL employee creation, and paginated
create/list HTTP APIs. The React directory displays stored synthetic employees with loading, empty/error,
retry, and pagination states. A separate form creates employees, confirms success, and refreshes
the current directory page. Failed submissions retain entered values; uncertain network failures
ask you to check the directory before resubmitting. Employee-ID ordering means a new record may
appear on another page.
Salary editing is available from directory rows: select Edit salary, enter an annual amount,
and save in the existing currency. Confirmed saves refresh the current page. Cancel discards
unsaved input; selecting another employee starts a fresh editor. Uncertain updates are not
automatically retried. View history opens a separate panel with 25 changes per page, exact
salary strings, UTC timestamps, and independent loading/error/retry states. Confirmed salary
updates refresh the matching open history from page 1; failed updates do not refresh it.
The directory provides name/email search, exact country/department filters, a currency filter,
and ascending/descending sorting. Edit controls then Apply (or press Enter); the applied-query
summary identifies the displayed results. Apply and Reset return to page 1. Paging, Retry,
creation, and salary-save refresh preserve applied criteria, ignoring unapplied edits.
New employees may not match active filters. Salary sorting compares nominal amounts without
conversion; use a currency filter for same-currency comparisons.
Employees / Add Employee / Insights buttons select one workflow at a time. Hidden sections
retain drafts, directory criteria/page, salary selection, history page, and insights criteria.
Navigation is temporarily disabled during creation or salary submission; Cancel/Close retain
their existing meaning. Logout/session expiry clears all protected state. Navigation focuses
the selected section's heading. View history scrolls/focuses the selected history immediately,
including repeated selections; background refreshes do not move focus or scroll.
Insights opens on first visit with country/department filters and
currency/country/department grouping. Apply/Reset and the applied summary work separately from
the directory. Confirmed creations/salary saves refresh open insights using applied criteria;
errors do not undo write confirmations. Navigating away and back retains its state; Reset
restores defaults. Once visited, insights stays mounted and refreshes even while hidden.
Statistics display the API's exact strings and explain its currency separation/rounding.
The backend requires HR authentication for employee, salary, history and insights APIs, with
origin checks, bounded login attempts and session expiry. React checks the session before
mounting protected workflows and supports login/logout. Navigation, focus and stale-request
regression checks were performed locally with isolated synthetic data; see docs/AI_USAGE.md.

## Local setup

Use Node.js 24.x and npm (validated versions are recorded in `docs/AI_USAGE.md`).
From the repository root:

```sh
npm ci
```

Complete the PostgreSQL and HR credential setup below first. Run these commands in separate terminals:

```sh
env -u NODE_OPTIONS -u DATABASE_URL -u HR_USERNAME -u HR_PASSWORD_HASH -u SESSION_SECRET -u NODE_ENV -u PORT -u APP_ORIGIN \
  node --env-file=.env.local -e 'const {spawnSync}=require("node:child_process"); const result=spawnSync("npm",["run","dev:api"],{stdio:"inherit",env:process.env}); process.exit(result.status ?? 1)'
npm run dev:web
```

- API: `http://localhost:3000/health`, returning `{ "status": "ok" }`.
- UI: use the local URL printed by Vite (normally `http://127.0.0.1:5173`).
- The API reads the optional `PORT` environment variable, defaulting to 3000.
  For example: `PORT=3001 npm run dev:api`. `.env.example` documents the setting;
  environment files are not automatically loaded by the current API startup configuration.
- API startup requires `DATABASE_URL`, `HR_USERNAME`, `HR_PASSWORD_HASH`, `SESSION_SECRET`,
  and `APP_ORIGIN`. Add `APP_ORIGIN=http://127.0.0.1:5173` to your private `.env.local` for
  the default Vite URL; adjust it when that URL changes. Production requires an HTTPS origin.
  Migrations must be run explicitly before employee or authentication requests.
- Vite automatically loads supported frontend environment files from `apps/web`.
- In development, Vite proxies `/api` to `http://localhost:3000`. For a different API port,
  use `API_PROXY_TARGET=http://localhost:3001 npm run dev:web` (a shell environment variable).
  The UI uses relative `/api` URLs. With NODE_ENV=production, Express serves the built React
  app and API from one origin; the Vite proxy remains development-only.
- The health endpoint confirms the API can respond; it does not check database readiness.

## Checks and builds

```sh
npm test
npm run format:check
npm run typecheck
npm run lint
npm run build
```

Use `npm run format` to apply Prettier to application source, CSS, HTML, and configuration.
Markdown, SQL migrations, dependencies, build outputs, and the lockfile are excluded.

`npm test` runs database-independent API and frontend behavioral tests.
`npm run test:watch` watches API tests;
`npm run test:watch --workspace @acme/web` watches frontend tests.
Frontend tests use Vitest, jsdom, and React Testing Library with controlled fetch responses;
real browser/API verification is a separate manual check.

After building, `npm run start:api` starts the compiled API, and `npm run preview:web`
serves the UI build locally. Vite preview is a local check, not a production hosting setup.
For a local production-mode check, set DATABASE_URL and NODE_ENV=production before start:api.
Production startup requires apps/web/dist/index.html and its assets directory. Paths are
module-relative, independent of the working directory. PORT defaults to 3000 and must be a
digit-only integer from 0 to 65535 (0 selects a temporary port); the server binds to 0.0.0.0.
Unknown API paths and missing assets return 404; there is no catch-all React fallback.
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the selected Render Free + Neon Free setup.

## Structure

- `apps/api/src/app.ts`: Express app factory and HTTP contracts; `server.ts`: pool/listener wiring.
- `apps/web/src`: React entry point, employee directory, API helper, and behavioral tests.
- `apps/api/src/employee.ts`, `create-employee.ts`: validation and one parameterized insert.
- `apps/api/src/pagination.ts`, `list-employees.ts`: query validation and bounded retrieval.
- `apps/api/src/list-salary-history.ts`: employee-scoped, bounded history retrieval.
- `apps/api/migrations/001_employees.sql`: initial employee schema.
- `apps/api/migrations/002_salary_history.sql`, `src/update-salary.ts`: history storage and atomic salary edits.
- `apps/api/src/auth.ts`, `hr-credentials.ts`, `session-store.ts`: HR authentication foundation.
- `apps/api/migrations/003_hr_sessions.sql`: PostgreSQL session table and expiry index.
- Root: npm workspaces, shared strict TypeScript settings, ESLint, and one dependency lockfile.
- `docs/AI_USAGE.md`: actual AI assistance and validation evidence.

Tests and type checking are separate from compilation. API tests are excluded from the API build.
Local 10,000-record query observations are in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).
These local timings are not hosted performance measurements.

## PostgreSQL setup and integration tests

On macOS with Homebrew, install PostgreSQL 18 and run it without automatic startup at login:

```sh
brew install postgresql@18
brew services run postgresql@18
```

Using the PostgreSQL binaries under your Homebrew prefix, create two databases once:

```sh
"$(brew --prefix postgresql@18)/bin/createdb" acme
"$(brew --prefix postgresql@18)/bin/createdb" acme_test
```

Homebrew's local cluster uses the current OS user and trusted local authentication.
These local URLs contain no password. Other environments need their own credentials and TLS setup.
From the repository root:

```sh
export DATABASE_URL=postgresql://localhost:5432/acme
export TEST_DATABASE_URL=postgresql://localhost:5432/acme_test
npm run db:migrate
npm run test:integration
```

The migration command explicitly applies `001_employees.sql`, `002_salary_history.sql`, then `003_hr_sessions.sql`
in one transaction. It can be reapplied without removing records; it creates missing tables/indexes
but does not upgrade existing definitions. Future schema changes need new numbered migrations
rather than editing a committed migration. Include `apps/api/migrations` in deployment artifacts;
the compiled CLI is `node apps/api/dist/migrate-cli.js` after building.

Integration tests require the database name `acme_test`. They create a random private schema,
truncate only that schema's employee/history tables between tests, and remove the schema afterward.
They never use `DATABASE_URL` or the development database. A killed test process may leave
its test schema behind; later runs use different names.

To stop the local database when finished: `brew services stop postgresql@18`.

## Synthetic seed data

Apply migrations first, then explicitly select the target database:

```sh
DATABASE_URL=postgresql://localhost:5432/acme npm run db:seed
```

The CLI requires a PostgreSQL URL with an explicit host and database. It prints the target
without credentials before inserting; it never falls back to TEST_DATABASE_URL or seeds on
API startup. After building, the equivalent compiled command is `node apps/api/dist/seed-cli.js`
with DATABASE_URL set. Pool connections close on success/failure; failures exit nonzero.

Generation is deterministic: SEED-00001 through SEED-10000, synthetic names, unique example.test
emails, four countries, five departments, four roles, and 2,500 employees per supported currency.
Annual demo ranges are INR 400,000–4,000,000.99, USD 40,000–180,000.99, EUR 35,000–150,000.99,
and GBP 30,000–130,000.99. These are illustrative ranges, not market research or validation limits.
Amounts are exact two-place strings; every generated record passes the existing validator.

Twenty parameterized batches of 500 share one transaction. Existing employee-ID conflicts are
skipped and counted without assuming they were seeded. No employees or history are overwritten
or removed; edited seed employees remain edited. An empty database receives exactly 10,000 rows;
existing databases can have more. Reruns insert missing IDs only. No salary history is fabricated.

Salary persistence uses the employee's existing currency and exact decimal strings. A row lock
serializes edits; salary and history commit together. Unchanged normalized amounts return
`salary_unchanged` without history.

## Employee HTTP API

- `GET /api/compensation-insights` returns `{ "groupBy": "currency", "headcount": 10000,
  "groups": [...] }`. Optional exact country/department filters are trimmed, blanks omitted,
  and combined with AND. `groupBy` is currency (default), country, or department. Every group
  includes currency, groupValue (null for currency grouping), headcount, total, average, median,
  minimum, and maximum. All monetary fields are two-place strings; groups sort by groupValue
  then currency in deterministic C collation. Overall headcount counts matching employees;
  group counts reconcile with it. No matches return zero headcount and an empty groups array.
  Averages/medians round half-up for positive values only at response precision. Median uses
  the middle value or mean of the two middle values. Invalid filters/grouping return 400
  invalid_query with field; database/aggregate failures use the existing sanitized 500.
  Country/department breakdowns also partition every statistic by currency; no mixed-currency
  monetary total is returned. Statistics use current salaries, not salary history.

- `GET /api/employees?page=1&pageSize=25` returns
  `{ "employees": [...], "page": 1, "pageSize": 25, "total": 42 }`.
  Defaults are page 1 and size 25; sizes must be 1–100. Pagination values must be single
  positive integer strings with safe numeric values and a safe calculated offset.
  Results are ordered by employee ID ascending; empty/beyond-end pages retain the total.
  Optional `search` matches a case-insensitive literal substring of name or email (including
  literal `%`, `_`, backslash, and `!`). `country`, `department`, and `currency` are exact,
  case-sensitive filters combined with AND. Search/filter values are trimmed; blanks are omitted.
  Currency must be INR, USD, EUR, or GBP. `sortBy` accepts `employeeId`, `name`, `department`,
  `role`, `country`, `currency`, or `salaryAmount`; `sortDirection` accepts `asc` or `desc`.
  Defaults remain employeeId/asc; ties use employee ID ascending. Salary sorting is numeric,
  without currency conversion. Use a currency filter for same-currency comparisons.
  Malformed/repeated/nested criteria and invalid sorting return 400 `invalid_query` with `field`;
  unsupported currencies return 400 `unsupported_currency`. Pagination errors remain unchanged.
- `POST /api/employees` accepts the eight employee fields, with `salaryAmount` as a string,
  and returns HTTP 201 with `{ "employee": {...} }`.
- `PATCH /api/employees/:employeeId/salary` accepts `{ "salaryAmount": "80000.00" }` and returns
  HTTP 200 with `{ "employee": {...} }`. Existing currency and other employee fields stay unchanged;
  extra body fields are ignored. Invalid body shape/missing or non-string amounts return 400
  `invalid_amount`; amount validation and storage errors retain their existing codes/fields.
- `GET /api/employees/:employeeId/salary-history?page=1&pageSize=25` returns
  `{ "history": [...], "page": 1, "pageSize": 25, "total": 2 }` using the same pagination rules.
  Entries contain `historyId`, `employeeId`, `currency`, `oldAmount`, `newAmount`, and `changedAt`.
  Amounts and BIGINT IDs are strings; timestamps are UTC ISO strings with millisecond precision.
  Results sort by timestamp descending, then numeric history ID descending. An existing employee
  with no history returns 200 with an empty page; missing employees return 404 `employee_not_found`.
  Unchanged normalized salary updates return 409 `salary_unchanged`, without adding history.
- Errors use `{ "error": { "code": "...", "field": "..." } }`; `field` is omitted for
  general/parser errors. Validation and numeric overflow return 400, duplicate IDs 409,
  malformed JSON 400, bodies above 1 MiB 413, and database failures a sanitized 500.
- Salaries remain strings in requests/responses. The 1 MiB limit bounds transport resources;
  it does not change salary validation's no-chosen-maximum decision.

Example request after starting the API:

```sh
curl -i 'http://localhost:3000/api/employees?page=1&pageSize=25'
```

Counts and page rows use separate queries, so concurrent writes can briefly make them differ.
This applies to history pagination as well as the directory. Salary update transactions are atomic,
but a lost connection during commit can leave the caller uncertain; do not retry automatically.
All employee APIs above require an authenticated session; writes additionally require the
exact configured Origin. A bare curl request to the directory now returns 401.
On SIGINT/SIGTERM, the server stops
accepting requests, waits for active requests, closes the session store, and closes the pool.

## HR authentication

Choose one HR username and a strong unique demo password (at least 12 characters). Generate
the hash interactively; password entry is hidden and the command refuses piped input:

```sh
npm run auth:hash -- /private/tmp/acme-hr-password-hash
```

The destination must be a new file outside the repository, including through symlinked parents.
It contains only the salted hash, with owner-only permissions; the command prints no hash or
password. Configure `HR_USERNAME` and `HR_PASSWORD_HASH` securely from that file. Generate
`SESSION_SECRET` from at least 32 random bytes encoded as base64url, for example into another
private file (this command prints no secret):

```sh
node --input-type=module -e "import {randomBytes} from 'node:crypto'; import {writeFileSync} from 'node:fs'; writeFileSync('/private/tmp/acme-session-secret', randomBytes(32).toString('base64url'), {flag:'wx', mode:0o600})"
```

Supply these values through server environment variables without pasting them into shell
commands/history, Git, logs, or `VITE_*` variables. A root `.env.local` is already Git-ignored;
give it owner-only permissions and quote the hash. Node must load it explicitly, then pass its
environment to the npm subprocess as shown above. Node rejects `--env-file` in `NODE_OPTIONS`;
on the verified Node 24.18.0, `--run` did not forward loaded values to its subprocess. Do not
use those alternatives. The API does not automatically load environment files.
Never reuse a real account's password. Remove temporary secret files when no longer needed.

- `POST /api/auth/login` accepts `{username, password}` and returns `200 {user:{username}}`.
  Invalid input returns 400 `invalid_credentials_input`; incorrect credentials return generic
  401 `invalid_credentials`. JSON bodies are limited to 4 KiB; malformed JSON uses the existing
  400 `invalid_json`, oversized bodies 413 `body_too_large`.
- `GET /api/auth/session` returns the same user object or 401 `authentication_required`.
- `POST /api/auth/logout` destroys the session and clears the cookie, returning idempotent 204.
- Auth responses have `Cache-Control: no-store`. Session failures return sanitized 500
  `persistence_failed`; regeneration and saving must finish before login succeeds.
- Sessions use PostgreSQL and a signed, host-only `acme_session` cookie with HttpOnly,
  SameSite=Lax, Path=/ and rolling expiry. Server-side expiry is 30 minutes idle and eight hours
  absolute, including exact boundaries. Renewal persists before business execution; its lifetime
  is capped by remaining absolute time. Old sessions without lifetime metadata require login.
- Every unsafe API request (including login/logout) requires exact `Origin: APP_ORIGIN`.
  Missing/null/mismatched origins return 403 `invalid_origin`; GET does not require Origin.
  HTTP APIs return 403 `https_required` in production. Proxy trust is one hop in production,
  disabled in development; cookies require Secure in production. These behaviors are tested
  locally. Live login is candidate-confirmed; full hosted proxy-header/security regression
  testing is not recorded here.
- Login allows five attempts per IP and 60 globally per 15 minutes, counting successes/failures.
  Limits return 429 `login_rate_limited` with Retry-After. At most two password verifications
  run concurrently; saturation returns 503 `authentication_busy` with Retry-After: 1, without
  queuing. Limits are process-local and reset on restart; no automatic retry is performed.
- Successful login replaces the session ID. Expired database rows cannot authenticate even
  before deletion. Login opportunistically prunes expired rows; cleanup failure does not
  invalidate a saved login. No background pruning timer repeatedly wakes Neon.

Health and frontend assets stay public and make no session-store lookup. Business APIs are
protected with their existing authenticated contracts; all API responses use no-store.
Session loading/renewal failures prevent business execution and return sanitized errors.
Lifecycle changes serialize per session within one process and reload current data, preventing
stale renewal overwrites or restoration after logout. This is not distributed coordination.
The React UI checks the current session before mounting any protected workflow. Login and
refresh restore access using same-origin cookies; no tokens are stored in browser storage.
Logout immediately clears protected UI state. If its response fails or is uncertain, the UI
keeps that state unmounted, reports unconfirmed server-side logout, and offers explicit Retry.
Any current protected API's 401 returns to login; obsolete requests cannot expire a newer
login. Reauthentication starts with fresh forms, filters and panels. Interrupted employee
creation or salary updates are never automatically replayed: check persisted records first.
Session checks and login failures have separate feedback/retry; uncertain login offers a
session check without retrying the login POST. Password inputs clear on submission.
Request-failure diagnostics remain limited. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
for confirmed hosted facts, verification boundaries and free-tier limitations.
