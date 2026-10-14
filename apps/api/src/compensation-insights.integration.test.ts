import request from 'supertest';
import { createApp } from './app.js';
import { listEmployees } from './list-employees.js';
import { listSalaryHistory } from './list-salary-history.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from './database.js';
import { migrate } from './migrate.js';
import { createEmployee } from './create-employee.js';
import { updateSalary } from './update-salary.js';
import { compensationInsights } from './compensation-insights.js';

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

async function add(
  amount: string,
  currency = 'USD',
  country = 'India',
  department = 'Engineering',
) {
  const count = (await pool.query('SELECT count(*)::int AS n FROM employees')).rows[0].n;
  const result = await createEmployee(pool, {
    ...employee,
    employeeId: `INSIGHT-${count + 1}`,
    salaryAmount: amount,
    currency,
    country,
    department,
  });
  expect(result.ok).toBe(true);
}
function group(
  currency: string,
  values: {
    headcount: number;
    total: string;
    average: string;
    median: string;
    minimum: string;
    maximum: string;
  },
  groupValue: string | null = null,
) {
  return { currency, groupValue, ...values };
}

it('returns empty groups and zero headcount for an empty database', async () => {
  expect(await compensationInsights(pool, { groupBy: 'currency' })).toEqual({
    groupBy: 'currency',
    headcount: 0,
    groups: [],
  });
});
it('separates currencies, counts each employee once, and returns exact basic statistics', async () => {
  await add('100.00');
  await add('200.00');
  await add('300.00');
  await add('5.01', 'INR');
  expect(await compensationInsights(pool, { groupBy: 'currency' })).toEqual({
    groupBy: 'currency',
    headcount: 4,
    groups: [
      group('INR', {
        headcount: 1,
        total: '5.01',
        average: '5.01',
        median: '5.01',
        minimum: '5.01',
        maximum: '5.01',
      }),
      group('USD', {
        headcount: 3,
        total: '600.00',
        average: '200.00',
        median: '200.00',
        minimum: '100.00',
        maximum: '300.00',
      }),
    ],
  });
});

it.each([
  {
    amounts: ['1.00', '1.00', '9.00'],
    total: '11.00',
    average: '3.67',
    median: '1.00',
    minimum: '1.00',
    maximum: '9.00',
  },
  {
    amounts: ['1.00', '2.00', '3.00', '100.00'],
    total: '106.00',
    average: '26.50',
    median: '2.50',
    minimum: '1.00',
    maximum: '100.00',
  },
  {
    amounts: ['100.00', '100.01'],
    total: '200.01',
    average: '100.01',
    median: '100.01',
    minimum: '100.00',
    maximum: '100.01',
  },
  {
    amounts: ['100.00', '100.00', '100.01'],
    total: '300.01',
    average: '100.00',
    median: '100.00',
    minimum: '100.00',
    maximum: '100.01',
  },
  {
    amounts: ['9007199254740993.01', '9007199254740993.02'],
    total: '18014398509481986.03',
    average: '9007199254740993.02',
    median: '9007199254740993.02',
    minimum: '9007199254740993.01',
    maximum: '9007199254740993.02',
  },
])(
  'calculates exact odd/even/rounded/large statistics for $amounts',
  async ({ amounts, ...statistics }) => {
    for (const amount of amounts) await add(amount);
    expect(await compensationInsights(pool, { groupBy: 'currency' })).toEqual({
      groupBy: 'currency',
      headcount: amounts.length,
      groups: [group('USD', { headcount: amounts.length, ...statistics })],
    });
  },
);

async function groupedFixtures() {
  await add('100.00', 'USD', 'UK', 'HR');
  await add('1.00', 'USD', 'India', 'Engineering');
  await add('9.00', 'USD', 'India', 'Engineering');
  await add('5.00', 'EUR', 'India', 'Engineering');
  await add('30.00', 'USD', 'India', 'HR');
  await add('7.00', 'EUR', 'UK', 'HR');
}
function stats(
  headcount: number,
  total: string,
  average: string,
  median: string,
  minimum: string,
  maximum: string,
) {
  return { headcount, total, average, median, minimum, maximum };
}

