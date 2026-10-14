import { randomBytes } from 'node:crypto';
import session from 'express-session';
import request from 'supertest';
import { beforeAll, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import express from 'express';
import { authRouter } from './auth.js';
import { hashPassword } from './hr-credentials.js';

const password = randomBytes(24).toString('base64url');
const sessionSecret = randomBytes(32).toString('base64url');
let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword(password);
});
function setup(store = new session.MemoryStore(), production = false) {
  return createApp(undefined, undefined, {
    credentials: { username: 'hr', passwordHash, sessionSecret },
    store,
    production,
  });
}
function login(app: ReturnType<typeof createApp>) {
  return request(app).post('/api/auth/login').send({ username: 'hr', password });
}
function cookie(response: { headers: Record<string, unknown> }): string {
  const values = response.headers['set-cookie'] as string[] | undefined;
  return values?.[0]?.split(';')[0] ?? '';
}

it('saves login before success and restores the user on session check', async () => {
  const app = setup();
  const agent = request.agent(app);
  const loggedIn = await agent.post('/api/auth/login').send({ username: 'hr', password });
  expect(loggedIn.status).toBe(200);
  expect(loggedIn.body).toEqual({ user: { username: 'hr' } });
  expect(loggedIn.headers['cache-control']).toBe('no-store');
  const checked = await agent.get('/api/auth/session');
  expect(checked.status).toBe(200);
  expect(checked.body).toEqual({ user: { username: 'hr' } });
  expect(checked.headers['cache-control']).toBe('no-store');
});

it('rejects missing sessions without storing an anonymous session', async () => {
  const store = new session.MemoryStore();
  const set = vi.spyOn(store, 'set');
  const checked = await request(setup(store)).get('/api/auth/session');
  expect(checked.status).toBe(401);
  expect(checked.body).toEqual({ error: { code: 'authentication_required' } });
  expect(checked.headers['set-cookie']).toBeUndefined();
  expect(set).not.toHaveBeenCalled();
});

it('validates input and gives the same generic failure for wrong username and password', async () => {
  const store = new session.MemoryStore();
  const set = vi.spyOn(store, 'set');
  const app = setup(store);
  for (const input of [
    undefined,
    [],
    {},
    { username: 1, password },
    { username: 'hr', password: '' },
  ]) {
    const response = await request(app).post('/api/auth/login').send(input);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { code: 'invalid_credentials_input' } });
  }
  for (const input of [
    { username: 'unknown', password },
    { username: 'hr', password: 'incorrect' },
  ]) {
    const response = await request(app).post('/api/auth/login').send(input);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: 'invalid_credentials' } });
    expect(response.headers['set-cookie']).toBeUndefined();
  }
  expect(set).not.toHaveBeenCalled();
});

it('regenerates the ID on a second login and invalidates the previous session', async () => {
  const app = setup();
  const first = await login(app);
  const second = await request(app)
    .post('/api/auth/login')
    .set('Cookie', cookie(first))
    .send({ username: 'hr', password });
  expect(second.status).toBe(200);
  expect(cookie(first) === cookie(second)).toBe(false);
  expect((await request(app).get('/api/auth/session').set('Cookie', cookie(first))).status).toBe(
    401,
  );
  expect((await request(app).get('/api/auth/session').set('Cookie', cookie(second))).status).toBe(
    200,
  );
});

it('destroys logout sessions and clears the cookie; repeated logout succeeds', async () => {
  const app = setup();
  const loggedIn = await login(app);
  const response = await request(app).post('/api/auth/logout').set('Cookie', cookie(loggedIn));
  expect(response.status).toBe(204);
  expect(String(response.headers['set-cookie']).includes('Expires=Thu, 01 Jan 1970')).toBe(true);
  expect((await request(app).get('/api/auth/session').set('Cookie', cookie(loggedIn))).status).toBe(
    401,
  );
  expect((await request(app).post('/api/auth/logout')).status).toBe(204);
});

