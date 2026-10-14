import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from './database.js';
import { migrate } from './migrate.js';
import { createEmployee } from './create-employee.js';
import { listEmployees } from './list-employees.js';
import request from 'supertest';
import { createApp } from './app.js';
import { updateSalary } from './update-salary.js';
import { listSalaryHistory } from './list-salary-history.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || new URL(connectionString).pathname !== '/acme_test') {
  throw new Error('TEST_DATABASE_URL must point to the dedicated acme_test database');
}

const schema = `test_${randomUUID().replaceAll('-', '')}`;
const isolatedUrl = new URL(connectionString);
isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
let admin: Pool;
let pool: Pool;
let observer: Pool;
let schemaCreated = false;

const employee = {
  employeeId: 'ACME-001',
  name: 'Alex Example',
  email: 'alex@example.test',
  department: 'Engineering',
  role: 'Developer',
  country: 'India',
  currency: 'INR',
  salaryAmount: '75000.50',
};

beforeAll(async () => {
  admin = createPool(connectionString);
  await admin.query('SELECT 1');
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  pool = createPool(isolatedUrl.toString());
  observer = createPool(isolatedUrl.toString());
  await migrate(pool);
});

describe('listEmployees with PostgreSQL', () => {
  it('returns a bounded page ordered by employee ID with an accurate total', async () => {
    const first = { ...employee, employeeId: 'ACME-001', salaryAmount: '9007199254740993.01' };
    const second = { ...employee, employeeId: 'ACME-002' };
    const third = { ...employee, employeeId: 'ACME-003' };
    for (const row of [third, first, second]) await createEmployee(pool, row);
    expect(await listEmployees(pool, { page: 1, pageSize: 2 })).toEqual({
      employees: [first, second],
      page: 1,
      pageSize: 2,
      total: 3,
    });
    expect(await listEmployees(pool, { page: 2, pageSize: 2 })).toEqual({
      employees: [third],
      page: 2,
      pageSize: 2,
      total: 3,
    });
  });

  it('returns an empty page and zero total for an empty database', async () => {
    expect(await listEmployees(pool, { page: 1, pageSize: 25 })).toEqual({
      employees: [],
      page: 1,
      pageSize: 25,
      total: 0,
    });
  });

  it('preserves the total for a page beyond the end', async () => {
    await createEmployee(pool, employee);
    expect(await listEmployees(pool, { page: 3, pageSize: 2 })).toEqual({
      employees: [],
      page: 3,
      pageSize: 2,
      total: 1,
    });
  });
});

describe('directory criteria with PostgreSQL', () => {
  async function fixtures() {
    const rows = [
      {
        ...employee,
        employeeId: 'A',
        name: 'Alex 100%_\\ Team',
        email: 'alpha@example.test',
        salaryAmount: '100.00',
      },
      {
        ...employee,
        employeeId: 'B',
        name: 'Other',
        email: 'ALEX@example.test',
        country: 'UK',
        department: 'HR',
        currency: 'GBP',
        salaryAmount: '20.00',
      },
      {
        ...employee,
        employeeId: 'C',
        name: 'Alex 100XX Team',
        email: 'charlie@example.test',
        department: 'HR',
        currency: 'USD',
        salaryAmount: '9007199254740993.01',
      },
      {
        ...employee,
        employeeId: 'D',
        name: 'Alex',
        email: 'delta@example.test',
        salaryAmount: '9.00',
      },
    ];
    for (const row of rows) expect((await createEmployee(pool, row)).ok).toBe(true);
    return rows;
  }

  it('searches name OR email case-insensitively and paginates matching rows/count', async () => {
    const rows = await fixtures();
    const result = await listEmployees(pool, { page: 2, pageSize: 2, search: 'aLeX' });
    expect(result).toEqual({ employees: [rows[2], rows[3]], page: 2, pageSize: 2, total: 4 });
    expect(
      (await listEmployees(pool, { page: 1, pageSize: 25, search: 'ALPHA@' })).employees,
    ).toEqual([rows[0]]);
  });

  it.each(['%', '_', '\\', '100%_\\'])(
    'matches literal search %s without SQL wildcards',
    async (search) => {
      const rows = await fixtures();
      expect(await listEmployees(pool, { page: 1, pageSize: 25, search })).toEqual({
        employees: [rows[0]],
        page: 1,
        pageSize: 25,
        total: 1,
      });
    },
  );

  it('combines search and exact country/department/currency filters with AND', async () => {
    const rows = await fixtures();
    expect(
      await listEmployees(pool, {
        page: 1,
        pageSize: 1,
        search: 'alex',
        country: 'India',
        department: 'HR',
        currency: 'USD',
      }),
    ).toEqual({ employees: [rows[2]], page: 1, pageSize: 1, total: 1 });
    expect(
      await listEmployees(pool, {
        page: 2,
        pageSize: 1,
        country: 'India',
        department: 'HR',
        currency: 'USD',
      }),
    ).toEqual({ employees: [], page: 2, pageSize: 1, total: 1 });
  });

  it.each([
    { country: 'india' },
    { department: 'hr' },
    { currency: 'EUR' },
    { search: "' OR TRUE --" },
  ] as const)('returns no matches for exact/unmatched criteria %j', async (criteria) => {
    await fixtures();
    expect(await listEmployees(pool, { page: 1, pageSize: 25, ...criteria })).toEqual({
      employees: [],
      page: 1,
      pageSize: 25,
      total: 0,
    });
  });
});

