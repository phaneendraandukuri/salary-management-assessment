# Render Free + Neon Free deployment runbook

Selected approach: one Render Free Node web service serves Express and the React build;
Neon Free stores PostgreSQL data. No cloud resources or deployment have been verified yet.
Authentication foundation alone is not safe for public deployment: business APIs remain
unprotected. Complete Task 13A-2 origin checks, throttling, full idle/absolute expiry, API
protection and Render proxy verification, then React login integration, before exposure.
Cloud verification is still pending.

## Preparation (local, no cloud action)

Use the reviewed commit and Node 24.18.0:

```sh
npm ci --include=dev
npm run build
```

Retain this layout: apps/api/dist, apps/api/migrations/001_employees.sql,
apps/api/migrations/002_salary_history.sql, apps/api/migrations/003_hr_sessions.sql,
apps/web/dist, and runtime node_modules.
TypeScript compilation does not copy SQL; the repository checkout already includes it beside
dist. A dist-only API upload is insufficient. Never copy source, environment files, or secrets
into apps/web/dist. Build and startup do not migrate or seed.

## Cloud configuration (requires separate authorization)

- Use a Render Hobby workspace, Free web-service compute, and Neon Free project. Do not enable
  paid resources or upgrades. A public Git URL avoids Git-provider permissions; otherwise grant
  access only to this repository. Creating a Render service starts its initial deployment.
- Choose nearby available application/database regions. Pin Render NODE_VERSION=24.18.0.
- Render root directory: repository root. Build command: npm ci --include=dev && npm run build.
  Start command: npm run start:api. Set NODE_ENV=production; use Render's supplied PORT.
- Set DATABASE_URL securely to the Neon runtime connection string, preferably pooled, with
  verified TLS (sslmode=verify-full). Do not disable certificate verification or expose the URL
  through VITE_* variables, logs, Git, or this document. Existing pg.Pool needs no Neon SDK.
- Server startup also requires HR_USERNAME, HR_PASSWORD_HASH and SESSION_SECRET as secret
  environment values. Generate the salted hash with the local auth:hash command and use a
  stable, random 32-byte-or-longer base64url session secret. Do not log or commit these values.
  Changing the signing secret invalidates existing cookies. APP_ORIGIN and proxy configuration
  will be completed/documented in Task 13A-2; do not deploy this intermediate increment.
- Select /health for the platform health check; it reports liveness, not database readiness.
  Set Auto-Deploy to Off after initial creation to retain manual deployment approval.

## Explicit database setup

Use a direct Neon connection URL in a securely set local DATABASE_URL. Confirm the intended
host, database, and schema first (SELECT current_database(), current_schema()). Then, from
the reviewed checkout after building:

```sh
node apps/api/dist/migrate-cli.js
node apps/api/dist/seed-cli.js
```

Run these only against the selected assessment database. Migrations are ordered/idempotent for
the current schema; seed conflicts preserve existing records. Verify 10,000 records and currency
distribution on an initially empty database. Repeat seeding explicitly to verify skipped counts.
Render Free has no paid pre-deploy hook, shell, or one-off job; local explicit execution avoids
depending on those features. Test suites continue using isolated acme_test, never Neon demo data.

## Verification and ₹0 limitations

After an explicitly authorized deployment, verify HTTPS /, JS/CSS assets, /health, and real
directory/create/salary/history workflows with synthetic data. Unknown /api paths and missing
assets must return 404. The same origin handles /api; no Vite preview/proxy or CORS setup is used.
Verify authentication once implemented, logs without secrets, and a first request after idle.

Render Free sleeps after 15 minutes and may take about a minute to wake. Neon Free scales to
zero after five minutes; its wake-up adds latency and may challenge the current five-second
connection timeout. Measure before changing it. Local PostgreSQL timings do not predict hosting.
Monitor free compute/storage/transfer/build quotas. Avoid a payment method/paid upgrades under
the ₹0 constraint; account-specific verification prompts require discussion, not assumed consent.
Exhausted quotas can suspend access/builds. No always-on guarantee or paid backup capability
is assumed. Keep the candidate's repository and deterministic seed as recovery artifacts.

References: [Render Free](https://render.com/docs/free),
[Render deploy commands](https://render.com/docs/deploys),
[Render Node version](https://render.com/docs/node-version),
[Neon plans](https://neon.com/docs/introduction/plans),
[Neon connectivity](https://neon.com/docs/connect/connect-from-any-app).
