import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from './database.js';
import { migrate } from './migrate.js';
import { createEmployee } from './create-employee.js';

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

beforeEach(async () => {
  await pool.query('TRUNCATE employees');
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
    const result = await observer.query('SELECT employee_id, name, email, department, role, country, currency, salary_amount::text AS salary_amount FROM employees');
    expect(result.rows).toEqual([{
      employee_id: 'ACME-001',
      name: 'Alex Example',
      email: 'alex@example.test',
      department: 'Engineering',
      role: 'Developer',
      country: 'India',
      currency: 'INR',
      salary_amount: '75000.50',
    }]);
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
      await expect(pool.query(`UPDATE employees SET ${field} = $1`, [value])).rejects.toMatchObject({
        code: value === null ? '23502' : '23514',
      });
    });
  }

  it.each(['bad-email', 'a@@example.test', 'a b@example.test'])(
    'database rejects malformed email %s',
    async (email) => {
      await createEmployee(pool, employee);
      await expect(pool.query('UPDATE employees SET email = $1', [email])).rejects.toMatchObject({ code: '23514' });
    },
  );

  it.each([null, 'JPY', 'usd'])('database rejects invalid currency %j', async (currency) => {
    await createEmployee(pool, employee);
    await expect(pool.query('UPDATE employees SET currency = $1', [currency])).rejects.toMatchObject({
      code: currency === null ? '23502' : '23514',
    });
  });

  it.each([null, '0', '-1', '1.234', 'NaN', 'Infinity', '-Infinity'])(
    'database rejects invalid salary %j',
    async (amount) => {
      await createEmployee(pool, employee);
      await expect(pool.query('UPDATE employees SET salary_amount = $1', [amount])).rejects.toMatchObject({
        code: amount === null ? '23502' : '23514',
      });
    },
  );

  it('returns a clear error for values beyond PostgreSQL representability', async () => {
    expect(await createEmployee(pool, { ...employee, salaryAmount: `${'9'.repeat(131073)}.00` })).toEqual({
      ok: false,
      error: { field: 'salaryAmount', code: 'amount_not_storable' },
    });
    expect((await observer.query('SELECT count(*)::int AS count FROM employees')).rows).toEqual([{ count: 0 }]);
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
      ok: false, error: { field, code },
    });
    expect((await observer.query('SELECT count(*)::int AS count FROM employees')).rows).toEqual([{ count: 0 }]);
  });

  it('treats SQL-like employee text as a parameter value', async () => {
    const input = { ...employee, name: "Alex'); DROP TABLE employees; --" };
    expect(await createEmployee(pool, input)).toEqual({ ok: true, employee: input });
    expect((await observer.query('SELECT name FROM employees')).rows).toEqual([{ name: input.name }]);
  });

  it('allows case-distinct IDs and repeated email addresses', async () => {
    expect((await createEmployee(pool, employee)).ok).toBe(true);
    expect((await createEmployee(pool, { ...employee, employeeId: 'acme-001' })).ok).toBe(true);
    expect((await observer.query('SELECT count(*)::int AS count FROM employees')).rows).toEqual([{ count: 2 }]);
  });

  it('rejects concurrent duplicate IDs and stores exactly one record', async () => {
    const results = await Promise.all([createEmployee(pool, employee), createEmployee(pool, employee)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{
      ok: false, error: { field: 'employeeId', code: 'duplicate_employee_id' },
    }]);
    expect((await observer.query('SELECT count(*)::int AS count FROM employees')).rows).toEqual([{ count: 1 }]);
  });

  it('round-trips PostgreSQL maximum whole-part length without a chosen salary ceiling', async () => {
    const salaryAmount = `${'9'.repeat(131072)}.01`;
    const result = await createEmployee(pool, { ...employee, salaryAmount });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.employee.salaryAmount).toBe(salaryAmount);
    expect((await observer.query('SELECT salary_amount::text AS amount FROM employees')).rows[0].amount).toBe(salaryAmount);
  });

  it('reapplying the initial migration preserves existing records', async () => {
    await createEmployee(pool, employee);
    await migrate(pool);
    expect((await observer.query('SELECT count(*)::int AS count FROM employees')).rows).toEqual([{ count: 1 }]);
  });
});