describe('directory sorting with PostgreSQL', () => {
  it.each([
    'employeeId',
    'name',
    'department',
    'role',
    'country',
    'currency',
    'salaryAmount',
  ] as const)('sorts %s both ways with stable ID ties and filtered page totals', async (sortBy) => {
    const rows = [
      {
        ...employee,
        employeeId: 'C',
        name: 'Z',
        department: 'Z',
        role: 'Z',
        country: 'Z',
        currency: 'USD',
        salaryAmount: '100.00',
      },
      {
        ...employee,
        employeeId: 'A',
        name: 'M',
        department: 'M',
        role: 'M',
        country: 'M',
        currency: 'INR',
        salaryAmount: '20.00',
      },
      {
        ...employee,
        employeeId: 'B',
        name: 'M',
        department: 'M',
        role: 'M',
        country: 'M',
        currency: 'INR',
        salaryAmount: '9.00',
      },
    ];
    for (const row of rows) expect((await createEmployee(pool, row)).ok).toBe(true);
    const ascending = sortBy === 'salaryAmount' ? ['B', 'A', 'C'] : ['A', 'B', 'C'];
    const descending = sortBy === 'employeeId' ? ['C', 'B', 'A'] : ['C', 'A', 'B'];
    for (const [sortDirection, ids] of [
      ['asc', ascending],
      ['desc', descending],
    ] as const) {
      const first = await listEmployees(pool, { page: 1, pageSize: 2, sortBy, sortDirection });
      const second = await listEmployees(pool, { page: 2, pageSize: 2, sortBy, sortDirection });
      expect(first.employees.map((row) => row.employeeId)).toEqual(ids.slice(0, 2));
      expect(second.employees.map((row) => row.employeeId)).toEqual(ids.slice(2));
      expect(first.total).toBe(3);
      expect(second.total).toBe(3);
    }
    const filtered = await listEmployees(pool, {
      page: 1,
      pageSize: 1,
      currency: 'INR',
      sortBy,
      sortDirection: 'desc',
    });
    expect(filtered.total).toBe(2);
    expect(filtered.employees.map((row) => row.employeeId)).toEqual([
      sortBy === 'employeeId' ? 'B' : 'A',
    ]);
  });

  it('sorts fractional differences beyond Number precision without changing returned strings', async () => {
    const first = { ...employee, employeeId: 'A', salaryAmount: '9007199254740993.02' };
    const second = { ...employee, employeeId: 'B', salaryAmount: '9007199254740993.01' };
    for (const row of [first, second]) await createEmployee(pool, row);
    expect(await listEmployees(pool, { page: 1, pageSize: 25, sortBy: 'salaryAmount' })).toEqual({
      employees: [second, first],
      page: 1,
      pageSize: 25,
      total: 2,
    });
  });
});

