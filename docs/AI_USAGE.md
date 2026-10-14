# AI assistance record

## Collaboration

OpenAI Codex assisted with reviewing the original assessment and project instructions,
planning incremental delivery, refining `REQUIREMENTS.md`, and implementing the approved
minimal repository bootstrap, annual salary validation, employee persistence, create/list HTTP APIs,
and the approved React employee directory. The candidate owns product
decisions, reviews, and commits.

Representative requests (summaries, not verbatim transcripts):
- Read the assessment and agreed context; propose a deadline-aware plan without editing files.
- Make requirements product-focused, preserve scope, and show proposed wording before editing.
- Bootstrap npm workspaces with Express/React/TypeScript, demonstrate genuine health-endpoint
  Red → Green → Refactor, run checks, and stop before business features or Git commits.

The candidate approved the requirements wording and bootstrap scope. Codex retained the agreed
stack and deferred database, authentication, and business workflows. The candidate reviewed
the Task 1 implementation and discussed the significant engineering decisions, confirming
understanding of the main architecture, development setup, and TDD approach. The validation
results below were obtained by Codex; no independent candidate-run validation has been recorded.
Codex has not staged or committed this bootstrap.

## Task 1 decisions and evidence

- Node.js 24.18.0 and npm 11.16.0 are available in this workspace.
- Two npm workspaces avoid an additional monorepo framework. Runtime dependencies belong
  to their apps; shared TypeScript/lint tooling belongs to the root.
- The Express app is separate from its HTTP listener. The health contract is HTTP 200,
  JSON content type, and exactly `{ "status": "ok" }`, with no database dependency.
- Configuration scaffolding has no artificial TDD cycle. Before implementing the route,
  `npm test` first encountered sandbox `listen EPERM`; this is not the Red evidence.
  Rerunning with local socket permission produced the expected behavioral Red:
  `AssertionError: expected 404 to be 200`, one failed test (124 ms total).
  Adding only the health handler made the same test pass: one passed test (102 ms total).
  No refactor was justified for this four-line handler.
- Codex consulted official Vite, Vitest, and TypeScript module documentation for tooling setup.
- The initial npm install was interrupted after a registry connectivity check failed with
  `ENOTFOUND` in the sandbox; network access was requested for installation.
- npm reported that the initially selected ESLint 9 was unsupported; Codex updated to
  ESLint 10 and verified plugin compatibility with a passing lint run. Exact direct
  dependency versions and transitive resolutions are recorded in the manifests/lockfile.
- `npm run typecheck`, `npm run lint`, and `npm run build` exited 0. Vite built 15 modules;
  API compilation succeeded. `npm ls --depth=0` reported no dependency errors.
- A temporary local HTTP smoke check verified API development and compiled startup
  (HTTP 200 and exact health JSON), plus Vite development and build preview
  (HTTP 200 for HTML and its entry script). All smoke-check servers were stopped.
  This was an HTTP check, not a browser rendering or interaction check.
- `npm ci --offline --cache /private/tmp/acme-npm-cache` verified a clean installation
  from the lockfile using the already downloaded packages (278 installed, zero reported
  vulnerabilities). After reinstalling, `npm test` passed again (one test, 132 ms total),
  and type checking, linting, and both builds again exited 0. `git diff --check` passed.

npm emitted pending lifecycle-script warnings for `esbuild` and optional macOS `fsevents`.
Codex did not grant blanket script approval; the installed tooling passed the recorded checks.

## Task 2 — annual salary validation

The candidate explicitly approved a dependency-free backend validator for INR, USD, EUR,
and GBP: positive decimal-string amounts, at most two fractional digits, normalization to
two decimal places, exact precision preservation, and no arbitrary maximum salary.
Codex implemented only this validator, its tests, and concise design/AI-use notes.
No employee persistence, API routes, schema, analytics, authentication, or UI changes were made.

TDD evidence (each command ran the full API suite, including the existing health test):

| Behavior | Red evidence | Green evidence |
| --- | --- | --- |
| Normalize valid INR amounts | 3 failed: expected success, received `invalid_amount` from an importable skeleton | 4 total tests passed |
| Accept the other supported currencies | 3 failed: USD/EUR/GBP returned `unsupported_currency` | 17 total tests passed |
| Reject malformed strings and excess precision | 20 failed: malformed inputs incorrectly returned success | 43 total tests passed |
| Require positivity | 4 failed: zero values incorrectly returned success | 50 total tests passed |

