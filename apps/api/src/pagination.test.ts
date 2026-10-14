import { describe, expect, it } from 'vitest';
import { parsePagination } from './pagination.js';

describe('parsePagination', () => {
  it('defaults to page 1 and page size 25', () => {
    expect(parsePagination(undefined, undefined)).toEqual({
      ok: true,
      pagination: { page: 1, pageSize: 25 },
    });
  });

  it('accepts explicit page and page size', () => {
    expect(parsePagination('2', '100')).toEqual({
      ok: true,
      pagination: { page: 2, pageSize: 100 },
    });
  });

  for (const field of ['page', 'pageSize'] as const) {
    it.each(
      [
        '',
        '0',
        '-1',
        '1.5',
        '1e2',
        ' 2',
        '2 ',
        '2\n',
        'abc',
        '9007199254740992',
        null,
        2,
        ['2'],
        ['1', '2'],
        {},
      ].map((value) => ({ value })),
    )(`rejects malformed ${field}: $value`, ({ value }) => {
      const page = field === 'page' ? value : undefined;
      const pageSize = field === 'pageSize' ? value : undefined;
      expect(parsePagination(page, pageSize)).toEqual({
        ok: false,
        error: { field, code: 'invalid_pagination' },
      });
    });
  }

  it('rejects page sizes above 100', () => {
    expect(parsePagination('1', '101')).toEqual({
      ok: false,
      error: { field: 'pageSize', code: 'invalid_pagination' },
    });
  });

  it('rejects a page whose calculated offset is unsafe', () => {
    expect(parsePagination('9007199254740991', '100')).toEqual({
      ok: false,
      error: { field: 'page', code: 'invalid_pagination' },
    });
  });
});
