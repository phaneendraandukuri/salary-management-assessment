import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from './database.js';
import { migrate } from './migrate.js';
import { createEmployee } from './create-employee.js';
import { updateSalary } from './update-salary.js';

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

it('explicit migration creates the salary-history table', async () => {
  const result = await observer.query("SELECT to_regclass('salary_history')::text AS table_name");
  expect(result.rows).toEqual([{ table_name: 'salary_history' }]);
});

it.each(['00100.5', '9007199254740993.01'])(
  'updates salary %s and records exact committed history',
  async (amount) => {
    expect((await createEmployee(pool, employee)).ok).toBe(true);
    const normalized = amount === '00100.5' ? '100.50' : amount;
    expect(await updateSalary(pool, employee.employeeId, amount)).toEqual({
      ok: true,
      employee: { ...employee, salaryAmount: normalized },
    });
    const stored = await observer.query(
      'SELECT currency, salary_amount::text AS amount FROM employees',
    );
    expect(stored.rows).toEqual([{ currency: 'USD', amount: normalized }]);
    const history =
      await observer.query(`SELECT employee_id, currency, old_amount::text AS old_amount,
    new_amount::text AS new_amount, changed_at FROM salary_history`);
    expect(history.rows).toEqual([
      {
        employee_id: employee.employeeId,
        currency: 'USD',
        old_amount: employee.salaryAmount,
        new_amount: normalized,
        changed_at: expect.any(Date),
      },
    ]);
  },
);

async function expectUnchanged(amount = employee.salaryAmount) {
  expect(
    (await observer.query('SELECT currency, salary_amount::text AS amount FROM employees')).rows,
  ).toEqual([{ currency: employee.currency, amount }]);
  expect((await observer.query('SELECT count(*)::int AS total FROM salary_history')).rows).toEqual([
    { total: 0 },
  ]);
}

it('preserves every digit when a large current salary becomes the old history amount', async () => {
  const amount = '9007199254740993.01';
  await createEmployee(pool, { ...employee, salaryAmount: amount });
  expect((await updateSalary(pool, employee.employeeId, '100.00')).ok).toBe(true);
  expect(
    (
      await observer.query(
        'SELECT old_amount::text AS old, new_amount::text AS new FROM salary_history',
      )
    ).rows,
  ).toEqual([{ old: amount, new: '100.00' }]);
});

it.each(['75000.50', '075000.5', '00075000.50'])(
  'rejects unchanged normalized salary %s without history',
  async (amount) => {
    await createEmployee(pool, employee);
    expect(await updateSalary(pool, employee.employeeId, amount)).toEqual({
      ok: false,
      error: { field: 'salaryAmount', code: 'salary_unchanged' },
    });
    await expectUnchanged();
  },
);

it('compares monetary values even when stored scale differs', async () => {
  await createEmployee(pool, employee);
  await pool.query('UPDATE employees SET salary_amount = $1', ['75000.5']);
  expect(await updateSalary(pool, employee.employeeId, '75000.50')).toEqual({
    ok: false,
    error: { field: 'salaryAmount', code: 'salary_unchanged' },
  });
  await expectUnchanged('75000.5');
});

it('reports a missing employee without creating history', async () => {
  expect(await updateSalary(pool, 'MISSING', '100.00')).toEqual({
    ok: false,
    error: { field: 'employeeId', code: 'employee_not_found' },
  });
  expect((await observer.query('SELECT count(*)::int AS total FROM salary_history')).rows).toEqual([
    { total: 0 },
  ]);
});

it('reports database numeric overflow without changing either table', async () => {
  await createEmployee(pool, employee);
  expect(await updateSalary(pool, employee.employeeId, `${'9'.repeat(131073)}.00`)).toEqual({
    ok: false,
    error: { field: 'salaryAmount', code: 'amount_not_storable' },
  });
  await expectUnchanged();
});

it.each(['0', '-1', '1.234', ' 100', '1e3', 100, null, undefined].map((amount) => ({ amount })))(
  'rejects invalid salary $amount without changing either table',
  async ({ amount }) => {
    await createEmployee(pool, employee);
    expect(await updateSalary(pool, employee.employeeId, amount)).toEqual({
      ok: false,
      error: { field: 'salaryAmount', code: 'invalid_amount' },
    });
    await expectUnchanged();
  },
);

it('rolls back the employee update when history insertion fails', async () => {
  await createEmployee(pool, employee);
  await pool.query(
    'ALTER TABLE salary_history ADD CONSTRAINT forced_history_failure CHECK (new_amount <> 100)',
  );
  try {
    expect(await updateSalary(pool, employee.employeeId, '100.00')).toEqual({
      ok: false,
      error: { field: 'employee', code: 'persistence_failed' },
    });
    await expectUnchanged();
  } finally {
    await pool.query('ALTER TABLE salary_history DROP CONSTRAINT forced_history_failure');
  }
});

