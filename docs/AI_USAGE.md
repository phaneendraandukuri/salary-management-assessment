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
