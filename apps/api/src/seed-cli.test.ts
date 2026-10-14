import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  end: vi.fn(),
  seed: vi.fn(),
  createPool: vi.fn(),
}));
vi.mock('./database.js', () => ({ createPool: mocks.createPool }));
vi.mock('./seed.js', () => ({ seedEmployees: mocks.seed }));
const originalExitCode = process.exitCode;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.end.mockResolvedValue(undefined);
  mocks.seed.mockResolvedValue({ inserted: 9999, skipped: 1 });
  mocks.createPool.mockReturnValue({ end: mocks.end });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.exitCode = undefined;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  process.exitCode = originalExitCode;
});

it('identifies the database without credentials before seeding and closes its pool', async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://demo:private-secret@localhost:5432/acme_test');
  await import('./seed-cli.js');
  expect(console.log).toHaveBeenCalledWith('Seed target: localhost:5432/acme_test');
  expect(vi.mocked(console.log).mock.invocationCallOrder[0]).toBeLessThan(
    mocks.seed.mock.invocationCallOrder[0],
  );
  expect(console.log).toHaveBeenCalledWith(
    'Seed complete: 9999 inserted; 1 skipped/conflicting IDs (existing records preserved)',
  );
  expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('private-secret'));
  expect(mocks.end).toHaveBeenCalledTimes(1);
  expect(process.exitCode).not.toBe(1);
});

it('requires DATABASE_URL and never falls back to TEST_DATABASE_URL', async () => {
  vi.stubEnv('DATABASE_URL', undefined);
  vi.stubEnv('TEST_DATABASE_URL', 'postgresql://localhost/acme_test');
  await import('./seed-cli.js');
  expect(console.error).toHaveBeenCalledWith('DATABASE_URL is required for seeding');
  expect(mocks.createPool).not.toHaveBeenCalled();
  expect(mocks.seed).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
});

it('reports seed failure without database internals and closes its pool', async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/acme_test');
  mocks.seed.mockRejectedValueOnce(new Error('private SQL details'));
  await import('./seed-cli.js');
  expect(console.error).toHaveBeenCalledWith(
    'Seed failed; check the database connection and applied migrations',
  );
  expect(mocks.end).toHaveBeenCalledTimes(1);
  expect(process.exitCode).toBe(1);
});

it('reports pool shutdown failure without leaking internals', async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/acme_test');
  mocks.end.mockRejectedValueOnce(new Error('private connection details'));
  await import('./seed-cli.js');
  expect(console.error).toHaveBeenCalledWith('Seed pool shutdown failed');
  expect(process.exitCode).toBe(1);
});

it.each(['not-a-url', 'postgresql://localhost', 'https://localhost/acme'])(
  'rejects an ambiguous/invalid database target %s before connecting',
  async (url) => {
    vi.stubEnv('DATABASE_URL', url);
    await import('./seed-cli.js');
    expect(mocks.createPool).not.toHaveBeenCalled();
    expect(mocks.seed).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  },
);