for (const field of ['old_amount', 'new_amount'] as const) {
  it.each(['0', '-1', '1.234', 'NaN', 'Infinity', '-Infinity'])(
    `history constraint rejects ${field}=%s`,
    async (amount) => {
      await createEmployee(pool, employee);
      await updateSalary(pool, employee.employeeId, '100.00');
      await expect(
        pool.query(`UPDATE salary_history SET ${field} = $1`, [amount]),
      ).rejects.toMatchObject({ code: '23514' });
    },
  );
}

it.each(['JPY', 'usd'])('history constraint rejects currency %s', async (currency) => {
  await createEmployee(pool, employee);
  await updateSalary(pool, employee.employeeId, '100.00');
  await expect(
    pool.query('UPDATE salary_history SET currency = $1', [currency]),
  ).rejects.toMatchObject({ code: '23514' });
});

it('history constraint rejects equal old and new salaries', async () => {
  await createEmployee(pool, employee);
  await updateSalary(pool, employee.employeeId, '100.00');
  await expect(
    pool.query('UPDATE salary_history SET new_amount = old_amount'),
  ).rejects.toMatchObject({ code: '23514' });
});

it('history references an existing employee', async () => {
  await expect(
    pool.query(
      `INSERT INTO salary_history (employee_id, currency, old_amount, new_amount)
    VALUES ($1, $2, $3, $4)`,
      ['MISSING', 'USD', '100.00', '200.00'],
    ),
  ).rejects.toMatchObject({ code: '23503' });
});

it('reapplying migrations preserves employee and history records', async () => {
  await createEmployee(pool, employee);
  await updateSalary(pool, employee.employeeId, '100.00');
  const before = await observer.query('SELECT * FROM salary_history');
  await migrate(pool);
  expect((await observer.query('SELECT * FROM salary_history')).rows).toEqual(before.rows);
  expect(
    (await observer.query('SELECT salary_amount::text AS amount FROM employees')).rows,
  ).toEqual([{ amount: '100.00' }]);
});

async function waitForTwoBlockedUpdates() {
  const deadline = Date.now() + 5_000;
  do {
    const result = await observer.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM pg_stat_activity
       WHERE application_name = $1 AND wait_event_type = 'Lock'`,
      [schema],
    );
    if (result.rows[0].total === 2) return;
    await delay(10);
  } while (Date.now() < deadline);
  throw new Error('Concurrent updates did not reach the database lock barrier');
}

it.each([
  { secondAmount: '200.00', expectedHistory: 2 },
  { secondAmount: '100.00', expectedHistory: 1 },
])(
  'serializes overlapping updates to 100.00 and $secondAmount',
  async ({ secondAmount, expectedHistory }) => {
    await createEmployee(pool, employee);
    const blocker = await observer.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT employee_id FROM employees WHERE employee_id = $1 FOR UPDATE', [
        employee.employeeId,
      ]);
      const updates = Promise.all([
        updateSalary(pool, employee.employeeId, '100.00'),
        updateSalary(pool, employee.employeeId, secondAmount),
      ]);
      pending = updates;
      // Release only after PostgreSQL reports both requests waiting; no assumed winner or fixed sleep.
      await waitForTwoBlockedUpdates();
      await blocker.query('COMMIT');
      const results = await updates;
      expect(results.filter((result) => result.ok)).toHaveLength(expectedHistory);
      if (expectedHistory === 1) {
        expect(results.filter((result) => !result.ok)).toEqual([
          {
            ok: false,
            error: { field: 'salaryAmount', code: 'salary_unchanged' },
          },
        ]);
      }
      const history = await observer.query<{ old_amount: string; new_amount: string }>(
        'SELECT old_amount::text AS old_amount, new_amount::text AS new_amount FROM salary_history ORDER BY history_id',
      );
      expect(history.rows).toHaveLength(expectedHistory);
      expect(history.rows[0].old_amount).toBe(employee.salaryAmount);
      if (expectedHistory === 2)
        expect(history.rows[1].old_amount).toBe(history.rows[0].new_amount);
      const stored = await observer.query('SELECT salary_amount::text AS amount FROM employees');
      expect(stored.rows).toEqual([{ amount: history.rows[expectedHistory - 1].new_amount }]);
    } finally {
      try {
        await blocker.query('ROLLBACK');
      } finally {
        blocker.release();
        await pending;
      }
    }
  },
);
