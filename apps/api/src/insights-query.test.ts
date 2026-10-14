import { expect, it } from 'vitest';
import { parseInsightsQuery } from './insights-query.js';
it('defaults to currency grouping and omits blank filters', () => {
  expect(parseInsightsQuery({})).toEqual({ ok: true, query: { groupBy: 'currency' } });
  expect(parseInsightsQuery({ country: ' ', department: '\t' })).toEqual({
    ok: true,
    query: { groupBy: 'currency' },
  });
});
it.each(['currency', 'country', 'department'])(
  'accepts %s grouping and trimmed exact filters',
  (groupBy) => {
    expect(parseInsightsQuery({ country: ' India ', department: ' HR ', groupBy })).toEqual({
      ok: true,
      query: { country: 'India', department: 'HR', groupBy },
    });
  },
);
for (const field of ['country', 'department', 'groupBy'] as const) {
  it.each([null, 3, ['a', 'b'], { x: 'a' }])(`rejects malformed ${field}: %j`, (value) => {
    expect(parseInsightsQuery({ [field]: value })).toEqual({
      ok: false,
      error: { field, code: 'invalid_query' },
    });
  });
}
it.each(['', 'Currency', ' currency ', 'toString', 'country; DROP TABLE employees'])(
  'rejects invalid grouping %j',
  (groupBy) => {
    expect(parseInsightsQuery({ groupBy })).toEqual({
      ok: false,
      error: { field: 'groupBy', code: 'invalid_query' },
    });
  },
);