The initial Red command was `npm test -- --run`; npm warned about an unnecessary unknown
`--run` option, but Vitest executed and produced the expected behavioral failures. All
subsequent commands used `npm test`.

Unsupported currencies and non-string amounts were already rejected by the earlier guards;
those new tests passed immediately and are regression coverage, not additional Red evidence.
Three precision/no-maximum tests also passed immediately with the string implementation,
including an amount above JavaScript's safe-integer range and a 1,000-digit whole part.
The full suite then had 53 passing tests. Production cleanup only wrapped the currency
condition for readability; no additional abstraction or behavioral refactor was justified.

Final validation after cleanup: `npm test` passed all 53 tests in two files (197 ms total);
`npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` exited 0.
Both apps built successfully; Vite transformed 15 modules. No dependencies or configuration
were changed. These checks were run by Codex. Candidate review was pending at that handoff;
Codex has not staged, committed, or pushed this increment.
The candidate subsequently approved canonicalizing redundant leading zeros within Task 2.
Codex added the three requested examples before implementation. `npm test` failed exactly
those three cases (53 existing tests passed): received `00100.50`, `000.01`, and `0000001.00`
instead of `100.50`, `0.01`, and `1.00`. Removing leading whole-part zeros and falling back
to `0` made all 56 tests pass (107 ms total). No numeric conversion or database limit was added.
No further refactor was justified for this one-line normalization step.
Final refinement checks: `npm test` passed all 56 tests (174 ms total); type checking,
linting, both builds, and `git diff --check` passed. The candidate subsequently confirmed
Task 2 review and commit `334df49`.

No deployed application or seed script is claimed.

## Task 3 — employee validation and persistence

The candidate approved employee creation only, trimmed required text fields, case-sensitive
employee IDs, basic email syntax, and exact PostgreSQL NUMERIC storage without a chosen
salary ceiling. Codex added `pg`/`@types/pg`, straightforward pooling and parameterized SQL,
one numbered migration, database constraints, and separate unit/integration configurations.

Employee validation TDD: the valid-input test failed with `invalid_field` before implementation,
then 57 total tests passed. Required-field/email tests then produced 48 behavioral failures;
after implementation, 105 total tests passed. Ten additional object-shape, salary-reuse,
case-preservation, and precision checks passed immediately (115 total), so they are regression
coverage, not new Red evidence. Test case objects preserve array-valued invalid inputs rather
than letting Vitest interpret them as parameter rows.

Infrastructure: Docker reported no daemon socket; no Docker Desktop/OrbStack was found in
Applications, and PostgreSQL executables were not on PATH. Docker Compose was also unavailable.
The explicit integration command refused to run without a dedicated `TEST_DATABASE_URL`.
These were infrastructure failures, not persistence Red evidence. The candidate approved
Homebrew PostgreSQL after that pause. Homebrew was present but PostgreSQL was not installed.
With approval, Codex installed PostgreSQL 18.6, ran it without automatic startup at login,
and created separate `acme` and `acme_test` databases. Homebrew also installed/upgraded its
required dependencies, including OpenSSL, certificates, readline, and xz. The unused Docker
Compose draft was removed. Local trusted authentication is not a deployment security claim.

Persistence TDD used actual PostgreSQL, only in `acme_test`:

| Behavior | Red evidence | Green evidence |
| --- | --- | --- |
| Persistence and exact monetary round-trip | 2 failed: skeleton returned `persistence_failed`, including salary `9007199254740993.01` | 2 integration tests passed |
| Duplicate employee ID | Second insert incorrectly returned success | 3 passed after primary key and error mapping |
| Database correctness constraints | 30 failed: invalid direct SQL updates succeeded | 34 passed after NOT NULL/CHECK constraints |
| Safe database errors | Numeric overflow and missing-table errors escaped | 36 passed after sanitized result mapping |

Nine additional regression cases passed immediately: invalid inputs create no row, SQL-like
text stays data, case-distinct IDs/repeated emails are allowed, concurrent duplicates store
one row, PostgreSQL's 131,072-digit whole-part boundary round-trips exactly, and migration
reapplication preserves records. These were not claimed as additional Red cycles.

Refactoring cleaned up insert formatting; no repository framework or ORM was introduced.
Final checks by Codex: `npm test` passed 115 tests (208 ms total); explicit
`TEST_DATABASE_URL=postgresql://localhost:5432/acme_test npm run test:integration` passed
45 tests (646 ms total). Type checking, linting, both builds, and `git diff --check` passed.
The interim unused skeleton parameters are resolved. Migration succeeded twice against the
development database, which remained empty; no integration tests connected to it. A final
metadata check found zero leftover private test schemas in `acme_test`.

