# ACME Salary Management

Salary management for ACME's HR Manager. Product scope is in [REQUIREMENTS.md](REQUIREMENTS.md).
The backend includes salary/employee validation and PostgreSQL employee creation.
The UI remains a placeholder and the only HTTP route is `/health`.
Salary updates/history, directory queries, analytics, authentication, seeding, and deployment
are not implemented yet.

## Local setup

Use Node.js 24.x and npm (validated versions are recorded in `docs/AI_USAGE.md`).
From the repository root:

```sh
npm ci
```

Run these commands in separate terminals:

```sh
npm run dev:api
npm run dev:web
```

- API: `http://localhost:3000/health`, returning `{ "status": "ok" }`.
- UI: use the local URL printed by Vite (normally `http://127.0.0.1:5173`).
- The API reads the optional `PORT` environment variable, defaulting to 3000.
  For example: `PORT=3001 npm run dev:api`. `.env.example` documents the setting;
  environment files are not automatically loaded by the current API startup configuration.
- Vite automatically loads supported frontend environment files from `apps/web`.
- The health endpoint confirms the API can respond; it does not check database readiness.

## Checks and builds

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

`npm test` and `npm run test:watch` run database-independent API tests only.
There are no frontend tests in this increment;
behavioral UI tests will accompany the approved workflows.

After building, `npm run start:api` starts the compiled API, and `npm run preview:web`
serves the UI build locally. Vite preview is a local check, not a production hosting setup.

## Structure

- `apps/api/src/app.ts`: Express app; `server.ts`: HTTP listener; `app.test.ts`: health contract.
- `apps/web/src`: React entry point and placeholder screen.
- `apps/api/src/employee.ts`, `create-employee.ts`: validation and one parameterized insert.
- `apps/api/migrations/001_employees.sql`: initial employee schema.
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

The migration runs transactionally and can be reapplied without removing records. It only
creates the initial table if absent; it does not upgrade an existing table's definition.
Future schema changes need new numbered migrations rather than editing a committed migration.

Integration tests require the database name `acme_test`. They create a random private schema,
truncate only that schema's employee table between tests, and remove the schema afterward.
They never use `DATABASE_URL` or the development database. A killed test process may leave
its test schema behind; later runs use different names.

Validation is exposed as a backend function only; there is no employee HTTP endpoint yet.
To stop the local database when finished: `brew services stop postgresql@18`.
