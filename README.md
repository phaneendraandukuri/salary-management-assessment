# ACME Salary Management

Salary management for ACME's HR Manager. Product scope is in [REQUIREMENTS.md](REQUIREMENTS.md).
The backend includes salary/employee validation, PostgreSQL employee creation, and paginated
create/list HTTP APIs. The React directory displays real employees with loading, empty/error,
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
Analytics, authentication, seeding, and
deployment are not implemented yet.

## Local setup

Use Node.js 24.x and npm (validated versions are recorded in `docs/AI_USAGE.md`).
From the repository root:

```sh
npm ci
```

Complete the PostgreSQL setup below first. Run these commands in separate terminals:

```sh
export DATABASE_URL=postgresql://localhost:5432/acme
npm run dev:api
npm run dev:web
```

- API: `http://localhost:3000/health`, returning `{ "status": "ok" }`.
- UI: use the local URL printed by Vite (normally `http://127.0.0.1:5173`).
- The API reads the optional `PORT` environment variable, defaulting to 3000.
  For example: `PORT=3001 npm run dev:api`. `.env.example` documents the setting;
  environment files are not automatically loaded by the current API startup configuration.
- API startup requires `DATABASE_URL`. Migrations must be run explicitly before employee requests.
- Vite automatically loads supported frontend environment files from `apps/web`.
- In development, Vite proxies `/api` to `http://localhost:3000`. For a different API port,
  use `API_PROXY_TARGET=http://localhost:3001 npm run dev:web` (a shell environment variable).
  The UI uses relative `/api` URLs. Production hosting must route these requests to the API;
  the development proxy does not configure production routing.
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

## Structure

- `apps/api/src/app.ts`: Express app factory and HTTP contracts; `server.ts`: pool/listener wiring.
- `apps/web/src`: React entry point, employee directory, API helper, and behavioral tests.
- `apps/api/src/employee.ts`, `create-employee.ts`: validation and one parameterized insert.
- `apps/api/src/pagination.ts`, `list-employees.ts`: query validation and bounded retrieval.
- `apps/api/src/list-salary-history.ts`: employee-scoped, bounded history retrieval.
- `apps/api/migrations/001_employees.sql`: initial employee schema.
- `apps/api/migrations/002_salary_history.sql`, `src/update-salary.ts`: history storage and atomic salary edits.
- Root: npm workspaces, shared strict TypeScript settings, ESLint, and one dependency lockfile.
- `docs/AI_USAGE.md`: actual AI assistance and validation evidence.

Tests and type checking are separate from compilation. API tests are excluded from the API build.
No deployment or 10,000-record performance claims have been verified at this stage.

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

The migration command explicitly applies `001_employees.sql` then `002_salary_history.sql`
in one transaction. It can be reapplied without removing records; it creates missing tables/indexes
but does not upgrade existing definitions. Future schema changes need new numbered migrations
rather than editing a committed migration. Include `apps/api/migrations` in deployment artifacts;
the compiled CLI is `node apps/api/dist/migrate-cli.js` after building.

Integration tests require the database name `acme_test`. They create a random private schema,
truncate only that schema's employee/history tables between tests, and remove the schema afterward.
They never use `DATABASE_URL` or the development database. A killed test process may leave
its test schema behind; later runs use different names.

To stop the local database when finished: `brew services stop postgresql@18`.

Salary persistence uses the employee's existing currency and exact decimal strings. A row lock
serializes edits; salary and history commit together. Unchanged normalized amounts return
`salary_unchanged` without history.

## Employee HTTP API

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
Authentication remains pending. On SIGINT/SIGTERM, the server stops
accepting requests, waits for active requests, and closes the pool.