No HTTP routes, frontend features, salary history, analytics, authentication, or seeding
were added. The candidate subsequently confirmed Task 3 review, commit, and push (`fb01d9f`).
Codex performed no staging, commits, pushes, or work on the next task before authorization.

## Task 4 — paginated retrieval and create/list HTTP API

The candidate approved paginated retrieval and POST/GET employee routes, bounded pagination,
HTTP error contracts, minimal function injection, and a 1 MiB JSON limit. Codex implemented
those only, plus pool/listener startup and shutdown wiring. No dependencies, migrations,
frontend features, search/filter/configurable sort, history, analytics, authentication, or
seeding were added. The existing integration suite was renamed to `employees.integration.test.ts`
and expanded without removing its 45 employee-creation tests.

| Behavior | Actual Red evidence | Green evidence |
| --- | --- | --- |
| Pagination defaults and explicit values | Default result was rejected; explicit values then returned defaults | 117 total database-independent tests passed |
| Invalid pagination and safe offsets | 32 cases incorrectly returned success | 149 passed |
| PostgreSQL retrieval | Populated page returned no employees/zero total; beyond-end total was zero | 48 integration tests passed |
| HTTP create/list success | GET/POST returned 404 instead of 200/201 | 151 database-independent tests passed |
| HTTP errors/query shapes/body limits | 9 cases had wrong status, HTML errors, ignored nested queries, or the default body limit | 172 passed |

Other API mapping cases passed immediately using the earlier guards and are regression
coverage. Four real HTTP/PostgreSQL create-then-list/error tests passed after the route and
SQL cycles, bringing integration coverage to 52; they are not claimed as separate Red cycles.

The initial sandbox PostgreSQL check reported no response; an approved check outside it
verified connectivity before behavioral tests. A rename-patch mistake briefly caused a
test parse failure, corrected before recording retrieval Red evidence. Two interim type checks
caught a test-table union typing issue, resolved by retaining complete result objects;
production types were not weakened. These failures are not business-behavior Red evidence.

Final checks by Codex: `npm test` passed 172 tests (283 ms total); explicit
`TEST_DATABASE_URL=postgresql://localhost:5432/acme_test npm run test:integration` passed
52 tests (731 ms total). Type checking, linting, both builds, and `git diff --check` passed.
A separate temporary-server check exercised source and compiled entry points only against a
private schema in `acme_test`: health 200, create 201, list 200 with exact salary strings,
and SIGTERM exit 0. Both servers and their schema were cleaned up. No browser testing or
deployment is claimed.

Counts/page rows use separate queries and can differ during concurrent writes. Salary values
remain strings; numeric conversion is only for validated pagination and headcount metadata.
Express 5 async error handling was checked against official documentation. The candidate
subsequently confirmed Task 4 verification, commit, and push (`613c9c2`) and reported manually
checking the empty GET response against the development database. These are candidate-reported
checks. Codex performed no staging, commits, pushes, or deployment.

## Task 5 — React employee directory

The candidate approved reading real employees only: loading, required columns, exact salary
strings, empty/error states, Retry, Previous/Next pagination, and stale-request protection.
Codex added one directory component, a small typed fetch helper, minimal CSS, the Vite dev
proxy, and frontend-only testing dependencies. No backend behavior or business scope changed.

Each cycle ran frontend tests before implementing its behavior:

| Behavior | Actual Red evidence | Green evidence |
| --- | --- | --- |
| Initial loading | Missing accessible status message | 1 frontend test passed |
| Employee fields/exact salary and empty directory | 2 failed: screen remained loading | 3 passed |
| Network/HTTP/JSON errors and Retry | 3 failed: no error alert | 6 passed |
| Next/Previous pagination | Next remained disabled for 26 employees | 7 passed |
| Empty later page | Incorrect empty-directory message | 8 passed |
| Stale success/failure | 2 failed: old response overwrote data; old failure replaced it with an alert | 10 passed |

Refinement added presentation/accessibility and cleaned JSX formatting without introducing
additional components or abstractions. Tooling configuration did not have an artificial TDD cycle.

Codex manually verified Chrome against temporary API/Vite servers and an isolated private
schema in `acme_test`: initial empty state, 26 synthetic records split 25/1 over pages 1/2,
Previous/Next boundaries, exact `9007199254740993.01`, loading, an error after stopping the
temporary API, and successful Retry after restarting it. Populating fixtures occurred only
after the candidate explicitly approved the harness command. This was manual browser
verification, separate from automated tests; it was not a 10,000-record seed or performance test.

