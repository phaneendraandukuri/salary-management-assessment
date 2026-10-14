import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listen: vi.fn().mockReturnValue({ on: vi.fn() }),
  pool: { end: vi.fn() },
  config: vi.fn().mockReturnValue({ port: 1234, frontendDirectory: '/built-ui' }),
  app: vi.fn(),
}));
vi.mock('./app.js', () => ({ createApp: mocks.app }));
vi.mock('./database.js', () => ({ createPool: vi.fn().mockReturnValue(mocks.pool) }));
vi.mock('./startup-config.js', () => ({ startupConfig: mocks.config }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('uses validated configuration, supplies the production build, and binds all IPv4 interfaces', async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/acme_test');
  vi.stubEnv('PORT', '1234');
  mocks.app.mockReturnValue({ listen: mocks.listen });
  vi.spyOn(process, 'once').mockReturnValue(process);
  await import('./server.js');
  expect(mocks.config).toHaveBeenCalledWith(process.env);
  expect(mocks.app).toHaveBeenCalledWith(expect.any(Object), '/built-ui');
  expect(mocks.listen).toHaveBeenCalledWith(1234, '0.0.0.0', expect.any(Function));
});
