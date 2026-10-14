import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import type { EmployeeOperations } from './app.js';
import type { Employee } from './employee.js';

const employee: Employee = {
  employeeId: 'ACME-001',
  name: 'Alex Example',
  email: 'alex@example.test',
  department: 'Engineering',
  role: 'Developer',
  country: 'India',
  currency: 'INR',
  salaryAmount: '9007199254740993.01',
};

function operations() {
  return {
    updateSalary: vi.fn<EmployeeOperations['updateSalary']>(),
    compensationInsights: vi.fn(),
    listSalaryHistory: vi.fn<EmployeeOperations['listSalaryHistory']>(),
    createEmployee: vi
      .fn<EmployeeOperations['createEmployee']>()
      .mockResolvedValue({ ok: true, employee }),
    listEmployees: vi.fn<EmployeeOperations['listEmployees']>().mockResolvedValue({
      employees: [employee],
      page: 1,
      pageSize: 25,
      total: 1,
    }),
  };
}

describe('employee HTTP API', () => {
  it('lists employees using default pagination and preserves salary strings', async () => {
    const services = operations();
    const response = await request(createApp(services)).get('/api/employees');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ employees: [employee], page: 1, pageSize: 25, total: 1 });
    expect(services.listEmployees).toHaveBeenCalledWith({ page: 1, pageSize: 25 });
  });

  it('forwards normalized criteria with pagination and keeps the response contract', async () => {
    const services = operations();
    const response = await request(createApp(services)).get('/api/employees').query({
      search: ' Alex ',
      country: ' India ',
      department: ' Engineering ',
      currency: ' INR ',
      sortBy: 'salaryAmount',
      sortDirection: 'desc',
      page: '2',
      pageSize: '10',
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ employees: [employee], page: 1, pageSize: 25, total: 1 });
    expect(services.listEmployees).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      search: 'Alex',
      country: 'India',
      department: 'Engineering',
      currency: 'INR',
      sortBy: 'salaryAmount',
      sortDirection: 'desc',
    });
  });

  it('omits blank search/filter values', async () => {
    const services = operations();
    const response = await request(createApp(services))
      .get('/api/employees')
      .query({ search: ' ', country: '', department: '\t', currency: ' ' });
    expect(response.status).toBe(200);
    expect(services.listEmployees).toHaveBeenCalledWith({ page: 1, pageSize: 25 });
  });

  for (const field of ['search', 'country', 'department', 'currency', 'sortBy', 'sortDirection']) {
    it.each([`${field}=a&${field}=b`, `${field}[x]=a`])(
      'rejects malformed directory query %s before retrieval',
      async (query) => {
        const services = operations();
        const response = await request(createApp(services)).get(`/api/employees?${query}`);
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: { field, code: 'invalid_query' } });
        expect(services.listEmployees).not.toHaveBeenCalled();
      },
    );
  }

  it.each([
    ['currency=JPY', 'currency', 'unsupported_currency'],
    ['sortBy=toString', 'sortBy', 'invalid_query'],
    ['sortDirection=sideways', 'sortDirection', 'invalid_query'],
  ])('rejects invalid directory query %s before retrieval', async (query, field, code) => {
    const services = operations();
    const response = await request(createApp(services)).get(`/api/employees?${query}`);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { field, code } });
    expect(services.listEmployees).not.toHaveBeenCalled();
  });

  it('creates an employee and returns HTTP 201', async () => {
    const services = operations();
    const response = await request(createApp(services)).post('/api/employees').send(employee);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ employee });
    expect(services.createEmployee).toHaveBeenCalledWith(employee);
  });

  it('forwards explicit pagination', async () => {
    const services = operations();
    services.listEmployees.mockResolvedValue({ employees: [], page: 2, pageSize: 10, total: 1 });
    const response = await request(createApp(services)).get('/api/employees?page=2&pageSize=10');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ employees: [], page: 2, pageSize: 10, total: 1 });
    expect(services.listEmployees).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
  });

  it.each([
    ['page=0', 'page'],
    ['page=1.5', 'page'],
    ['page=9007199254740992', 'page'],
    ['page=1&page=2', 'page'],
    ['pageSize=101', 'pageSize'],
    ['pageSize=2&pageSize=3', 'pageSize'],
    ['page[x]=1', 'page'],
    ['pageSize[]=2', 'pageSize'],
  ])('rejects invalid query %s without calling retrieval', async (query, field) => {
    const services = operations();
    const response = await request(createApp(services)).get(`/api/employees?${query}`);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { field, code: 'invalid_pagination' } });
    expect(services.listEmployees).not.toHaveBeenCalled();
  });

  it.each([
    { result: { ok: false, error: { field: 'name', code: 'invalid_field' } }, status: 400 },
    { result: { ok: false, error: { field: 'email', code: 'invalid_email' } }, status: 400 },
    {
      result: { ok: false, error: { field: 'salaryAmount', code: 'invalid_amount' } },
      status: 400,
    },
    {
      result: { ok: false, error: { field: 'currency', code: 'unsupported_currency' } },
      status: 400,
    },
    {
      result: { ok: false, error: { field: 'salaryAmount', code: 'amount_not_storable' } },
      status: 400,
    },
    {
      result: { ok: false, error: { field: 'employeeId', code: 'duplicate_employee_id' } },
      status: 409,
    },
    {
      result: { ok: false, error: { field: 'employee', code: 'persistence_failed' } },
      status: 500,
    },
  ] as const)('maps creation $result.error.code to HTTP $status', async ({ result, status }) => {
    const services = operations();
    services.createEmployee.mockResolvedValue(result);
    const response = await request(createApp(services)).post('/api/employees').send(employee);
    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: result.error });
  });

  it.each(['listEmployees', 'createEmployee'] as const)(
    'sanitizes unexpected rejection from %s',
    async (operation) => {
      const services = operations();
      services[operation].mockRejectedValue(new Error('private SQL details'));
      const app = createApp(services);
      const response =
        operation === 'listEmployees'
          ? await request(app).get('/api/employees')
          : await request(app).post('/api/employees').send(employee);
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: { code: 'persistence_failed' } });
      expect(response.text).not.toContain('private SQL details');
    },
  );

  it('returns a JSON error for malformed JSON without calling creation', async () => {
    const services = operations();
    const response = await request(createApp(services))
      .post('/api/employees')
      .set('Content-Type', 'application/json')
      .send('{');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { code: 'invalid_json' } });
    expect(services.createEmployee).not.toHaveBeenCalled();
  });

  it('accepts JSON bodies larger than Express default but below 1 MiB', async () => {
    const services = operations();
    const input = { ...employee, salaryAmount: `${'9'.repeat(131072)}.01` };
    const response = await request(createApp(services)).post('/api/employees').send(input);
    expect(response.status).toBe(201);
    expect(services.createEmployee).toHaveBeenCalledWith(input);
  });

  it('returns HTTP 413 for JSON bodies above 1 MiB', async () => {
    const services = operations();
    const response = await request(createApp(services))
      .post('/api/employees')
      .send({ ...employee, name: 'x'.repeat(1024 * 1024) });
    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: { code: 'body_too_large' } });
    expect(services.createEmployee).not.toHaveBeenCalled();
  });
});