The harness received `stop`, stopped its servers, ended pools, and dropped its schema. Closing
terminal input then allowed the harness process to exit 0. Follow-up checks found no listeners
on its two ports, zero private test schemas, and zero other `acme_test` connections. The
agent-created browser tab was closed. Development data and the candidate's API were untouched.
A screenshot was saved outside the repository at `/private/tmp/acme-directory-page2.jpg`.

Final validation by Codex: `npm test` passed 172 API tests (545 ms) and 10 frontend tests
(1.77 s). The explicit `acme_test` integration command passed 52 tests (1.80 s). Type checking,
linting, both builds, and `git diff --check` exited 0. Vite transformed 17 modules.
Candidate review of Task 5 remains pending; Codex has not staged, committed, pushed, or deployed it.

## Formatting-only increment

The candidate confirmed Task 5 review and commit, then approved a separate formatting increment
before Task 6. Codex installed exact Prettier 3.9.10, added root format/check commands and a
simple configuration, and mechanically formatted both workspaces. Markdown and SQL were excluded;
only these concise command/evidence notes were manually added. The lockfile changed only for
Prettier installation. No behavior, public interfaces, test assertions, or folder structure changed.

Diff inspection and a comparison against Prettier-formatted HEAD confirmed all 11 changed
application files match formatter output exactly. No artificial TDD cycle was claimed for tooling.
`format:check` passed; unit tests passed 172 API tests (336 ms) and 10 frontend tests (1.06 s);
the explicit isolated `acme_test` integration suite passed 52 tests (1.10 s). Type checks, lint,
both builds, and `git diff --check` passed. The frontend build emitted the same asset filenames
and sizes as Task 5. No new browser check was performed for this mechanical increment.

Review remains pending. Codex has not staged, committed, pushed, or started Task 6. Integration
cleanup hardening and safe server-side diagnostics remain follow-up considerations.

## Task 6 — React employee creation

The candidate confirmed the formatting increment was reviewed, committed, and pushed, then
authorized the previously proposed creation form. Codex added a separate component, a typed
POST helper, a directory-refresh callback, minimal form styles, tests, and these documentation
notes. No dependencies, backend behavior, migrations, or unrelated architecture changed.

| Behavior | Actual Red evidence | Green evidence |
| --- | --- | --- |
| POST exact employee fields | Fetch was never called | 11 frontend tests passed |
| Submitting and confirmed success | 2 failed: no status/disabled controls or success/reset notification | 13 passed |
| Validation/duplicate and request failures | 10 failed: no alerts; response/network errors escaped | 23 passed |
| Directory refresh and independent creation success | 2 failed: form not mounted in App | 25 passed |
| Unknown/malformed API errors | 2 failed: inherited message key crashed rendering; malformed HTTP 400 incorrectly reported uncertainty | 28 passed |

Native required/email validation coverage passed immediately with existing form controls and
is regression coverage, not another Red cycle. Type checking caught unsupported `exact` options
in Testing Library test queries; removing them resolved this test-only issue. Formatting,
field labels/accessibility, and presentation were refined without component extraction or a
form library. Error Red runs included uncaught behavioral response failures, not broken imports
or infrastructure failures; the Green suite has no such errors.

Manual Chrome verification used fresh temporary API/Vite servers and a random private schema
only in `acme_test`: zero-salary rejection with retained values; successful synthetic employee
creation with `009007199254740993.01` stored/displayed as `9007199254740993.01`; success/reset
and refreshed directory; duplicate-ID rejection without changing the original row; API-down
failure with retained values; manual resubmission after recovery. Two synthetic records were
created. Network uncertainty and post-success directory failure were automated-test checks,
not claims of manually reproducing those cases. A screenshot is outside Git at
`/private/tmp/acme-employee-creation.jpg`.

The first harness invocation was blocked by sandbox PostgreSQL socket permissions; an approved
rerun enabled verification. This is infrastructure evidence, not business Red. The harness
received `stop`, cleaned up, then exited 0 after terminal input closed. Read-only checks found
zero private test schemas, zero other acme_test connections, and no listeners on its API/UI
ports. The agent-created browser tab was closed; development data and the candidate API were
untouched. Final validation: `npm test` passed 172 API tests (320 ms) and 28 frontend tests
(5.03 s); explicit PostgreSQL integration tests passed 52 (1.20 s). Type checks, lint, both
builds, and `git diff --check` passed. Vite transformed 18 modules. The first final format
check found the new form test file still needed formatting; a second formatter pass resolved
it and `format:check` passed. Candidate review remains pending; Codex has not staged, committed,
pushed, deployed, or started another task.

