# AI assistance record

## Collaboration

OpenAI Codex assisted with reviewing the original assessment and project instructions,
planning incremental delivery, refining `REQUIREMENTS.md`, and implementing the approved
minimal repository bootstrap, and annual salary validation. The candidate owns product
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
were changed. These checks were run by Codex. Candidate review of Task 2 remains pending;
Codex has not staged, committed, or pushed this increment.
The candidate subsequently approved canonicalizing redundant leading zeros within Task 2.
Codex added the three requested examples before implementation. `npm test` failed exactly
those three cases (53 existing tests passed): received `00100.50`, `000.01`, and `0000001.00`
instead of `100.50`, `0.01`, and `1.00`. Removing leading whole-part zeros and falling back
to `0` made all 56 tests pass (107 ms total). No numeric conversion or database limit was added.
No further refactor was justified for this one-line normalization step.
Final refinement checks: `npm test` passed all 56 tests (174 ms total); type checking,
linting, both builds, and `git diff --check` passed. Task 2 final review remains pending.

No deployed application or seed script is claimed.
