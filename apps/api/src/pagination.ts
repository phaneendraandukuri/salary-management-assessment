export type Pagination = { page: number; pageSize: number };

export type PaginationResult =
  | { ok: true; pagination: Pagination }
  | { ok: false; error: { field: 'page' | 'pageSize'; code: 'invalid_pagination' } };

function positiveInteger(value: unknown, fallback: number): number | undefined {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.trim() !== value || !/^[0-9]+$/.test(value)) {
    return undefined;
  }
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export function parsePagination(page: unknown, pageSize: unknown): PaginationResult {
  const parsedPage = positiveInteger(page, 1);
  if (parsedPage === undefined) {
    return { ok: false, error: { field: 'page', code: 'invalid_pagination' } };
  }
  const parsedPageSize = positiveInteger(pageSize, 25);
  if (parsedPageSize === undefined || parsedPageSize > 100) {
    return { ok: false, error: { field: 'pageSize', code: 'invalid_pagination' } };
  }
  if (!Number.isSafeInteger((parsedPage - 1) * parsedPageSize)) {
    return { ok: false, error: { field: 'page', code: 'invalid_pagination' } };
  }
  return { ok: true, pagination: { page: parsedPage, pageSize: parsedPageSize } };
}
