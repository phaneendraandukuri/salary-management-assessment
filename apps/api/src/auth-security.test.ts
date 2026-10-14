import { afterEach, expect, it, vi } from 'vitest';
import session from 'express-session';
import request from 'supertest';
import { createApp } from './app.js';
import { authOrigin } from './auth-config.js';
import { authOptions, origin, password } from './test-support/auth.js';
afterEach(() => vi.restoreAllMocks());

it('accepts an exact local Vite origin and an HTTPS production origin', () => {
  expect(authOrigin({ APP_ORIGIN: origin })).toBe(origin);
  expect(authOrigin({ APP_ORIGIN: 'https://acme.example.test', NODE_ENV: 'production' })).toBe(
    'https://acme.example.test',
  );
});
it.each([
  undefined,
  'null',
  '*',
  'https://acme.example.test/',
  'https://acme.example.test/path',
  'https://user:pass@acme.example.test',
  'https://acme.example.test?x=1',
  'http://acme.example.test',
])('rejects invalid production origin configuration without echoing it', (value) => {
  expect(() => authOrigin({ APP_ORIGIN: value, NODE_ENV: 'production' })).toThrow(
    'APP_ORIGIN must be',
  );
});
it.each([
  undefined,
  'null',
  'http://localhost:5173',
  'http://127.0.0.1:5173/',
  'https://malicious.example.test',
])('rejects mismatched Origin %s before parsing or session lookup', async (value) => {
  const store = new session.MemoryStore();
  const get = vi.spyOn(store, 'get');
  const set = vi.spyOn(store, 'set');
  const app = createApp(undefined, undefined, await authOptions(store));
  const pending = request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{');
  if (value !== undefined) pending.set('Origin', value);
  const response = await pending;
  expect(response.status).toBe(403);
  expect(response.body).toEqual({ error: { code: 'invalid_origin' } });
  expect(get).not.toHaveBeenCalled();
  expect(set).not.toHaveBeenCalled();
});
it.each(['post', 'patch', 'put', 'delete'] as const)(
  'checks Origin for unsafe %s API methods',
  async (method) => {
    const app = createApp(undefined, undefined, await authOptions());
    expect((await request(app)[method]('/api/employees')).status).toBe(403);
  },
);
it('requires exact Origin for logout too, while session GET needs none', async () => {
  const app = createApp(undefined, undefined, await authOptions());
  expect((await request(app).post('/api/auth/logout')).status).toBe(403);
  expect((await request(app).get('/api/auth/session')).status).toBe(401);
  expect(
    (
      await request(app)
        .post('/api/auth/login')
        .set('Origin', origin)
        .send({ username: 'hr', password })
    ).status,
  ).toBe(200);
});
it('rejects insecure production API requests before processing credentials', async () => {
  const app = createApp(undefined, undefined, {
    ...(await authOptions()),
    origin: 'https://acme.example.test',
    production: true,
  });
  const response = await request(app)
    .post('/api/auth/login')
    .set('Origin', 'https://acme.example.test')
    .send({ username: 'hr', password });
  expect(response.status).toBe(403);
  expect(response.body).toEqual({ error: { code: 'https_required' } });
  expect(response.headers['set-cookie']).toBeUndefined();
  expect((await request(app).get('/health')).status).toBe(200);
});
it('sets Secure cookies behind the bounded production proxy', async () => {
  const app = createApp(undefined, undefined, {
    ...(await authOptions()),
    origin: 'https://acme.example.test',
    production: true,
  });
  expect(app.get('trust proxy')).toBe(1);
  const response = await request(app)
    .post('/api/auth/login')
    .set('X-Forwarded-Proto', 'https')
    .set('Origin', 'https://acme.example.test')
    .send({ username: 'hr', password });
  expect(response.status).toBe(200);
  expect(String(response.headers['set-cookie']).includes('Secure')).toBe(true);
  expect(String(response.headers['set-cookie']).includes('HttpOnly')).toBe(true);
});
it('uses only the nearest forwarded address and ignores proxy headers in development', async () => {
  const prod = createApp(undefined, undefined, {
    ...(await authOptions()),
    origin: 'https://acme.example.test',
    production: true,
  });
  prod.get('/api/proxy-test', (req, res) => res.json({ ip: req.ip }));
  const response = await request(prod)
    .get('/api/proxy-test')
    .set('X-Forwarded-Proto', 'https')
    .set('X-Forwarded-For', '203.0.113.10, 198.51.100.20');
  expect(response.body.ip).toBe('198.51.100.20');
  const dev = createApp(undefined, undefined, await authOptions());
  expect(dev.get('trust proxy')).toBe(false);
  dev.get('/api/proxy-test', (req, res) => res.json({ secure: req.secure, ip: req.ip }));
  const local = await request(dev)
    .get('/api/proxy-test')
    .set('X-Forwarded-Proto', 'https')
    .set('X-Forwarded-For', '203.0.113.10');
  expect(local.body.secure).toBe(false);
  expect(local.body.ip === '203.0.113.10').toBe(false);
});