## Task 7A — salary history and transactional updates

The candidate confirmed Task 6 review, commit, and push, then split Task 7 into persistence
(7A) and HTTP contracts (7B). Codex implemented only 7A: migration 002, minimal ordered migration
execution, exact salary update/history persistence, and unit/isolated integration tests. Currency
stays unchanged; normalized no-ops return `salary_unchanged`. No new dependencies, HTTP routes,
history retrieval helper, or frontend changes were added. The committed migration 001 is unchanged.

| Behavior | Actual Red evidence | Green evidence |
| --- | --- | --- |
| History migration | Table lookup returned null | 53 integration tests passed |
| Exact salary/history write | 2 failed: importable skeleton returned persistence_failed | 55 passed |
| Unchanged/missing/overflow rejection | 6 failed: unchanged accepted; missing/overflow errors too generic | 69 passed |
| Atomic rollback | Failed history insert left salary at 100.00 instead of 75000.50 | 70 passed |
| History constraints | 15 invalid direct SQL writes succeeded | 87 passed |
| Concurrent edits | 2 failed: stale old amount broke chain; identical edits created two histories | 89 passed |
| Rollback failure | Unit promise leaked private rollback error | 175 API unit tests passed |

Eight invalid-input integration cases passed immediately by reusing the salary validator.
Foreign-key and migration-reapplication checks also passed immediately, as did two unit checks
for connection/query failures. One additional large old-amount precision check is regression
coverage. These are not claimed as new Red cycles. Concurrency used actual PostgreSQL lock
observations before releasing a barrier, not a guessed scheduling order or sleep duration.
Refinement applied Prettier and reviewed responsibility boundaries without adding abstractions.

The sandbox-only readiness check reported no response; an approved check verified PostgreSQL
was accepting connections before behavioral tests. Codex consulted official node-postgres
transaction and PostgreSQL row-lock documentation. A compiled check in a fresh acme_test schema
ran the migration CLI twice, performed an exact salary update, verified retained history, then
closed its connections and dropped its schema. Development migration/data were not changed.
Final validation by Codex: `npm test` passed 175 API tests (338 ms) and 28 frontend tests
(5.15 s); the isolated PostgreSQL integration command passed 90 tests (1.71 s). Format checks,
type checks, lint, both builds, and `git diff --check` passed. The frontend assets remained
unchanged. A final metadata check found zero private test schemas and zero other acme_test
connections. Task 7B and hosting/deployment work remain unstarted; candidate review is pending.
Codex has not staged, committed, pushed, or deployed.

## Task 7B — salary update/history HTTP APIs

The candidate confirmed Task 7A review, commit, and push, then approved only history retrieval,
PATCH salary and GET history endpoints, bounded pagination, error contracts, tests, and minimal
wiring/documentation. Codex inspected salary/update result types before mapping errors and
preserved distinct amount_not_storable, salary_unchanged, employee_not_found, invalid_amount,
and persistence_failed codes and fields. updateSalary and both migrations remain unchanged.
No frontend features, dependencies, authentication, directory enhancements, or analytics changed.

| Behavior | Actual Red evidence | Green evidence |
| --- | --- | --- |
| History retrieval/existence | 2 failed: populated history empty; missing employee returned success | 93 integration tests passed |
| HTTP update/history success | 2 failed: endpoints returned 404 instead of 200 | 177 API unit tests passed |
| HTTP rejection contracts | 10 failed: incorrect statuses and invalid PATCH bodies reached persistence | 201 API unit tests passed |

Empty history, shared pagination/parser/error-middleware cases, and two earlier amount mappings
passed immediately and are regression coverage. Twelve real HTTP/PostgreSQL tests passed after
the retrieval/route cycles, bringing integration coverage to 105. They verify update-to-history,
exact precision/currency preservation, missing vs empty history, unchanged conflicts, invalid
inputs, overflow, rollback, and sanitized query failure; these are not extra claimed Red cycles.
Formatting and diff review kept existing behavior and the approved lightweight architecture.

