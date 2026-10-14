import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createApp } from './app.js';
const insights = {
  groupBy: 'currency' as const,
  headcount: 1,
  groups: [
    {
      currency: 'USD' as const,
      groupValue: null,
      headcount: 1,
      total: '9007199254740993.01',
      average: '9007199254740993.01',
      median: '9007199254740993.01',
      minimum: '9007199254740993.01',
      maximum: '9007199254740993.01',
    },
  ],
};
function services() {
  return {
    createEmployee: vi.fn(),
    listEmployees: vi.fn(),
    updateSalary: vi.fn(),
    listSalaryHistory: vi.fn(),
    compensationInsights: vi.fn().mockResolvedValue(insights),
  };
}
it('returns default currency insights with exact strings', async () => {
  const operations = services();
  const response = await request(createApp(operations)).get('/api/compensation-insights');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(insights);
  expect(operations.compensationInsights).toHaveBeenCalledWith({ groupBy: 'currency' });
});
it.each(['currency', 'country', 'department'])(
  'forwards normalized filters and %s grouping',
  async (groupBy) => {
    const operations = services();
    await request(createApp(operations))
      .get('/api/compensation-insights')
      .query({ country: ' India ', department: ' HR ', groupBy });
    expect(operations.compensationInsights).toHaveBeenCalledWith({
      country: 'India',
      department: 'HR',
      groupBy,
    });
  },
);
it.each([
  ['country=a&country=b', 'country'],
  ['country[x]=a', 'country'],
  ['department=a&department=b', 'department'],
  ['department[]=a', 'department'],
  ['groupBy=a&groupBy=b', 'groupBy'],
  ['groupBy[x]=a', 'groupBy'],
  ['groupBy=toString', 'groupBy'],
  ['groupBy=', 'groupBy'],
])('rejects malformed query %s without analytics', async (query, field) => {
  const operations = services();
  const response = await request(createApp(operations)).get(`/api/compensation-insights?${query}`);
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: { field, code: 'invalid_query' } });
  expect(operations.compensationInsights).not.toHaveBeenCalled();
});
it('sanitizes unexpected database/aggregate errors', async () => {
  const operations = services();
  operations.compensationInsights.mockRejectedValueOnce(new Error('private SQL details'));
  const response = await request(createApp(operations)).get('/api/compensation-insights');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: { code: 'persistence_failed' } });
  expect(response.text).not.toContain('private');
});
