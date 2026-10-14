import { expect, it, vi } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import { createApp } from './app.js';
import { authOptions, authenticatedRequest, origin } from './test-support/auth.js';

function operations() {
  const employee = {
    employeeId: 'E',
    name: 'Example',
    email: 'example@example.test',
    country: 'India',
    department: 'HR',
    role: 'Manager',
    currency: 'INR',
    salaryAmount: '100.00',
  };
  return {
    createEmployee: vi.fn().mockResolvedValue({ ok: true, employee }),
    listEmployees: vi
      .fn()
      .mockResolvedValue({ employees: [employee], page: 1, pageSize: 25, total: 1 }),
    updateSalary: vi.fn().mockResolvedValue({ ok: true, employee }),
    listSalaryHistory: vi.fn().mockResolvedValue({
      ok: true,
      historyPage: { history: [], total: 0, page: 1, pageSize: 25 },
    }),
    compensationInsights: vi
      .fn()
      .mockResolvedValue({ groupBy: 'currency', headcount: 0, groups: [] }),
  };
}

it.each([
  ['get', '/api/employees'],
  ['post', '/api/employees'],
  ['patch', '/api/employees/E/salary'],
  ['get', '/api/employees/E/salary-history'],
  ['get', '/api/compensation-insights'],
] as const)('protects %s %s without invoking business operations', async (method, path) => {
  const services = operations();
  const app = createApp(services, undefined, await authOptions());
  const pending = request(app)[method](path);
  const response = await pending.set('Origin', origin).send({ salaryAmount: '100.00' });
  expect(response.status).toBe(401);
  expect(response.body).toEqual({ error: { code: 'authentication_required' } });
  for (const operation of Object.values(services)) expect(operation).not.toHaveBeenCalled();
});

it('preserves authenticated directory contracts and exact strings', async () => {
  const services = operations();
  const agent = await authenticatedRequest(services);
  const response = await agent.get('/api/employees');
  expect(response.status).toBe(200);
  expect(response.body.employees[0].salaryAmount).toBe('100.00');
});

it('requires authentication configuration whenever business operations are supplied', () => {
  expect(() => createApp(operations())).toThrow('Authentication configuration is required');
});

it('keeps health public without touching the session store even with a cookie', async () => {
  const store = new session.MemoryStore();
  const get = vi.spyOn(store, 'get');
  const app = createApp(operations(), undefined, await authOptions(store));
  expect((await request(app).get('/health').set('Cookie', 'acme_session=untrusted')).status).toBe(
    200,
  );
  expect(get).not.toHaveBeenCalled();
});