Sandbox readiness initially reported no response; the approved check verified PostgreSQL before
behavioral tests. A separate temporary compiled API check only in a private acme_test schema
verified health/create, salary update, exact history, unchanged 409, missing 404, and SIGTERM exit 0.
The server stopped, pools closed, and the schema was dropped. No browser interaction was needed
for this backend increment; development data and the candidate's running API were untouched.
Final validation: `npm test` passed 201 API tests (401 ms) and 28 frontend tests (5.13 s).
The explicit isolated PostgreSQL integration suite passed 105 tests (1.98 s). Format checks,
type checks, lint, both builds, and `git diff --check` passed. Frontend assets are unchanged.
Final metadata checks found zero private test schemas and zero other acme_test connections.
Candidate review remains pending; no staging, commits, pushes, deployment, or work on another
task was performed by Codex.

## Task 8A — React salary editing

The candidate confirmed Task 7B review, commit, and push and authorized salary editing only,
including cancel/reopen and employee-switch safeguards. Codex added a separate form, a small
PATCH helper, minimal App callbacks/styles, behavioral tests, and documentation. No backend,
migration, dependency, history viewer, or unrelated component restructuring changed.

| Behavior | Actual Red evidence | Green evidence |
| --- | --- | --- |
| Exact initial salary | Expected salary string, received empty input | 29 frontend tests passed |
| Open/cancel/reopen | Missing employee edit action | 30 passed |
| Switch employee state | Employee B retained A's unsaved 123.45 instead of 200.00 | 31 passed |
| Exact PATCH and encoded ID | Fetch never called | 32 passed |
| Pending controls and confirmed save | 3 failed: switching allowed; missing saving/success states | 35 passed |
| Validation/conflict/failure/uncertainty | 13 failed: no alerts, escaped response errors, or false success | 49 passed |

Native required-input validation passed immediately and is regression coverage. Two App tests
for current-page refresh and confirmed success despite refresh failure passed using the earlier
save callback; they are regression coverage, not independent Red cycles (51 frontend tests).
The error Red run included 11 uncaught behavioral response failures; those are resolved in Green.
Refinement applied consistent formatting and shared existing form styles without a new library.

Manual Chrome verification used temporary API/Vite servers and a fresh private acme_test schema
with 26 synthetic fixtures: switch employees without carrying input, cancel/reopen reset, zero
salary rejection with retained input, page-2 save of 009007199254740993.01 as exact
9007199254740993.01 in unchanged USD currency, normalized input/current amount and refreshed
page-2 row, unchanged conflict, and API-down failure with retained values and enabled Save.
Pending controls, uncertain fetch outcomes, and post-success refresh failure were automated
checks; they were not manually reproduced. Screenshot: `/private/tmp/acme-salary-edit.png`.

The browser tab closed; the harness received stop, completed cleanup, and exited 0 after terminal
input closed. Neither temporary port remained listening; metadata checks found zero private
test schemas and zero other acme_test connections. Development data and the candidate API were
untouched. Final `npm test` passed 201 API tests (399 ms) and 51 frontend tests (5.18 s).
The explicit isolated PostgreSQL integration suite passed 105 tests (2.17 s). Type checks,
lint, both builds, and diff checks passed; Vite transformed 19 modules. The first final format
check identified the new form test file; a second formatting pass resolved it and format:check
passed. Frontend tests were rerun afterward and all 51 passed. Candidate review remains pending;
Codex has not staged, committed, pushed, deployed, or started Task 8B.

## Task 8B — React salary history

The candidate confirmed Task 8A review, commit, and push, then approved a separate paginated
history panel, minimal App integration, and a GET helper. Codex implemented those, scoped CSS,
behavioral tests, and documentation. No backend, migration, dependencies, editor implementation,
or unrelated features changed. Only confirmed saves refresh matching open history from page 1.

| Behavior | Actual Red evidence | Green evidence |
| --- | --- | --- |
| Loading | Missing accessible status | 52 frontend tests passed |
| Exact rendering and empty history | 2 failed: remained loading | 54 passed |
| Errors, retry, missing employee, response guards | 8 failed: missing feedback or invalid data accepted | 62 passed |
| Pagination and empty later page | 2 failed: Next disabled or empty message missing | 64 passed |
| Obsolete success/failure | 2 failed: old response replaced current data/error state | 66 passed |
| App selection, close/reopen | 2 failed: missing View history actions | 68 passed |
| Confirmed save refresh and independent feedback | 2 failed: history remained on page 2 without reloading | 74 passed |

Four negative save checks (conflict, server failure, network uncertainty, and a pending save for
another employee) passed immediately and are regression coverage, not independent Red cycles.
The error Red run included three uncaught response/network failures; these were behavioral
failures, not infrastructure/configuration failures, and are resolved in Green. Refinement
applied formatting and accessible table/button presentation without abstractions or extraction
of existing components.

