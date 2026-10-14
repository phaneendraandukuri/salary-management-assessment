# Engineering decisions

## Annual salary input — Task 2

- Support uppercase INR, USD, EUR, and GBP. Each uses two fractional digits in this scope.
- Accept a positive decimal string with digits before the decimal point and, if present,
  one or two fractional digits. Reject signs, scientific notation, separators, whitespace,
  non-string values, and excess precision. Do not trim or round invalid input into validity.
- Normalize the fractional part to exactly two digits: `75000` → `75000.00`,
  `75000.5` → `75000.50`. Remove redundant leading whole-part zeros, retaining one zero
  for amounts below one: `00100.5` → `100.50`, `000.01` → `0.01`.
  This gives equivalent amounts the same string representation without changing their value.
- Keep the amount as a string throughout validation and normalization. After checking its
  syntax, any nonzero digit establishes positivity without floating-point conversion.
  There is no application-defined maximum salary; finite runtime resources still apply.
- Return an explicit success/error result. Check currency first; if both inputs are invalid,
  return `unsupported_currency`. The function is pure and has no I/O or framework dependency.

Decimal strings preserve exact values and serialize directly to JSON. Integer minor units
are an alternative, but JavaScript numbers require safe-integer bounds and `bigint` needs
explicit JSON serialization. A decimal library is unnecessary for validation without arithmetic.

Salary validation does not establish database representability. The persistence decision is
below; arithmetic and aggregate rounding remain for their respective increments.

## Employee creation — Task 3

- Employee ID is a case-sensitive text primary key (`COLLATE "C"`); PostgreSQL enforces
  uniqueness even for concurrent inserts. No extra internal ID or unique-email rule is added.
- Trim required employee text fields and check a basic email shape. Country, department,
  and role remain free text; this is not email deliverability or geographic validation.
- Store salary as unconstrained `NUMERIC`, passing canonical decimal strings into SQL and
  returning `salary_amount::text`. No JavaScript number conversion or chosen salary ceiling.
  PostgreSQL's physical range still applies; numeric overflow becomes `amount_not_storable`.
- `NOT NULL` and `CHECK` constraints reject blank required text, malformed email,
  unsupported currencies, nonpositive/nonfinite salaries, and scale above two. Unconstrained
  NUMERIC plus a scale check rejects excess precision instead of rounding it on assignment.
- Use one parameterized `INSERT ... RETURNING`. The statement is atomic without an extra
  application transaction. Duplicate primary keys map to `duplicate_employee_id`; unexpected
  database failures return `persistence_failed` without exposing SQL details.
- Use a straightforward `pg.Pool`, with explicit shutdown in scripts/tests. Migration execution
  acquires one client, commits or rolls back, and releases it in `finally`. Only the initial
  numbered SQL file is needed; no ORM or migration framework.
- Keep unit tests independent of PostgreSQL. Integration tests require `acme_test`, use
  random private schemas, and verify committed records through a separate connection pool.

Native Homebrew PostgreSQL was chosen after the Docker runtime was unavailable. Local trusted
authentication is convenient for development; hosted credentials/TLS are a separate deployment
decision. Free-text country/department values can have inconsistent spelling; lookup tables
and normalization rules are deliberately deferred rather than silently imposed.

## Employee create/list HTTP API — Task 4

- `createApp` accepts just two employee functions. The HTTP layer does not construct a pool;
  `server.ts` owns the pool and supplies real operations. The existing exported health-only
  app keeps health tests independent; HTTP tests supply typed substitutes, while integration
  tests exercise actual PostgreSQL. No dependency-injection framework or new library.
- Validate query values as `unknown`; accept only single positive integer strings. Default
  page/size to 1/25, cap size at 100, and reject unsafe numbers or calculated offsets. Extended
  query parsing makes nested/array forms explicit so they can be rejected rather than ignored.
- Read via parameterized LIMIT/OFFSET and employee-ID ordering, with a separate count query.
  This is simple for 10,000 records and numbered pages. Counts and rows are not a single
  snapshot under concurrent writes; cursor pagination or snapshot transactions are deferred.
- Map domain failures to explicit HTTP statuses and JSON error codes. Express 5 forwards
  rejected async handlers to the final error middleware; SQL details are not returned.
  JSON parsing is limited to 1 MiB, and invalid/oversized bodies do not call creation.
