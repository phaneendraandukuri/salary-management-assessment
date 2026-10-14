import { expect, it } from 'vitest';
import { parseDirectoryQuery, directorySortColumns } from './directory-query.js';

it('omits blank filters and preserves existing defaults', () => {
  expect(parseDirectoryQuery({})).toEqual({ ok: true, criteria: {} });
  expect(
    parseDirectoryQuery({ search: ' ', country: '', department: '\t', currency: ' ' }),
  ).toEqual({ ok: true, criteria: {} });
});

it('trims filters and accepts explicit sorting', () => {
  expect(
    parseDirectoryQuery({
      search: ' Alex%_\\ ',
      country: ' India ',
      department: ' HR ',
      currency: ' USD ',
      sortBy: 'salaryAmount',
      sortDirection: 'desc',
    }),
  ).toEqual({
    ok: true,
    criteria: {
      search: 'Alex%_\\',
      country: 'India',
      department: 'HR',
      currency: 'USD',
      sortBy: 'salaryAmount',
      sortDirection: 'desc',
    },
  });
});

it.each(Object.keys(directorySortColumns))('accepts sort field %s', (sortBy) => {
  expect(parseDirectoryQuery({ sortBy })).toEqual({ ok: true, criteria: { sortBy } });
});

for (const field of [
  'search',
  'country',
  'department',
  'currency',
  'sortBy',
  'sortDirection',
] as const) {
  it.each([null, 1, ['a', 'b'], { x: 'a' }])(`rejects malformed ${field}: %j`, (value) => {
    expect(parseDirectoryQuery({ [field]: value })).toEqual({
      ok: false,
      error: { field, code: 'invalid_query' },
    });
  });
}

it.each(['INR', 'USD', 'EUR', 'GBP'])('accepts currency %s', (currency) => {
  expect(parseDirectoryQuery({ currency })).toEqual({ ok: true, criteria: { currency } });
});
it.each(['usd', 'JPY'])('rejects unsupported currency %s', (currency) => {
  expect(parseDirectoryQuery({ currency })).toEqual({
    ok: false,
    error: { field: 'currency', code: 'unsupported_currency' },
  });
});
it.each(['email', 'salary_amount', 'toString', 'name; DROP TABLE employees', ''])(
  'rejects sort field %s',
  (sortBy) => {
    expect(parseDirectoryQuery({ sortBy })).toEqual({
      ok: false,
      error: { field: 'sortBy', code: 'invalid_query' },
    });
  },
);
it.each(['ASC', 'sideways', ' desc ', ''])('rejects direction %s', (sortDirection) => {
  expect(parseDirectoryQuery({ sortDirection })).toEqual({
    ok: false,
    error: { field: 'sortDirection', code: 'invalid_query' },
  });
});
it.each(['asc', 'desc'])('accepts direction %s', (sortDirection) => {
  expect(parseDirectoryQuery({ sortDirection })).toEqual({ ok: true, criteria: { sortDirection } });
});