Manual Chrome verification used temporary API/Vite servers and a private schema only in
acme_test: 26 synthetic employees, 26 real salary changes for one employee split 25/1 over
history pages, exact 9007199254740993.01, UTC timestamps, and independent directory pagination.
A browser salary save created the 27th history entry and reset matching history to page 1;
the directory remained on page 2. Stopping the temporary API produced history error feedback
while the save confirmation stayed visible; restarting and Retry recovered. Selecting an
employee with empty history and closing/reopening the populated panel showed correct employee
data and page 1. StrictMode/obsolete requests, uncertain PATCH outcomes, and an immediately
failed post-save history refresh were automated checks, not manually reproduced cases.
Screenshot: `/private/tmp/acme-salary-history.png`, outside Git. This was not a 10,000-row test.

The browser tab closed; the harness received stop, cleaned up, and exited 0 after terminal
input closed. No listeners remained on its API/UI ports. Metadata checks found zero private
test schemas and zero other acme_test connections; development data and the candidate API were
untouched. Final validation: npm test passed 201 API tests (432 ms) and 74 frontend tests
(5.49 s); explicit isolated PostgreSQL integration tests passed 105 (2.69 s). Format checks,
type checks, lint, both builds, and git diff --check passed. Vite transformed 20 modules.
Candidate review remains pending. Codex has not staged, committed, pushed, deployed, or begun
another task.

## Task 9A — backend directory search/filter/sort

The candidate confirmed Task 8B review, commit, and push and approved backend criteria only.
Codex added a small parser, parameterized shared filters for count/rows, allowlisted sorting,
HTTP integration, tests, and documentation. Existing pagination and response shape are preserved.
No dependencies, migrations, frontend controls, seeding, analytics, authentication, or hosting
changes were made. The candidate's strictly ₹0 hosting constraint is recorded for the next
feasibility checkpoint; free PostgreSQL alternatives including Neon remain to be compared.

| Behavior | Actual Red evidence | Green evidence |
| --- | --- | --- |
| Query parsing | 49 failed: valid criteria ignored, invalid values accepted | 251 backend unit tests passed |
| Search and combined filters | 10 failed: filters ignored, count/rows unfiltered, criteria leaked into response | 115 PostgreSQL integration tests passed |
| Numeric sorting and deterministic ties | 8 failed: retained ID ordering, including exact fractional difference | 123 integration tests passed |
| HTTP criteria/error contracts | 16 failed: criteria not forwarded, invalid values returned 200 | 268 backend unit tests passed |

Blank/default parser and blank HTTP checks passed immediately and are regression coverage.
Two real HTTP/PostgreSQL tests then verified trimmed wildcard-bearing search with combined
filters/sorted pages and SQL-like filter/sort handling (125 integration tests); these were not
additional claimed Red cycles. Refactoring renamed the retrieval argument for clarity and
applied formatting. That rename accidentally changed a type-only import path, caught by type
checking/builds and corrected; it was not behavioral Red evidence. One test file needed a
second formatter pass. No existing components or unrelated modules were restructured.

Sandbox readiness reported no response; an approved outside-sandbox check verified PostgreSQL
before behavioral integration runs. Tests used only random private schemas in acme_test.
Final npm test passed 268 backend tests (505 ms) and unchanged 74 frontend tests (5.93 s).
Explicit isolated PostgreSQL integration tests passed 125 (3.30 s). Format checks, type checks,
lint, both builds, and git diff --check passed; frontend build assets remained unchanged.
Final metadata checks found zero private test schemas and zero other acme_test connections.
No manual browser/deployment or 10,000-row performance verification is claimed for this backend
increment. Candidate review remains pending; Codex has not staged, committed, pushed, deployed,
or started Task 9B.

## Task 9B — React directory controls

The candidate confirmed Task 9A review, commit, and push and approved explicit Apply/Reset,
separate draft/applied criteria, compact controls, and existing workflow preservation. Codex
implemented only frontend controls, GET query serialization, scoped CSS, tests, and notes.
No backend, dependency, migration, seeding, insights, authentication, or hosting changes.

| Behavior | Actual Red evidence | Green evidence |
| --- | --- | --- |
| GET criteria encoding | Selected criteria missing from request | 75 frontend tests passed |
| Draft/Apply and pending Reset | 2 failed: missing controls | 77 passed |
| Filtered empty results | Missing filtered-empty message with original empty behavior | 84 passed |