- Require DATABASE_URL at startup; migrations remain explicit. Database connections are lazy,
  so `/health` remains liveness rather than readiness. SIGINT/SIGTERM closes the listener,
  drains active requests, and ends the pool; no forced shutdown deadline is introduced yet.

## React employee directory — Task 5

- One component owns the requested page and loading/error/loaded state. A discriminated union
  makes employee data available only in the loaded state. A retry counter triggers a fresh
  request for the same page; pagination is fixed at 25 rows with bounded Previous/Next buttons.
- A small fetch helper uses relative `/api` URLs and local response types. Salary values are
  displayed directly as strings. The JSON type assertion trusts our controlled API contract;
  it does not perform runtime schema validation. Network, HTTP, and JSON parsing failures
  produce a friendly error and Retry. A valid JSON response with a wrong shape is not validated.
- Effect cleanup aborts obsolete requests. Both success and failure handlers check the signal
  before updating state, including React StrictMode's development effect replay. The previous
  table is replaced by loading during page changes, keeping visible rows consistent with the page.
- Native table/buttons and minimal CSS avoid a UI library. Horizontal scrolling preserves the
  seven required columns on narrow screens. Vitest/jsdom/Testing Library test user behavior;
  controlled promises make loading and stale-request tests deterministic without PostgreSQL.
- Vite's development proxy avoids local cross-origin configuration. Production must route
  the same relative `/api` path to the backend during deployment. No production routing is
  claimed here. Caching, URL-based page state, and employee creation are outside this increment.

## React employee creation — Task 6

- A separate form uses native required/email checks, local submission state, and uncontrolled
  inputs read with FormData. Its fixed eight string-valued controls justify the Employee type
  assertion; salary is a text input with decimal keyboard guidance, never a JavaScript number.
  The backend remains authoritative for validation, normalization, and uniqueness.
- POST returns a discriminated success/error result. Known validation and duplicate-ID errors
  have friendly messages linked to the invalid field. Unknown errors use a general message;
  raw server details are not rendered. Own-property checks prevent inherited object keys from
  being treated as message strings. HTTP 201 must contain a string employee ID to confirm success.
- Disable the form while submitting and do not retry POST automatically. Network failures or
  unreadable success responses leave the outcome uncertain: check the directory before trying
  again. This is not an idempotency mechanism. A known HTTP failure retains input for correction.
- Successful creation resets the form and invokes a small App callback that refreshes the
  currently selected directory page using a functional state update. Creation feedback and
  directory state stay independent: a failed refresh does not undo or misreport a confirmed
  insert. Employee-ID ordering can place the new record on a different page.

## Atomic salary persistence — Task 7A

- Migration 002 adds history ID, employee foreign key, original currency, old/new NUMERIC amounts,
  and a database-generated TIMESTAMPTZ. NOT NULL/CHECK constraints enforce supported currencies,
  positive finite amounts with at most two fractional digits, and different old/new values.
  An employee/timestamp/history-ID index supports the subsequent bounded history query.
- The explicit migration runner lists 001 then 002, applying both in one transaction. No ledger,
  ORM, or migration framework; reapplication creates missing objects without altering existing
  definitions or records. Migration 001 is unchanged. SQL files must accompany the compiled API.
- `updateSalary` acquires one pool client, begins a transaction, and reads the employee with
  `SELECT ... FOR UPDATE`. All statements use that client. Under default READ COMMITTED isolation,
  an overlapping edit waits and then sees the latest committed salary before validating.
- Reuse the salary validator with the stored currency. Normalize both requested/stored amounts
  for equality without numbers; this also handles valid stored amounts with fewer fractional
  digits. Reject unchanged values as `salary_unchanged`; missing IDs become `employee_not_found`.
  Update only salary, insert history, and commit. History timestamps use `clock_timestamp()` at
  insertion rather than transaction-start time, which could precede a wait on another editor.
- Roll back rejected edits and failed SQL; release the client in finally. Failed rollback discards
  the client. Numeric overflow maps to `amount_not_storable`; other failures are sanitized.
  A lost connection during COMMIT can leave the outcome unknown to the caller even though the
  database keeps both writes atomic. No automatic retries or idempotency mechanism are added.
