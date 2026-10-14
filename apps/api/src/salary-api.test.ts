import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import type { EmployeeOperations } from './app.js';
import type { Employee } from './employee.js';

const employee: Employee = {
  employeeId: 'ACME-001',
  name: 'Synthetic Salary Employee',
  email: 'salary@example.test',
  department: 'Engineering',
  role: 'Developer',
  country: 'India',
  currency: 'USD',
  salaryAmount: '9007199254740993.01',
};
const entry = {
  employeeId: employee.employeeId,
  historyId: '9007199254740993',
  currency: 'USD' as const,
  oldAmount: '75000.50',
  newAmount: employee.salaryAmount,
  changedAt: '2026-01-01T12:00:00.000Z',
};
const historyPage = { history: [entry], page: 1, pageSize: 25, total: 1 };

function operations() {
  return {
    createEmployee: vi.fn<EmployeeOperations['createEmployee']>(),
    listEmployees: vi.fn<EmployeeOperations['listEmployees']>(),
    updateSalary: vi
      .fn<EmployeeOperations['updateSalary']>()
      .mockResolvedValue({ ok: true, employee }),
    compensationInsights: vi.fn(),
    listSalaryHistory: vi
      .fn<EmployeeOperations['listSalaryHistory']>()
      .mockResolvedValue({ ok: true, historyPage }),
  };
}

it('patches only salary, preserving exact strings and the existing currency', async () => {
  const services = operations();
  const response = await request(createApp(services))
    .patch('/api/employees/ACME-001/salary')
    .send({ salaryAmount: employee.salaryAmount, currency: 'EUR', name: 'Ignored' });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ employee });
  expect(services.updateSalary).toHaveBeenCalledWith(employee.employeeId, employee.salaryAmount);
});

it('returns history with default pagination, exact amounts, and string history IDs', async () => {
  const services = operations();
  const response = await request(createApp(services)).get('/api/employees/ACME-001/salary-history');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(historyPage);
  expect(services.listSalaryHistory).toHaveBeenCalledWith(employee.employeeId, {
    page: 1,
    pageSize: 25,
  });
});

it.each([
  { error: { field: 'salaryAmount', code: 'invalid_amount' }, status: 400 },
  { error: { field: 'salaryAmount', code: 'amount_not_storable' }, status: 400 },
  { error: { field: 'salaryAmount', code: 'salary_unchanged' }, status: 409 },
  { error: { field: 'employeeId', code: 'employee_not_found' }, status: 404 },
  { error: { field: 'employee', code: 'persistence_failed' }, status: 500 },
] as const)('preserves $error.code and its field with HTTP $status', async ({ error, status }) => {
  const services = operations();
  services.updateSalary.mockResolvedValue({ ok: false, error });
  const response = await request(createApp(services))
    .patch('/api/employees/ACME-001/salary')
    .send({ salaryAmount: '100.00' });
  expect(response.status).toBe(status);
  expect(response.body).toEqual({ error });
});

it('returns 404 when history belongs to a nonexistent employee', async () => {
  const services = operations();
  const error = { field: 'employeeId', code: 'employee_not_found' } as const;
  services.listSalaryHistory.mockResolvedValue({ ok: false, error });
  const response = await request(createApp(services)).get('/api/employees/MISSING/salary-history');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ error });
});

it.each(
  [{}, [], undefined, { salaryAmount: 100 }, { salaryAmount: null }, { salaryAmount: {} }].map(
    (body) => ({ body }),
  ),
)('rejects invalid PATCH body $body without calling persistence', async ({ body }) => {
  const services = operations();
  const response = await request(createApp(services))
    .patch('/api/employees/ACME-001/salary')
    .send(body);
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: { field: 'salaryAmount', code: 'invalid_amount' } });
  expect(services.updateSalary).not.toHaveBeenCalled();
});

it.each([
  ['page=0', 'page'],
  ['page=1&page=2', 'page'],
  ['page[x]=1', 'page'],
  ['page=9007199254740991&pageSize=100', 'page'],
  ['pageSize=101', 'pageSize'],
  ['pageSize[]=2', 'pageSize'],
])('rejects history query %s without retrieval', async (query, field) => {
  const services = operations();
  const response = await request(createApp(services)).get(
    `/api/employees/ACME-001/salary-history?${query}`,
  );
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: { field, code: 'invalid_pagination' } });
  expect(services.listSalaryHistory).not.toHaveBeenCalled();
});

it('forwards explicit history pagination', async () => {
  const services = operations();
  const page = { ...historyPage, page: 2, pageSize: 1, history: [] };
  services.listSalaryHistory.mockResolvedValue({ ok: true, historyPage: page });
  const response = await request(createApp(services)).get(
    '/api/employees/ACME-001/salary-history?page=2&pageSize=1',
  );
  expect(response.status).toBe(200);
  expect(response.body).toEqual(page);
  expect(services.listSalaryHistory).toHaveBeenCalledWith(employee.employeeId, {
    page: 2,
    pageSize: 1,
  });
});

it('returns 200 for existing employees with empty history', async () => {
  const services = operations();
  const page = { ...historyPage, history: [], total: 0 };
  services.listSalaryHistory.mockResolvedValue({ ok: true, historyPage: page });
  const response = await request(createApp(services)).get('/api/employees/ACME-001/salary-history');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(page);
});

it.each(['updateSalary', 'listSalaryHistory'] as const)(
  'sanitizes unexpected rejection from %s',
  async (operation) => {
    const services = operations();
    services[operation].mockRejectedValue(new Error('private SQL details'));
    const app = createApp(services);
    const response =
      operation === 'updateSalary'
        ? await request(app).patch('/api/employees/ACME-001/salary').send({ salaryAmount: '100' })
        : await request(app).get('/api/employees/ACME-001/salary-history');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'persistence_failed' } });
    expect(response.text).not.toContain('private SQL details');
  },
);

it('preserves malformed JSON handling for PATCH without persistence', async () => {
  const services = operations();
  const response = await request(createApp(services))
    .patch('/api/employees/ACME-001/salary')
    .set('Content-Type', 'application/json')
    .send('{');
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: { code: 'invalid_json' } });
  expect(services.updateSalary).not.toHaveBeenCalled();
});

it('preserves the 1 MiB body limit for PATCH', async () => {
  const services = operations();
  const response = await request(createApp(services))
    .patch('/api/employees/ACME-001/salary')
    .send({ salaryAmount: '9'.repeat(1024 * 1024) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ error: { code: 'body_too_large' } });
  expect(services.updateSalary).not.toHaveBeenCalled();
});