describe('employee HTTP API with PostgreSQL', () => {
  function api() {
    return createApp({
      updateSalary: (employeeId, amount) => updateSalary(pool, employeeId, amount),
      listSalaryHistory: (employeeId, pagination) =>
        listSalaryHistory(pool, employeeId, pagination),
      createEmployee: (input) => createEmployee(pool, input),
      listEmployees: (pagination) => listEmployees(pool, pagination),
    });
  }

  it('creates and lists the same canonical employee through HTTP', async () => {
    const app = api();
    const input = { ...employee, name: ' Alex Example ', salaryAmount: '009007199254740993.01' };
    const stored = { ...employee, salaryAmount: '9007199254740993.01' };
    const created = await request(app).post('/api/employees').send(input);
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ employee: stored });
    const listed = await request(app).get('/api/employees?page=1&pageSize=1');
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ employees: [stored], page: 1, pageSize: 1, total: 1 });
  });

  it('applies trimmed combined criteria, sorting, and filtered pagination through real HTTP/SQL', async () => {
    const app = api();
    const first = { ...employee, employeeId: 'A', name: 'Alex 100%_!\\', salaryAmount: '100.00' };
    const second = { ...employee, employeeId: 'B', name: 'Alex 100%_!\\', salaryAmount: '9.00' };
    const excluded = { ...employee, employeeId: 'C', country: 'UK', salaryAmount: '1.00' };
    for (const row of [first, second, excluded]) await createEmployee(pool, row);
    const query = {
      search: ' 100%_!\\ ',
      country: ' India ',
      department: ' Engineering ',
      currency: ' INR ',
      sortBy: 'salaryAmount',
      sortDirection: 'asc',
      pageSize: '1',
    };
    const firstPage = await request(app).get('/api/employees').query(query);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body).toEqual({ employees: [second], page: 1, pageSize: 1, total: 2 });
    expect(
      (
        await request(app)
          .get('/api/employees')
          .query({ ...query, page: '2' })
      ).body,
    ).toEqual({ employees: [first], page: 2, pageSize: 1, total: 2 });
    expect(
      (
        await request(app)
          .get('/api/employees')
          .query({ ...query, page: '3' })
      ).body,
    ).toEqual({ employees: [], page: 3, pageSize: 1, total: 2 });
  });

  it('keeps SQL-like filters as values and rejects injected sort expressions', async () => {
    const app = api();
    await createEmployee(pool, employee);
    expect(
      (await request(app).get('/api/employees').query({ country: "India' OR TRUE --" })).body,
    ).toEqual({ employees: [], page: 1, pageSize: 25, total: 0 });
    const invalid = await request(app)
      .get('/api/employees')
      .query({ sortBy: 'name; DROP TABLE employees' });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ error: { field: 'sortBy', code: 'invalid_query' } });
    expect((await request(app).get('/api/employees')).body.employees).toEqual([employee]);
  });

  it('returns HTTP 409 for duplicate IDs and keeps the original employee', async () => {
    const app = api();
    expect((await request(app).post('/api/employees').send(employee)).status).toBe(201);
    const duplicate = await request(app)
      .post('/api/employees')
      .send({ ...employee, name: 'Other Name' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({
      error: { field: 'employeeId', code: 'duplicate_employee_id' },
    });
    expect((await request(app).get('/api/employees')).body.employees).toEqual([employee]);
  });

  it('returns HTTP 400 for invalid input without persisting it', async () => {
    const app = api();
    const response = await request(app)
      .post('/api/employees')
      .send({ ...employee, salaryAmount: '0' });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { field: 'salaryAmount', code: 'invalid_amount' } });
    expect((await request(app).get('/api/employees')).body.total).toBe(0);
  });

  it('returns HTTP 400 for database numeric overflow without leaking its message', async () => {
    const response = await request(api())
      .post('/api/employees')
      .send({ ...employee, salaryAmount: `${'9'.repeat(131073)}.00` });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { field: 'salaryAmount', code: 'amount_not_storable' },
    });
  });
});

beforeEach(async () => {
  await pool.query('TRUNCATE salary_history, employees');
});

afterAll(async () => {
  await pool?.end();
  await observer?.end();
  if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin?.end();
});

