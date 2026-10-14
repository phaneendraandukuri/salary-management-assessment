# Local 10,000-employee baseline

Measured 14 October 2026 on local Homebrew PostgreSQL 18.6 (Apple ARM64), Node.js 24.18.
A temporary harness applied existing migrations and ran npm run db:seed twice only in a random
private acme_test schema. First run inserted 10,000 (517 ms CLI wall time); rerun inserted zero
and skipped 10,000 (369 ms). Times include npm/tsx startup. No development data was touched.

After ANALYZE employees, each case called the compiled listEmployees once to warm it, then five
times using performance.now(). These timings include count plus full row retrieval and local
database round trips. They exclude HTTP, React rendering, and remote-host/network latency.

| Query (25 rows/page) | Matches | Min / median / max, ms |
| --- | ---: | ---: |
| Default page 1 | 10,000 | 0.40 / 0.47 / 0.59 |
| Page 400, offset 9,975 | 10,000 | 1.37 / 1.50 / 1.71 |
| Name/email substring Alex | 1,250 | 3.41 / 3.57 / 4.63 |
| Name/email substring seed-099 | 100 | 6.42 / 6.88 / 7.53 |
| India + Engineering + INR | 500 | 0.54 / 0.55 / 0.61 |
| Salary numeric descending | 10,000 | 1.96 / 1.99 / 1.99 |

EXPLAIN (ANALYZE, BUFFERS) on representative SQL projections found:

- ID-only first/deep pages used the primary-key index. The deep page scanned 10,000 entries to
  discard 9,975, demonstrating OFFSET cost. These projection plans are not full-row query plans.
- Substring count used a sequential scan, examining 10,000 rows and matching 1,250 (2.75 ms).
- Filtered and unfiltered salary projections used sequential scans plus top-N heapsort (28 kB).
  Filtered sorting examined 10,000 rows, retained 500, and returned 25 (0.41 ms); unfiltered
  sorting took 0.84 ms. All recorded buffers were hits after warmup.
- Employee table plus indexes: 1,654,784 bytes; empty history table/indexes: 24,576 bytes.
  This is dataset storage, not total database/provider quota consumption.

To inspect a plan in a deliberately selected, seeded disposable database/schema:

```sql
ANALYZE employees;
EXPLAIN (ANALYZE, BUFFERS)
SELECT employee_id, salary_amount FROM employees
WHERE country = 'India' AND department = 'Engineering' AND currency = 'INR'
ORDER BY salary_amount DESC, employee_id ASC LIMIT 25;
```

For repeat timings, call listEmployees from a temporary Node script with a dedicated pool,
one warmup and five timed calls, then close the pool. No speed assertions belong in tests.
The temporary harness/schema were removed. No new indexes are justified by this small local
baseline; hosted cold starts, concurrent load, growing history, and less uniform data remain
unmeasured. This is not a production benchmark or availability claim.