Six new regression tests passed using existing/focused state handling: paging/Retry/error Reset,
obsolete success/failure after Apply/Reset/paging, and creation/salary-save refresh preservation
with obsolete refresh protection. They are not separate Red cycles. Two test-fixture mistakes
(reusing a consumed Response and incorrect queued responses) were corrected; the original empty
behavior was then tested independently before its final change. Type checks caught unsupported
Testing Library role-query exact options; these test-only options were removed. Fixture/type
failures are not claimed as business Red. Refactoring extracted the filter-presence expression
and applied Prettier without component restructuring.

Manual Chrome verification used temporary API/Vite servers and a private acme_test schema with
28 synthetic employees: literal 100%_\\ search, exact large salary string, draft/applied separation,
combined country/department/currency filters, numeric descending salary order, and page 2 with
criteria preserved (26 matches split 25/1). A browser salary save normalized 00100.5 to 100.50,
kept filtered directory page 2, and refreshed open history with the matching change. API-down
paging showed an error; Retry after restart used applied criteria despite an unapplied search
edit. Apply showed no matches, and Reset restored all defaults/page 1 with 28 records. Screenshot:
`/private/tmp/acme-directory-controls.png`, outside Git. Creation refresh, obsolete requests,
Reset during a pending request, and narrow-screen breakpoints were not manually reproduced;
the first three have automated coverage, while responsive CSS received source review only.

The browser tab closed; stop cleaned up both servers/pools and dropped the private schema.
After closing terminal input, the harness exited 0. No listeners remained on its ports;
metadata checks found zero private test schemas and zero other acme_test connections. Development
data and the candidate API were untouched. Final npm test passed 268 backend tests (534 ms) and
84 frontend tests (5.81 s). Explicit isolated PostgreSQL integration tests passed 125 (3.50 s).
Format checks, type checks, lint, both builds, and git diff --check passed. No deployment or
10,000-row performance verification is claimed. Candidate review remains pending; Codex has
not staged, committed, pushed, deployed, or started another task.

## Task 10 — deterministic 10,000-employee seeding

The candidate confirmed Task 9B review, commit, and push and approved deterministic generation,
plausible currency-specific demo ranges, transactional batching, preserve-and-skip collisions,
and isolated performance measurements. Codex added generator/seeding/CLI functions, npm commands,
unit/integration tests, and documentation. No migrations, API/frontend behavior, dependencies,
indexes, analytics, authentication, or deployment changed. No development seeding was performed.

| Behavior | Actual Red evidence | Green evidence |
| --- | --- | --- |
| Deterministic valid generation/distribution | 6 failed: zero records/validator calls | 274 backend unit tests passed |
| Batch insertion | Inserted count was zero instead of 10,000 | 126 PostgreSQL integration tests passed |
| Collision/idempotency preservation | Duplicate primary-key error | 127 integration tests passed |
| Atomic rollback | 500 seed rows survived the second-batch failure | 128 integration tests passed |
| CLI target/environment/cleanup | 7 failed: missing target/result/error/exit behavior | 281 backend unit tests passed |

A rollback-failure client-discard unit check passed immediately and is regression coverage
(282 backend tests), not a new Red cycle. Genuine test-schema fixtures simulate a missing seed
row and a late constraint failure; production seeding performs only conflict-skipping INSERTs.
Refinement applied Prettier without new abstractions. Sandbox Supertest/PostgreSQL socket EPERM
failures were rerun with approval outside the sandbox; these were infrastructure failures,
not business Red. No type/lint/build errors remained in final checks.

A temporary harness applied existing migrations in a private acme_test schema, ran the actual
npm seed command twice (10,000 inserted, then 10,000 skipped), and verified sanitized nonzero
failure against a schema without employee tables. Each child exited; CLI wall times were
517/369/254 ms including npm/tsx overhead. The same 10,000-row schema supported five warmed
compiled listEmployees calls per representative query and EXPLAIN (ANALYZE, BUFFERS) on selected
SQL projections. Median count-plus-row timings ranged 0.47–6.88 ms; PERFORMANCE.md records
all cases, plan/projection qualifications, storage sizes, and limitations. No HTTP/browser,
concurrency load, hosted performance, or deployment verification is claimed.

The harness closed pools and dropped its schema in finally, then exited 0. Final metadata
checks found zero private test schemas and zero other acme_test connections. Development data
was untouched. Final npm test passed 282 backend tests (556 ms) and unchanged 84 frontend tests
(5.59 s). Explicit isolated PostgreSQL integration tests passed 128 (3.71 s). Format checks,
type checks, lint, both builds, and git diff --check passed; frontend assets remained unchanged.
Candidate review is pending. Codex has not staged, committed, pushed, deployed, or begun another task.