- Integration concurrency tests hold an external row lock until PostgreSQL reports both edits
  blocked. They assert the resulting chain without assuming a winner; identical edits create
  one record and one unchanged error. The five-second timeout diagnoses a missing barrier;
  polling delay is not a correctness assertion. New test cleanup uses finally blocks. The older
  suite only gains the necessary two-table TRUNCATE; its cleanup-hardening follow-up is deferred.

No salary HTTP endpoints, history retrieval helper, or frontend editor are part of Task 7A.
The agreed `salary_unchanged` → HTTP 409 mapping belongs to Task 7B.

## Salary HTTP APIs and history retrieval — Task 7B

- Extend the existing app injection to four employee operations; server.ts wires real functions.
  PATCH validates the JSON envelope/string amount then delegates to unchanged Task 7A persistence.
  It changes only salary; extra fields cannot change currency or employee details. Preserve each
  operation error's code/field: unchanged → 409, missing → 404, persistence failure → 500, amount
  validation/storage errors → 400. Unsupported request currency is not a salary-update error,
  because the operation uses stored currency. Existing parser/body-limit handling remains shared.
- History retrieval first checks employee existence, then counts and selects only that employee's
  history. Parameterized ID/LIMIT/OFFSET, existing pagination validation, and the migration 002
  index keep this bounded. Missing employees differ from existing employees with empty history.
  Three straightforward queries avoid a complex join or transaction; count/rows may differ during
  concurrent writes, matching the existing directory trade-off.
- Cast history IDs and NUMERIC amounts to text in SQL. Sort using the original numeric history ID
  and full database timestamp, not formatted strings. Convert pg's Date to UTC ISO for JSON;
  display precision is milliseconds, while PostgreSQL retains its finer timestamp precision.
  `Omit<SalaryHistoryEntry, 'changedAt'> & { changedAt: Date }` describes the database row before
  that conversion. Only counts/pagination metadata use JavaScript numbers.
- Database-independent Supertest tests cover contracts/mappings and guard unwanted persistence
  calls. Isolated PostgreSQL tests cover exact values, large IDs, timestamp ties, page boundaries,
  employee isolation, and actual update-to-history/error behavior. No new dependencies or schemas.

## React salary editor — Task 8A

- One selected employee snapshot opens a separate SalaryEditForm panel. Key it by employee ID:
  changing selection remounts local state instead of retaining the previous employee's unsaved
  amount. Cancel unmounts it, so reopening starts from the directory's current value. Pending
  saves disable input, Save/Cancel, and all employee edit actions; no PATCH is cancelled mid-save.
- Keep editable/current confirmed salary as strings. The helper encodes the employee ID and
  sends only salaryAmount. A successful response must identify that employee and provide a
  nonempty string amount; the controlled backend remains responsible for its monetary validity.
  Currency is displayed from the employee and remains fixed by the existing backend operation.
- Local save state is independent of directory loading/error state. On confirmation, show the
  returned normalized amount and refresh the current page using the existing callback. The
  directory is not optimistically changed. Refresh failure cannot turn a confirmed save into a
  failed update. The form's Close action after success closes feedback; it does not undo the save.
- Retain rejected input and distinguish amount/storage validation, unchanged conflict, missing
  employee, general failure, and uncertain network/unusable-success outcomes. Preserve API error
  fields for input feedback. No automatic retry; no stale-version check or new concurrency rule.
- Native controls, scoped styles, local types, and callbacks keep this incremental. Creation
  behavior is unchanged; history viewing remains a separate increment.

## React salary history — Task 8B

- A separate SalaryHistory panel owns its page, loading/error/data state, and retries. Requests
  use 25 rows per page and retain backend ordering. Money and BIGINT history IDs stay strings;
  timestamps display the API's ISO value under an explicit UTC heading.
- Key the panel by employee ID and a refresh revision. Switching employees or reopening resets
  it to page 1. Only a confirmed salary save for the currently selected employee increments
  that revision. A functional state update checks the current selection even if it changed
  while a save was pending. Editor confirmation and directory/history retrieval stay independent.
- Abort requests on cleanup and ignore aborted results, including obsolete successes/errors
  and StrictMode replay. The fetch helper checks requested employee identity, string-valued
  fields, and pagination metadata at runtime; TypeScript assertions alone cannot validate JSON.
  Missing employees get distinct feedback; other retrieval failures allow a same-page retry.