describe('createEmployee with PostgreSQL', () => {
  it('persists a valid employee visible through a separate connection', async () => {
    expect(await createEmployee(pool, employee)).toEqual({ ok: true, employee });
    const result = await observer.query(
      'SELECT employee_id, name, email, department, role, country, currency, salary_amount::text AS salary_amount FROM employees',
    );
    expect(result.rows).toEqual([
      {
        employee_id: 'ACME-001',
        name: 'Alex Example',
        email: 'alex@example.test',
        department: 'Engineering',
        role: 'Developer',
        country: 'India',
        currency: 'INR',
        salary_amount: '75000.50',
      },
    ]);
  });

  it('round-trips a salary beyond JavaScript safe-integer precision exactly', async () => {
    const input = { ...employee, salaryAmount: '9007199254740993.01' };
    expect(await createEmployee(pool, input)).toEqual({ ok: true, employee: input });
    const result = await observer.query('SELECT salary_amount::text AS amount FROM employees');
    expect(result.rows).toEqual([{ amount: input.salaryAmount }]);
  });

  it('rejects a duplicate employee ID without changing the existing record', async () => {
    expect((await createEmployee(pool, employee)).ok).toBe(true);
    expect(await createEmployee(pool, { ...employee, name: 'Changed Name' })).toEqual({
      ok: false,
      error: { field: 'employeeId', code: 'duplicate_employee_id' },
    });
    const result = await observer.query('SELECT employee_id, name FROM employees');
    expect(result.rows).toEqual([{ employee_id: employee.employeeId, name: employee.name }]);
  });

  for (const field of ['employee_id', 'name', 'email', 'department', 'role', 'country']) {
    it.each([null, '', ' \t\n '])(`database rejects invalid ${field}: %j`, async (value) => {
      await createEmployee(pool, employee);
      await expect(pool.query(`UPDATE employees SET ${field} = $1`, [value])).rejects.toMatchObject(
        {
          code: value === null ? '23502' : '23514',
        },
      );
    });
  }

  it.each(['bad-email', 'a@@example.test', 'a b@example.test'])(
    'database rejects malformed email %s',
    async (email) => {
      await createEmployee(pool, employee);
      await expect(pool.query('UPDATE employees SET email = $1', [email])).rejects.toMatchObject({
        code: '23514',
      });
    },
  );

  it.each([null, 'JPY', 'usd'])('database rejects invalid currency %j', async (currency) => {
    await createEmployee(pool, employee);
    await expect(
      pool.query('UPDATE employees SET currency = $1', [currency]),
    ).rejects.toMatchObject({
      code: currency === null ? '23502' : '23514',
    });
  });

  it.each([null, '0', '-1', '1.234', 'NaN', 'Infinity', '-Infinity'])(
    'database rejects invalid salary %j',
    async (amount) => {
      await createEmployee(pool, employee);
      await expect(
        pool.query('UPDATE employees SET salary_amount = $1', [amount]),
      ).rejects.toMatchObject({
        code: amount === null ? '23502' : '23514',
      });
    },
  );

  it('returns a clear error for values beyond PostgreSQL representability', async () => {
    expect(
      await createEmployee(pool, { ...employee, salaryAmount: `${'9'.repeat(131073)}.00` }),
    ).toEqual({
      ok: false,
      error: { field: 'salaryAmount', code: 'amount_not_storable' },
    });
    expect((await observer.query('SELECT count(*)::int AS count FROM employees')).rows).toEqual([
      { count: 0 },
    ]);
  });

  it('returns a sanitized failure for a missing database table', async () => {
    const brokenUrl = new URL(connectionString);
    brokenUrl.searchParams.set('options', '-c search_path=pg_catalog');
    const brokenPool = createPool(brokenUrl.toString());
    try {
      expect(await createEmployee(brokenPool, employee)).toEqual({
        ok: false,
        error: { field: 'employee', code: 'persistence_failed' },
      });
    } finally {
      await brokenPool.end();
    }
  });

  it.each([
    { name: '', field: 'name', code: 'invalid_field' },
    { email: 'bad-email', field: 'email', code: 'invalid_email' },
    { salaryAmount: '0', field: 'salaryAmount', code: 'invalid_amount' },
    { currency: 'JPY', field: 'currency', code: 'unsupported_currency' },
  ])('invalid $field creates no record', async ({ field, code, ...override }) => {
    expect(await createEmployee(pool, { ...employee, ...override })).toEqual({
      ok: false,
      error: { field, code },
    });
    expect((await observer.query('SELECT count(*)::int AS count FROM employees')).rows).toEqual([
      { count: 0 },
    ]);
  });

  it('treats SQL-like employee text as a parameter value', async () => {
    const input = { ...employee, name: "Alex'); DROP TABLE employees; --" };
    expect(await createEmployee(pool, input)).toEqual({ ok: true, employee: input });
    expect((await observer.query('SELECT name FROM employees')).rows).toEqual([
      { name: input.name },
    ]);
  });

  it('allows case-distinct IDs and repeated email addresses', async () => {
    expect((await createEmployee(pool, employee)).ok).toBe(true);
    expect((await createEmployee(pool, { ...employee, employeeId: 'acme-001' })).ok).toBe(true);
    expect((await observer.query('SELECT count(*)::int AS count FROM employees')).rows).toEqual([
      { count: 2 },
    ]);
  });

  it('rejects concurrent duplicate IDs and stores exactly one record', async () => {
    const results = await Promise.all([
      createEmployee(pool, employee),
      createEmployee(pool, employee),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      {
        ok: false,
        error: { field: 'employeeId', code: 'duplicate_employee_id' },
      },
    ]);
    expect((await observer.query('SELECT count(*)::int AS count FROM employees')).rows).toEqual([
      { count: 1 },
    ]);
  });

  it('round-trips PostgreSQL maximum whole-part length without a chosen salary ceiling', async () => {
    const salaryAmount = `${'9'.repeat(131072)}.01`;
    const result = await createEmployee(pool, { ...employee, salaryAmount });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.employee.salaryAmount).toBe(salaryAmount);
    expect(
      (await observer.query('SELECT salary_amount::text AS amount FROM employees')).rows[0].amount,
    ).toBe(salaryAmount);
  });

  it('reapplying the initial migration preserves existing records', async () => {
    await createEmployee(pool, employee);
    await migrate(pool);
    expect((await observer.query('SELECT count(*)::int AS count FROM employees')).rows).toEqual([
      { count: 1 },
    ]);
  });
});
