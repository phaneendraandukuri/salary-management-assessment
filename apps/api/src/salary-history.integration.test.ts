import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from './database.js';
import { migrate } from './migrate.js';
import { createEmployee } from './create-employee.js';
import { listSalaryHistory } from './list-salary-history.js';
import { createApp } from './app.js';
import { listEmployees } from './list-employees.js';
import { updateSalary } from './update-salary.js';
import request from 'supertest';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || new URL(connectionString).pathname !== '/acme_test') {
  throw new Error('TEST_DATABASE_URL must point to the dedicated acme_test database');
}
const schema = `test_${randomUUID().replaceAll('-', '')}`;
const isolatedUrl = new URL(connectionString);
isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
let admin: Pool;
let pool: Pool;
let schemaCreated = false;

const employee = {
  employeeId: 'HISTORY-001',
  name: 'Synthetic History Employee',
  email: 'history@example.test',
  department: 'Engineering',
  role: 'Developer',
  country: 'India',
  currency: 'USD',
  salaryAmount: '75000.50',
};

beforeAll(async () => {
  admin = createPool(connectionString);
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  pool = createPool(isolatedUrl.toString());
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
      if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await admin?.end();
    }
  }
});

describe('listSalaryHistory with PostgreSQL', () => {
  it('returns ordered, bounded employee history with exact amounts, string IDs, and UTC timestamps', async () => {
    await createEmployee(pool, employee);
    await createEmployee(pool, { ...employee, employeeId: 'OTHER' });
    const base = { employeeId: employee.employeeId, currency: 'USD' };
    const first = {
      ...base,
      historyId: '9007199254740993',
      oldAmount: '10.00',
      newAmount: '20.00',
      changedAt: '2026-01-01T12:00:00.000Z',
    };
    const second = {
      ...base,
      historyId: '9007199254740994',
      oldAmount: '20.00',
      newAmount: '9007199254740993.01',
      changedAt: '2026-01-02T12:00:00.000Z',
    };
    const third = {
      ...base,
      historyId: '9007199254740995',
      oldAmount: '9007199254740993.01',
      newAmount: '50.00',
      changedAt: second.changedAt,
    };
    for (const row of [
      third,
      first,
      second,
      { ...first, employeeId: 'OTHER', historyId: '9007199254740996' },
    ]) {
      await pool.query(
        `INSERT INTO salary_history (history_id, employee_id, currency, old_amount, new_amount, changed_at)
        OVERRIDING SYSTEM VALUE VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.historyId, row.employeeId, row.currency, row.oldAmount, row.newAmount, row.changedAt],
      );
    }
    expect(await listSalaryHistory(pool, employee.employeeId, { page: 1, pageSize: 2 })).toEqual({
      ok: true,
      historyPage: { history: [third, second], total: 3, page: 1, pageSize: 2 },
    });
    expect(await listSalaryHistory(pool, employee.employeeId, { page: 2, pageSize: 2 })).toEqual({
      ok: true,
      historyPage: { history: [first], total: 3, page: 2, pageSize: 2 },
    });
    expect(await listSalaryHistory(pool, employee.employeeId, { page: 3, pageSize: 2 })).toEqual({
      ok: true,
      historyPage: { history: [], total: 3, page: 3, pageSize: 2 },
    });
  });

  it('returns a successful empty page for an existing employee with no history', async () => {
    await createEmployee(pool, employee);
    expect(await listSalaryHistory(pool, employee.employeeId, { page: 1, pageSize: 25 })).toEqual({
      ok: true,
      historyPage: { history: [], total: 0, page: 1, pageSize: 25 },
    });
  });

  it('distinguishes a missing employee from an empty history', async () => {
    expect(await listSalaryHistory(pool, 'MISSING', { page: 1, pageSize: 25 })).toEqual({
      ok: false,
      error: { field: 'employeeId', code: 'employee_not_found' },
    });
  });
});

function api() {
  return createApp({
    createEmployee: (input) => createEmployee(pool, input),
    listEmployees: (pagination) => listEmployees(pool, pagination),
    updateSalary: (employeeId, amount) => updateSalary(pool, employeeId, amount),
    listSalaryHistory: (employeeId, pagination) => listSalaryHistory(pool, employeeId, pagination),
  });
}

describe('salary HTTP API with PostgreSQL', () => {
  it('creates, updates, and paginates the exact history through HTTP', async () => {
    const app = api();
    expect((await request(app).post('/api/employees').send(employee)).status).toBe(201);
    const large = '9007199254740993.01';
    const first = await request(app)
      .patch(`/api/employees/${employee.employeeId}/salary`)
      .send({ salaryAmount: `00${large}`, currency: 'EUR', name: 'Ignored' });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ employee: { ...employee, salaryAmount: large } });
    const second = await request(app)
      .patch(`/api/employees/${employee.employeeId}/salary`)
      .send({ salaryAmount: '80000' });
    expect(second.status).toBe(200);
    const newest = await request(app).get(
      `/api/employees/${employee.employeeId}/salary-history?pageSize=1`,
    );
    const entry = {
      historyId: expect.stringMatching(/^[0-9]+$/),
      employeeId: employee.employeeId,
      currency: 'USD',
      oldAmount: large,
      newAmount: '80000.00',
      changedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    };
    expect(newest.status).toBe(200);
    expect(newest.body).toEqual({ history: [entry], page: 1, pageSize: 1, total: 2 });
    const older = await request(app).get(
      `/api/employees/${employee.employeeId}/salary-history?page=2&pageSize=1`,
    );
    expect(older.status).toBe(200);
    expect(older.body).toEqual({
      history: [{ ...entry, oldAmount: employee.salaryAmount, newAmount: large }],
      page: 2,
      pageSize: 1,
      total: 2,
    });
    const beyond = await request(app).get(
      `/api/employees/${employee.employeeId}/salary-history?page=3&pageSize=1`,
    );
    expect(beyond.body).toEqual({ history: [], page: 3, pageSize: 1, total: 2 });
    expect((await request(app).get('/api/employees')).body.employees).toEqual([
      { ...employee, salaryAmount: '80000.00' },
    ]);
  });

  it('returns 200 and zero history for an existing employee', async () => {
    await createEmployee(pool, employee);
    const response = await request(api()).get(
      `/api/employees/${employee.employeeId}/salary-history`,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ history: [], total: 0, page: 1, pageSize: 25 });
  });

  it('returns unchanged conflict without history', async () => {
    await createEmployee(pool, employee);
    const app = api();
    const response = await request(app)
      .patch(`/api/employees/${employee.employeeId}/salary`)
      .send({ salaryAmount: '00075000.5' });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: { field: 'salaryAmount', code: 'salary_unchanged' } });
    expect(
      (await request(app).get(`/api/employees/${employee.employeeId}/salary-history`)).body.total,
    ).toBe(0);
  });

  it.each(['salary', 'salary-history'])(
    'returns 404 for a missing case-sensitive employee on %s',
    async (endpoint) => {
      await createEmployee(pool, employee);
      const path = `/api/employees/${employee.employeeId.toLowerCase()}/${endpoint}`;
      const app = api();
      const response =
        endpoint === 'salary'
          ? await request(app).patch(path).send({ salaryAmount: '100.00' })
          : await request(app).get(path);
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { field: 'employeeId', code: 'employee_not_found' } });
    },
  );

  it.each(['0', '1.234', 100, null].map((amount) => ({ amount })))(
    'returns invalid_amount for $amount without altering records',
    async ({ amount }) => {
      await createEmployee(pool, employee);
      const response = await request(api())
        .patch(`/api/employees/${employee.employeeId}/salary`)
        .send({ salaryAmount: amount });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: { field: 'salaryAmount', code: 'invalid_amount' } });
      expect(
        (await pool.query('SELECT salary_amount::text AS amount FROM employees')).rows,
      ).toEqual([{ amount: employee.salaryAmount }]);
      expect((await pool.query('SELECT count(*)::int AS total FROM salary_history')).rows).toEqual([
        { total: 0 },
      ]);
    },
  );

  it('preserves amount_not_storable for numeric overflow', async () => {
    await createEmployee(pool, employee);
    const response = await request(api())
      .patch(`/api/employees/${employee.employeeId}/salary`)
      .send({ salaryAmount: `${'9'.repeat(131073)}.00` });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { field: 'salaryAmount', code: 'amount_not_storable' },
    });
  });

  it('returns a safe 500 and rolls back when history insertion fails', async () => {
    await createEmployee(pool, employee);
    await pool.query(
      'ALTER TABLE salary_history ADD CONSTRAINT forced_http_failure CHECK (new_amount <> 100)',
    );
    try {
      const response = await request(api())
        .patch(`/api/employees/${employee.employeeId}/salary`)
        .send({ salaryAmount: '100.00' });
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: { field: 'employee', code: 'persistence_failed' } });
      expect(
        (await pool.query('SELECT salary_amount::text AS amount FROM employees')).rows,
      ).toEqual([{ amount: employee.salaryAmount }]);
      expect((await pool.query('SELECT count(*)::int AS total FROM salary_history')).rows).toEqual([
        { total: 0 },
      ]);
    } finally {
      await pool.query('ALTER TABLE salary_history DROP CONSTRAINT forced_http_failure');
    }
  });

  it('sanitizes actual history database failures', async () => {
    await createEmployee(pool, employee);
    await pool.query('ALTER TABLE salary_history RENAME TO unavailable_history');
    try {
      const response = await request(api()).get(
        `/api/employees/${employee.employeeId}/salary-history`,
      );
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: { code: 'persistence_failed' } });
    } finally {
      await pool.query('ALTER TABLE unavailable_history RENAME TO salary_history');
    }
  });
});