- No cache, new dependencies, or client sorting. Counts/rows still inherit the API's concurrent
  write trade-off, and displayed timestamps retain its millisecond precision. The helper checks
  response shape rather than duplicating backend monetary or timestamp validation.

## Backend directory criteria — Task 9A

- Parse optional criteria separately from unchanged pagination validation. Search/filter strings
  are trimmed and blanks omitted; sort values must match the allowlist exactly. Country and
  department remain case-sensitive free-text matches. Currency uses the existing four codes.
  Repeated/nested values return field-specific invalid_query; unsupported currency retains its
  existing code. Unknown query parameters remain ignored, as before.
- Extend the existing retrieval argument with optional DirectoryCriteria; no response fields
  are added. Build one WHERE clause and parameter array shared by count and rows. Parenthesize
  the name/email OR before combining exact filters with AND. ILIKE uses explicit ESCAPE '!':
  prefix !, %, and _ with ! so user text is literal; backslash needs no escaping with this marker.
- SQL sort expressions come only from a fixed mapping; direction becomes a fixed ASC/DESC token.
  Object.hasOwn rejects inherited keys. Salary sorts on the original NUMERIC column, not the
  text response alias; IDs break ties ascending. Other text ordering uses database collation.
  Across currencies, amount sorting is nominal and does not imply equivalent purchasing power.
- Keep simple scans and LIMIT/OFFSET for now. No new indexes/extensions are justified before
  reproducible 10,000-row measurements. Counts/rows remain separate snapshots under concurrent
  writes. Frontend controls, seeding, and performance verification belong to later increments.

## React directory controls — Task 9B

- Keep controlled draft values separate from the applied criteria in the existing request
  state. Apply trims filters and requests page 1; Reset restores all defaults and requests
  page 1 even during loading/error. Neither control is disabled by a directory request.
  A persistent summary describes applied criteria rather than pending edits.
- Paging, Retry, creation, and confirmed salary-save refresh use functional updates to retain
  the latest applied criteria/page. Existing effect cleanup and aborted-result guards protect
  against obsolete responses. Salary editor/history state remains independent.
- Extend the existing GET helper with optional string criteria and URLSearchParams encoding.
  Native selects provide supported choices; the backend remains authoritative for validation.
  Omit blank filters and default sort parameters, preserving the original no-criteria URL.
  No monetary conversion, client filtering, or employee sorting occurs in React.
- Put a responsive labeled form inside the directory card; country/department are text fields
  with exact-match guidance. Explicit Apply avoids per-keystroke requests and debounce state.
  No page-derived options, cache, URL persistence, dependencies, or component restructuring.
  Filtered zero results differ from an empty directory; later empty pages allow going back.

## Deterministic employee seeding — Task 10

- One pure generator creates 10,000 stable IDs/emails and validates each record before database
  access. Four country/currency pairs each receive 2,500 rows; departments and roles vary within
  each pair. Names explicitly identify synthetic data. No random seed, clock, or external data.
- Salary whole parts use bounded integer arithmetic; fractional digits are generated separately
  and joined as strings. No decimal monetary value passes through a JavaScript Number. Demo
  ranges do not change application salary validation or imply exchange-rate equivalence.
- One checked-out client executes BEGIN, twenty parameterized 500-row INSERTs, then COMMIT.
  Each batch has 4,000 parameters. ON CONFLICT(employee_id) DO NOTHING preserves arbitrary
  collisions and edits; actual affected-row counts establish inserted/skipped totals. No seed
  ownership claim, history insertion, deletion, or update. An error rolls back all new rows;
  failed rollback discards the client, and finally releases it. CLI finally closes its pool.
- The explicit CLI requires DATABASE_URL with host/database, prints only host/port/database,
  and does not use TEST_DATABASE_URL. Migrations remain separately invoked. Errors are sanitized.
  A lost connection during commit can leave the outcome uncertain; preserve-and-skip makes a
  rerun safe, but original inserted/skipped counts may be unavailable. Concurrent seeds can wait
  on conflicts; existing PostgreSQL uniqueness still protects records.
- Local measurements are in PERFORMANCE.md. No schema/index changes, dependencies, bulk-copy
  library, or benchmarking framework. Full regeneration materializes 10,000 records in memory;
  this is appropriate for the fixed assessment dataset, not a general import pipeline.