it('sets host-only HttpOnly Lax cookies with a 30-minute lifetime for local HTTP', async () => {
  const response = await login(setup());
  const value = String(response.headers['set-cookie']);
  expect(value.includes('HttpOnly')).toBe(true);
  expect(value.includes('SameSite=Lax')).toBe(true);
  expect(value.includes('Path=/')).toBe(true);
  expect(value.includes('Domain=')).toBe(false);
  expect(value.includes('Secure')).toBe(false);
  const expires = /Expires=([^;]+)/.exec(value)?.[1];
  expect(expires !== undefined).toBe(true);
  expect(Math.abs(Date.parse(expires!) - Date.now() - 30 * 60 * 1000)).toBeLessThan(5000);
});

it('never sends the production Secure cookie over direct HTTP', async () => {
  const response = await login(setup(new session.MemoryStore(), true));
  expect(response.status).toBe(200);
  expect(response.headers['set-cookie']).toBeUndefined();
});

it('ignores tampered cookies', async () => {
  const response = await request(setup())
    .get('/api/auth/session')
    .set('Cookie', 'acme_session=untrusted');
  expect(response.status).toBe(401);
});

it('attempts opportunistic pruning without failing a valid login when cleanup fails', async () => {
  const store = Object.assign(new session.MemoryStore(), {
    pruneSessions: vi.fn((callback: (error: Error) => void) =>
      callback(new Error('cleanup failed')),
    ),
  });
  const response = await login(setup(store));
  expect(response.status).toBe(200);
  expect(store.pruneSessions).toHaveBeenCalledOnce();
  expect(
    (await request(setup(store)).get('/api/auth/session').set('Cookie', cookie(response))).status,
  ).toBe(200);
});

it('sets Secure on a production cookie when the connection is HTTPS', async () => {
  const app = express();
  app.use((req, _res, next) => {
    Object.defineProperty(req.socket, 'encrypted', { value: true });
    next();
  });
  app.use(
    '/api/auth',
    authRouter({
      credentials: { username: 'hr', passwordHash, sessionSecret },
      store: new session.MemoryStore(),
      production: true,
    }),
  );
  const response = await login(app);
  expect(response.status).toBe(200);
  expect(String(response.headers['set-cookie']).includes('Secure')).toBe(true);
});

it.each(['get', 'set', 'destroy'] as const)(
  'sanitizes session-store %s failures',
  async (method) => {
    const store = new session.MemoryStore();
    const app = setup(store);
    const loggedIn = await login(app);
    vi.spyOn(store, method).mockImplementation((_id: string, ...args: unknown[]) => {
      const callback = args.at(-1) as (error: Error) => void;
      callback(new Error('private database details'));
    });
    const response =
      method === 'get'
        ? await request(app).get('/api/auth/session').set('Cookie', cookie(loggedIn))
        : method === 'set'
          ? await login(app)
          : await request(app).post('/api/auth/logout').set('Cookie', cookie(loggedIn));
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'persistence_failed' } });
    expect(response.headers['set-cookie']).toBeUndefined();
  },
);

it('fails closed when regeneration cannot delete the previous session', async () => {
  const store = new session.MemoryStore();
  const app = setup(store);
  const loggedIn = await login(app);
  vi.spyOn(store, 'destroy').mockImplementation((_id, callback) =>
    callback?.(new Error('private database details')),
  );
  const response = await request(app)
    .post('/api/auth/login')
    .set('Cookie', cookie(loggedIn))
    .send({ username: 'hr', password });
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: { code: 'persistence_failed' } });
  expect(response.headers['set-cookie']).toBeUndefined();
});

it('does not respond with success before the store finishes saving', async () => {
  const store = new session.MemoryStore();
  const originalSet = store.set.bind(store);
  let finish: () => void = () => {};
  let notify: () => void = () => {};
  const entered = new Promise<void>((resolve) => {
    notify = resolve;
  });
  vi.spyOn(store, 'set').mockImplementationOnce((id, data, callback) => {
    finish = () => originalSet(id, data, callback);
    notify();
  });
  let completed = false;
  const pending = login(setup(store)).then((response) => {
    completed = true;
    return response;
  });
  await entered;
  expect(completed).toBe(false);
  finish();
  expect((await pending).status).toBe(200);
});
