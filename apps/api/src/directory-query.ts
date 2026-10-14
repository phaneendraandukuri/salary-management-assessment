import type { SalaryCurrency } from './salary.js';

export const directorySortColumns = {
  employeeId: 'employee_id',
  name: 'name',
  department: 'department',
  role: 'role',
  country: 'country',
  currency: 'currency',
  salaryAmount: 'salary_amount',
} as const;

export type DirectoryCriteria = {
  search?: string;
  country?: string;
  department?: string;
  currency?: SalaryCurrency;
  sortBy?: keyof typeof directorySortColumns;
  sortDirection?: 'asc' | 'desc';
};

type DirectoryQueryResult =
  | { ok: true; criteria: DirectoryCriteria }
  | {
      ok: false;
      error: { field: keyof DirectoryCriteria; code: 'invalid_query' | 'unsupported_currency' };
    };

export function parseDirectoryQuery(query: Record<string, unknown>): DirectoryQueryResult {
  const criteria: DirectoryCriteria = {};
  for (const field of [
    'search',
    'country',
    'department',
    'currency',
    'sortBy',
    'sortDirection',
  ] as const) {
    const raw = query[field];
    if (raw === undefined) continue;
    if (typeof raw !== 'string') return { ok: false, error: { field, code: 'invalid_query' } };
    if (field === 'sortBy') {
      if (!Object.hasOwn(directorySortColumns, raw))
        return { ok: false, error: { field, code: 'invalid_query' } };
      criteria.sortBy = raw as keyof typeof directorySortColumns;
    } else if (field === 'sortDirection') {
      if (raw !== 'asc' && raw !== 'desc')
        return { ok: false, error: { field, code: 'invalid_query' } };
      criteria.sortDirection = raw;
    } else {
      const value = raw.trim();
      if (!value) continue;
      if (field === 'currency') {
        if (value !== 'INR' && value !== 'USD' && value !== 'EUR' && value !== 'GBP')
          return { ok: false, error: { field, code: 'unsupported_currency' } };
        criteria.currency = value;
      } else criteria[field] = value;
    }
  }
  return { ok: true, criteria };
}