## Production static serving — Task 11

- server.ts validates configuration before constructing a pool/listener. Only production mode
  supplies the module-relative apps/web/dist directory to createApp. Required index.html and
  assets directory are checked before listening; development remains API + Vite. PORT is a
  digit-only safe integer from 0 to 65535; explicit IPv4 binding supports hosted access.
- Existing health/API handlers run first. Before static middleware, normalize decoded URL paths
  and block the reserved /api prefix, including encoded/slash/dot-segment forms. Express static
  serves only the supplied build root, ignores dotfiles, and does not redirect directories.
  No catch-all HTML route is needed because the UI has no client-side router. The build directory
  is a trusted build artifact; source/environment/migration files must never be copied into it.
- import.meta.url describes this module's location; fileURLToPath converts its relative URL to
  an absolute filesystem path. Source and compiled modules have the same directory depth, so
  the frontend and existing migration paths work from either layout without process.cwd().
- Keep apps/api/migrations beside apps/api/dist in deployment artifacts. No duplicated SQL or
  migration framework: build/startup do not execute migrations or seeding. Local compiled smoke
  checks confirmed both migrations can be read and reapplied from another working directory.
  Cloud connectivity, authentication, insights, and safe error diagnostics remain separate work.

## Backend compensation insights — Task 12A

- One GET endpoint accepts trimmed, exact country/department filters and a strict grouping enum.
  Repeated/nested/non-string criteria are invalid. Unrecognized parameters remain ignored, as
  in the existing directory API. Grouping identifiers come from a fixed map; values use parameters.
  No currency filter or pagination is introduced. The lightweight app injection gains one function.
- One SQL statement filters current employees, ranks salaries within group value AND currency,
  and aggregates those same partitions. Currency grouping uses a null group value. ROW_NUMBER
  orders NUMERIC salary then employee ID; COUNT OVER establishes the partition size. Integer
  positions (n+1)/2 and (n+2)/2 select the middle row(s), averaged with NUMERIC. No percentile_cont
  double-precision conversion, JavaScript monetary arithmetic, or decimal library.
- PostgreSQL SUM/AVG/MIN/MAX remain NUMERIC. ROUND(...,2)::text formats totals/extrema without
  losing stored precision and rounds mean/median for the response (positive half-cent ties up).
  Repeating means are represented at PostgreSQL NUMERIC calculation precision before final
  two-place rounding. Physical NUMERIC overflow can still fail an aggregate even if individual
  salaries are storable; HTTP sanitizes this as persistence_failed without a chosen salary ceiling.
- Groups sort by group value then currency with C collation. Each primary-key employee appears
  once in the filtered source and exactly one returned group; summing numeric headcounts gives
  distinct matching employees. Only headcounts pass through Number. A single statement uses one
  database snapshot, so counts/statistics reconcile under concurrent writes. Later requests see
  committed salary changes; history does not contribute to these figures.
- Exact median requires partition sorting. The local 10,000-row measurements are recorded in
  PERFORMANCE.md; no indexes, cache, schema changes, or generic analytics framework were added.

## React compensation insights — Task 12B

- One independent panel starts closed. Opening mounts fresh defaults; closing unmounts and
  aborts requests. Draft country/department/grouping values stay separate from applied query
  state. Apply/Reset/Retry use the existing local-state approach; no router, cache, or library.
- A small GET helper checks requested grouping, supported currencies, group labels, exact
  two-place monetary strings, unique group keys, and safe/reconciled headcounts. It validates
  response shape without recalculating compensation. Only employee counts use numeric addition.
- Loaded/error results carry their request reference and refresh version. A result for another
  request/version renders as loading immediately, including before a refresh effect executes.
  Cleanup aborts, and both success/failure handlers ignore aborted results, including StrictMode.
  The state union makes data available only after a matching successful request.
- App increments a refresh version only through confirmed-write callbacks. An open panel
  refetches its applied criteria; closed panels make no request. Directory, history, mutation
  feedback, and insights state remain independent. No mutation retry or optimistic calculation.
- Native selects expose the three grouping choices; their value assertion describes those
  known options, while API validation remains authoritative. A responsive form and scrollable
  table display currency/group values explicitly. Wide values stay exact rather than being
  abbreviated or converted through Number. Broader navigation remains a separate increment.

## HR authentication foundation — Task 13A-1

