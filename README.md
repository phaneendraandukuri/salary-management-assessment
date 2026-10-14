# ACME Salary Management

Salary management for ACME's HR Manager. Product scope is in [REQUIREMENTS.md](REQUIREMENTS.md).
This increment contains a minimal React UI and an Express health endpoint only.
Employee workflows, PostgreSQL integration, authentication, seeding, and deployment are not implemented yet.

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

`npm run test:watch` watches API tests. There are no frontend tests in this increment;
behavioral UI tests will accompany the approved workflows.

After building, `npm run start:api` starts the compiled API, and `npm run preview:web`
serves the UI build locally. Vite preview is a local check, not a production hosting setup.

## Structure

- `apps/api/src/app.ts`: Express app; `server.ts`: HTTP listener; `app.test.ts`: health contract.
- `apps/web/src`: React entry point and placeholder screen.
- Root: npm workspaces, shared strict TypeScript settings, ESLint, and one dependency lockfile.
- `docs/AI_USAGE.md`: actual AI assistance and validation evidence.

Tests and type checking are separate from compilation. API tests are excluded from the API build.
No deployment or 10,000-record performance claims have been verified at this stage.
