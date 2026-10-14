import { expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { updateSalary } from './update-salary.js';

const persistenceFailure = { ok: false, error: { field: 'employee', code: 'persistence_failed' } };

it('sanitizes connection acquisition failures', async () => {
  // Only the pg methods used by the function are supplied; these tests open no database connection.
  const pool = { connect: vi.fn().mockRejectedValue(new Error('private connection details')) };
  expect(await updateSalary(pool as unknown as Pool, 'ACME-001', '100.00')).toEqual(
    persistenceFailure,
  );
});

it('sanitizes a query failure, rolls back, and releases the client', async () => {
  const client = {
    query: vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('private SQL details'))
      .mockResolvedValueOnce({ rows: [] }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn().mockResolvedValue(client as unknown as PoolClient) };
  expect(await updateSalary(pool as unknown as Pool, 'ACME-001', '100.00')).toEqual(
    persistenceFailure,
  );
  expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  expect(client.release).toHaveBeenCalledTimes(1);
});

it('discards the client and returns a safe failure if rollback itself fails', async () => {
  const client = {
    query: vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('private SQL details'))
      .mockRejectedValueOnce(new Error('private rollback details')),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn().mockResolvedValue(client as unknown as PoolClient) };
  await expect(updateSalary(pool as unknown as Pool, 'ACME-001', '100.00')).resolves.toEqual(
    persistenceFailure,
  );
  expect(client.release).toHaveBeenCalledWith(true);
});
