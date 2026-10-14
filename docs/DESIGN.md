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
