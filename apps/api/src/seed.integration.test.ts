import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from './database.js';
import { migrate } from './migrate.js';
import { createEmployee } from './create-employee.js';
import { updateSalary } from './update-salary.js';
import { seedEmployees } from './seed.js';
import { generateSeedEmployees } from './seed-employees.js';

const employee = {
  employeeId: 'SALARY-001',
  name: 'Synthetic Salary Employee',
  email: 'salary@example.test',
  department: 'Engineering',
  role: 'Developer',
  country: 'India',
  currency: 'USD',
  salaryAmount: '75000.50',
};

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || new URL(connectionString).pathname !== '/acme_test') {
  throw new Error('TEST_DATABASE_URL must point to the dedicated acme_test database');
}
const schema = `test_${randomUUID().replaceAll('-', '')}`;
const isolatedUrl = new URL(connectionString);
isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
isolatedUrl.searchParams.set('application_name', schema);
let admin: Pool;
let pool: Pool;
let observer: Pool;
let schemaCreated = false;

beforeAll(async () => {
  admin = createPool(connectionString);
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  pool = createPool(isolatedUrl.toString());
  observer = createPool(isolatedUrl.toString());
  await migrate(pool);
});

beforeEach(async () => {
  await pool.query('TRUNCATE salary_history, employees');
});

afterAll(async () => {
  try {
    await pool?.end();
  } finally {
    try {
      await observer?.end();
    } finally {
      try {
        if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin?.end();
      }
    }
  }
});

it('seeds exactly 10000 valid rows with correct currencies and exact salary values', async () => {
  expect(await seedEmployees(pool)).toEqual({ inserted: 10000, skipped: 0 });
  expect(
    (
      await observer.query(
        'SELECT currency, count(*)::int AS total FROM employees GROUP BY currency ORDER BY currency',
      )
    ).rows,
  ).toEqual([
    { currency: 'EUR', total: 2500 },
    { currency: 'GBP', total: 2500 },
    { currency: 'INR', total: 2500 },
    { currency: 'USD', total: 2500 },
  ]);
  for (const row of [generateSeedEmployees()[0], generateSeedEmployees().at(-1)!]) {
    expect(
      (
        await observer.query(
          'SELECT salary_amount::text AS amount, name, email FROM employees WHERE employee_id = $1',
          [row.employeeId],
        )
      ).rows,
    ).toEqual([{ amount: row.salaryAmount, name: row.name, email: row.email }]);
  }
  expect(
    (await observer.query('SELECT count(*)::int AS total FROM salary_history')).rows[0].total,
  ).toBe(0);
});

it('reruns safely, restores missing seed rows, and preserves arbitrary conflicts, edits, and history', async () => {
  const conflict = { ...employee, employeeId: 'SEED-00001', name: 'Existing Conflict' };
  expect((await createEmployee(pool, employee)).ok).toBe(true);
  expect((await createEmployee(pool, conflict)).ok).toBe(true);
  expect(await seedEmployees(pool)).toEqual({ inserted: 9999, skipped: 1 });
  expect(
    (
      await observer.query('SELECT name FROM employees WHERE employee_id = $1', [
        conflict.employeeId,
      ])
    ).rows,
  ).toEqual([{ name: conflict.name }]);
  expect((await updateSalary(pool, 'SEED-00002', '9007199254740993.01')).ok).toBe(true);
  const snapshot = (await observer.query('SELECT * FROM employees ORDER BY employee_id')).rows;
  const history = (await observer.query('SELECT * FROM salary_history ORDER BY history_id')).rows;
  expect(await seedEmployees(pool)).toEqual({ inserted: 0, skipped: 10000 });
  expect((await observer.query('SELECT * FROM employees ORDER BY employee_id')).rows).toEqual(
    snapshot,
  );
  expect((await observer.query('SELECT * FROM salary_history ORDER BY history_id')).rows).toEqual(
    history,
  );
  // Only this private test schema is modified to simulate a missing fixture.
  await pool.query("DELETE FROM employees WHERE employee_id = 'SEED-10000'");
  expect(await seedEmployees(pool)).toEqual({ inserted: 1, skipped: 9999 });
  expect((await observer.query('SELECT count(*)::int AS total FROM employees')).rows[0].total).toBe(
    10001,
  );
  expect(
    (
      await observer.query(
        "SELECT salary_amount::text AS amount FROM employees WHERE employee_id = 'SEED-00002'",
      )
    ).rows[0].amount,
  ).toBe('9007199254740993.01');
  expect((await observer.query('SELECT * FROM salary_history ORDER BY history_id')).rows).toEqual(
    history,
  );
});

it('rolls back earlier batches on a later failure and leaves existing data untouched', async () => {
  await createEmployee(pool, employee);
  await pool.query(
    "ALTER TABLE employees ADD CONSTRAINT seed_failure CHECK (employee_id <> 'SEED-00501')",
  );
  try {
    await expect(seedEmployees(pool)).rejects.toMatchObject({ code: '23514' });
    expect((await observer.query('SELECT employee_id FROM employees')).rows).toEqual([
      { employee_id: employee.employeeId },
    ]);
    expect(
      (await observer.query('SELECT count(*)::int AS total FROM salary_history')).rows[0].total,
    ).toBe(0);
  } finally {
    await pool.query('ALTER TABLE employees DROP CONSTRAINT seed_failure');
  }
  expect(await seedEmployees(pool)).toEqual({ inserted: 10000, skipped: 0 });
});
