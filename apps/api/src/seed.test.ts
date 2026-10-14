import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { seedEmployees } from './seed.js';

it('discards the checked-out client if rollback fails, preserving the original error', async () => {
  const failure = new Error('Insert failed');
  const client = {
    query: vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(new Error('Rollback failed')),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn().mockResolvedValue(client) };
  await expect(seedEmployees(pool as unknown as Pool)).rejects.toBe(failure);
  expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  expect(client.release).toHaveBeenCalledWith(true);
});