it('computes all statistics within country AND currency with deterministic order', async () => {
  await groupedFixtures();
  expect(await compensationInsights(pool, { groupBy: 'country' })).toEqual({
    groupBy: 'country',
    headcount: 6,
    groups: [
      group('EUR', stats(1, '5.00', '5.00', '5.00', '5.00', '5.00'), 'India'),
      group('USD', stats(3, '40.00', '13.33', '9.00', '1.00', '30.00'), 'India'),
      group('EUR', stats(1, '7.00', '7.00', '7.00', '7.00', '7.00'), 'UK'),
      group('USD', stats(1, '100.00', '100.00', '100.00', '100.00', '100.00'), 'UK'),
    ],
  });
});
it('computes all statistics within department AND currency with deterministic order', async () => {
  await groupedFixtures();
  expect(await compensationInsights(pool, { groupBy: 'department' })).toEqual({
    groupBy: 'department',
    headcount: 6,
    groups: [
      group('EUR', stats(1, '5.00', '5.00', '5.00', '5.00', '5.00'), 'Engineering'),
      group('USD', stats(2, '10.00', '5.00', '5.00', '1.00', '9.00'), 'Engineering'),
      group('EUR', stats(1, '7.00', '7.00', '7.00', '7.00', '7.00'), 'HR'),
      group('USD', stats(2, '130.00', '65.00', '65.00', '30.00', '100.00'), 'HR'),
    ],
  });
});
it.each(['currency', 'country', 'department'] as const)(
  'applies combined filters to every %s statistic and reconciles headcounts',
  async (groupBy) => {
    await groupedFixtures();
    const result = await compensationInsights(pool, {
      groupBy,
      country: 'India',
      department: 'HR',
    });
    expect(result).toEqual({
      groupBy,
      headcount: 1,
      groups: [
        group(
          'USD',
          stats(1, '30.00', '30.00', '30.00', '30.00', '30.00'),
          groupBy === 'currency' ? null : groupBy === 'country' ? 'India' : 'HR',
        ),
      ],
    });
    expect(result.groups.reduce((sum, row) => sum + row.headcount, 0)).toBe(result.headcount);
  },
);
it.each(['india', "India' OR TRUE --"])(
  'returns empty results for exact/unmatched country %s',
  async (country) => {
    await groupedFixtures();
    expect(await compensationInsights(pool, { groupBy: 'currency', country })).toEqual({
      groupBy: 'currency',
      headcount: 0,
      groups: [],
    });
  },
);
it('reflects confirmed salary changes without counting history as additional employees', async () => {
  await groupedFixtures();
  expect((await updateSalary(pool, 'INSIGHT-1', '200.00')).ok).toBe(true);
  expect(
    await compensationInsights(pool, { groupBy: 'country', country: 'UK', department: 'HR' }),
  ).toEqual({
    groupBy: 'country',
    headcount: 2,
    groups: [
      group('EUR', stats(1, '7.00', '7.00', '7.00', '7.00', '7.00'), 'UK'),
      group('USD', stats(1, '200.00', '200.00', '200.00', '200.00', '200.00'), 'UK'),
    ],
  });
});

function api(connection = pool) {
  return createApp({
    createEmployee: (input) => createEmployee(connection, input),
    listEmployees: (query) => listEmployees(connection, query),
    updateSalary: (id, amount) => updateSalary(connection, id, amount),
    listSalaryHistory: (id, query) => listSalaryHistory(connection, id, query),
    compensationInsights: (query) => compensationInsights(connection, query),
  });
}
it('returns real grouped/filtered statistics through HTTP and observes later salary updates', async () => {
  await add('100.00');
  await add('100.01');
  await add('5.00', 'INR', 'UK', 'HR');
  const app = api();
  const result = await request(app)
    .get('/api/compensation-insights')
    .query({ country: ' India ', department: ' Engineering ', groupBy: 'country' });
  expect(result.status).toBe(200);
  expect(result.body).toEqual({
    groupBy: 'country',
    headcount: 2,
    groups: [group('USD', stats(2, '200.01', '100.01', '100.01', '100.00', '100.01'), 'India')],
  });
  expect(
    (await request(app).patch('/api/employees/INSIGHT-1/salary').send({ salaryAmount: '200.00' }))
      .status,
  ).toBe(200);
  const changed = await request(app)
    .get('/api/compensation-insights')
    .query({ country: 'India', department: 'Engineering' });
  expect(changed.body).toEqual({
    groupBy: 'currency',
    headcount: 2,
    groups: [group('USD', stats(2, '300.01', '150.01', '150.01', '100.01', '200.00'))],
  });
});
it('returns empty HTTP results and rejects SQL-like grouping without harming data', async () => {
  await add('1.00');
  const app = api();
  expect(
    (await request(app).get('/api/compensation-insights').query({ country: "' OR TRUE --" })).body,
  ).toEqual({ groupBy: 'currency', headcount: 0, groups: [] });
  expect(
    (
      await request(app)
        .get('/api/compensation-insights')
        .query({ groupBy: 'country; DROP TABLE employees' })
    ).status,
  ).toBe(400);
  expect((await observer.query('SELECT count(*)::int AS n FROM employees')).rows[0].n).toBe(1);
});
it('sanitizes actual database failures through HTTP', async () => {
  const brokenUrl = new URL(isolatedUrl);
  brokenUrl.searchParams.set('options', '-c search_path=pg_catalog');
  const broken = createPool(brokenUrl.toString());
  try {
    const result = await request(api(broken)).get('/api/compensation-insights');
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: { code: 'persistence_failed' } });
  } finally {
    await broken.end();
  }
});