- One environment-configured account avoids user management. A fixed, validated scrypt hash
  format uses N=32768, r=8, p=3, 16-byte random salt, 64-byte derived key and 64 MiB maxmem.
  Verification is asynchronous and compares equal-length keys with timingSafeEqual. It still
  derives the key for a wrong username, then gives the same generic credential error.
- The interactive helper hides input, restores terminal mode, and writes only a salted hash
  to a new owner-only file outside the repository. Secret configuration fails startup before
  pool/listener creation; no defaults or plaintext passwords are provided.
- express-session owns session IDs/cookies/lifecycle; connect-pg-simple shares the existing
  pool. Migration 003 matches its sid/JSON/expiry schema and indexes expiry. No automatic
  table creation, user table, JWT, browser token storage, custom store, or background pruning.
- Auth routes regenerate and explicitly save before success. Failure destroys/unsets the
  request session so response completion cannot retry saving authenticated state. Cleanup
  is best effort and cannot turn a saved login into failure. Logout waits for deletion before
  clearing the cookie. Store callbacks use the existing sanitized error handler.
- Expiry is enforced by store retrieval even while expired rows remain. Cookie lifetime is
  30 minutes; complete sliding idle/eight-hour absolute policy is deferred to Task 13A-2.
  Secure is mandatory in production; simulated HTTPS verifies its flag, not Render proxy
  behavior. Auth routes alone load sessions, preserving existing employee API behavior.
- SessionData module augmentation describes our optional username property to TypeScript;
  it does not alter library behavior. Small Promise adapters await callback-based operations.
  Normal tests use MemoryStore only as a test double; runtime always uses PostgreSQL.
- This increment is not production-ready. Business API protection, origin checks, throttling,
  expiry policy and proxy verification remain mandatory. React login and deployment are
  separate increments; safe diagnostics remain separately deferred.

## Backend authentication hardening — Task 13A-2

- Session middleware now covers /api; employee/salary/history/insights routes require the HR
  session. Supplying business operations without auth configuration fails app creation. No
  production bypass exists. Health/assets stay outside session middleware. API responses use
  no-store; HTTPS/Origin checks precede parsing, throttling precedes login parsing/session IO,
  and authentication/renewal precedes business parsing and operations.
- createdAt stays fixed from login; lastActivityAt tracks persisted authenticated activity.
  Invalid/missing/future timestamps, >=30-minute idle time or >=eight-hour age reject the
  session. Renewed expiry is min(idle window, absolute time remaining). Store expiry uses
  whole-second rounding; the metadata check enforces the precise millisecond boundary.
- Each session's reload/renewal, login regeneration and logout serialize using a small
  process-local Promise chain. Reload inside the lock prevents a stale request from overwriting
  newer activity or restoring a deleted session. The established library still owns all session
  reads/writes/deletion; no custom persistence SQL or migration was introduced. Locks release
  in finally, discard idle entries and exclude business queries. This supports the selected
  single-process deployment, not distributed replicas.
- Renewal explicitly saves before business execution; implicit pg-store touch is disabled.
  Failed renewal unsets only this request's session, preventing an automatic response-end
  save while preserving another request's valid session. Expired-session deletion and pruning
  remain best effort. A reload of a concurrently removed row maps the session library's fixed
  missing-row error to 401; real storage errors remain sanitized 500.
- APP_ORIGIN is one exact canonical HTTP origin (HTTPS in production). Unsafe API methods
  require it, including login/logout. No CORS or Referer fallback is added. Vite preserves
  browser Origin despite changing the proxied Host. Production trusts one hop; development
  ignores forwarding headers. Hosted topology remains unverified.
- express-rate-limit provides five/IP and 60/global attempts per 15 minutes, counting all
  permitted-origin attempts. Global limiting runs first to bound per-IP bucket growth; the
  library handles IPv6 subnet keys. Two asynchronous scrypt jobs may run; excess jobs receive
  503 without queuing and slots release in finally. Process-local counters reset on restart;
  shared-IP reviewers or global abuse can temporarily exhaust limits.
- A shared test-only helper uses real login and cookies, with runtime-random credentials and
  MemoryStore for ordinary HTTP tests, PostgreSQL for integration tests. Business assertions
  remain intact. The helper is excluded from production compilation. React login and safe
  diagnostics remain separate increments.
