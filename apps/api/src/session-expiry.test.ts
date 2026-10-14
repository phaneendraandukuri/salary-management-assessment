import session from 'express-session';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { authOptions, origin, password } from './test-support/auth.js';

afterEach(() => {
  vi.restoreAllMocks();
});
const idle = 30 * 60 * 1000;
const absolute = 8 * 60 * 60 * 1000;
async function rows(store: session.MemoryStore) {
  return new Promise<Record<string, session.SessionData>>((resolve, reject) =>
    store.all((error, data) => (error ? reject(error) : resolve(data ?? {}))),
  );
}
async function setup() {
  const store = new session.MemoryStore();
  const services = {
    createEmployee: vi.fn(),
    updateSalary: vi.fn(),
    listSalaryHistory: vi.fn(),
    compensationInsights: vi.fn(),
    listEmployees: vi.fn().mockResolvedValue({ employees: [], page: 1, pageSize: 25, total: 0 }),
  };
  const app = createApp(services, undefined, await authOptions(store));
  const loggedIn = await request(app)
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ username: 'hr', password });
  expect(loggedIn.status).toBe(200);
  const cookies: unknown = loggedIn.headers['set-cookie'];
  const cookie = Array.isArray(cookies) ? String(cookies[0]).split(';')[0]! : '';
  const entries = Object.entries(await rows(store));
  expect(entries.length).toBe(1);
  const [sid, data] = entries[0]!;
  return { store, services, app, cookie, sid, data };
}
async function set(store: session.MemoryStore, sid: string, data: session.SessionData) {
  await new Promise<void>((resolve, reject) =>
    store.set(sid, data, (error) => (error ? reject(error) : resolve())),
  );
}

it('records immutable creation time and initial activity at login', async () => {
  const { data } = await setup();
  expect(typeof data.createdAt).toBe('number');
  expect(data.lastActivityAt).toBe(data.createdAt);
});

it.each([idle, idle + 1])(
  'rejects inactivity at or beyond the exact idle boundary %s',
  async (elapsed) => {
    const { store, app, cookie, sid, data, services } = await setup();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await set(store, sid, {
      ...data,
      createdAt: now - absolute / 2,
      lastActivityAt: now - elapsed,
    });
    const response = await request(app).get('/api/employees').set('Cookie', cookie);
    expect(response.status).toBe(401);
    expect(services.listEmployees).not.toHaveBeenCalled();
  },
);

it.each([absolute, absolute + 1])(
  'rejects absolute expiry %s despite recent activity',
  async (elapsed) => {
    const { store, app, cookie, sid, data, services } = await setup();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await set(store, sid, { ...data, createdAt: now - elapsed, lastActivityAt: now - 1 });
    const response = await request(app).get('/api/employees').set('Cookie', cookie);
    expect(response.status).toBe(401);
    expect(services.listEmployees).not.toHaveBeenCalled();
  },
);

it('persists sliding renewal before business execution and retains the original creation time', async () => {
  const { store, app, cookie, sid, data, services } = await setup();
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  const createdAt = now - absolute / 2;
  await set(store, sid, { ...data, createdAt, lastActivityAt: now - idle + 1 });
  services.listEmployees.mockImplementation(async () => {
    const renewed = (await rows(store))[sid]!;
    expect(renewed.lastActivityAt).toBe(Date.now());
    return { employees: [], page: 1, pageSize: 25, total: 0 };
  });
  expect((await request(app).get('/api/employees').set('Cookie', cookie)).status).toBe(200);
  expect((await rows(store))[sid]!.createdAt).toBe(createdAt);
  clock.mockReturnValue(now + idle - 1);
  expect((await request(app).get('/api/employees').set('Cookie', cookie)).status).toBe(200);
});

it.each([1, 1000])(
  'caps renewed cookie/store expiry with %s ms of absolute lifetime remaining',
  async (remaining) => {
    const { store, app, cookie, sid, data } = await setup();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await set(store, sid, {
      ...data,
      createdAt: now - absolute + remaining,
      lastActivityAt: now - 1,
    });
    const response = await request(app).get('/api/auth/session').set('Cookie', cookie);
    expect(response.status).toBe(200);
    const updated = (await rows(store))[sid]!;
    expect(new Date(updated.cookie.expires!).getTime()).toBe(now + remaining);
    expect(response.headers['set-cookie'] !== undefined).toBe(true);
  },
);

it('requires fresh login for sessions missing lifetime metadata', async () => {
  const { store, app, cookie, sid, data } = await setup();
  delete data.createdAt;
  delete data.lastActivityAt;
  await set(store, sid, data);
  expect((await request(app).get('/api/auth/session').set('Cookie', cookie)).status).toBe(401);
});

it('fails closed on renewal storage failure before invoking business operations', async () => {
  const { store, app, cookie, services } = await setup();
  vi.spyOn(store, 'set').mockImplementation((_sid, _data, callback) =>
    callback?.(new Error('private storage details')),
  );
  const response = await request(app).get('/api/employees').set('Cookie', cookie);
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: { code: 'persistence_failed' } });
  expect(services.listEmployees).not.toHaveBeenCalled();
});

it('rejects expired sessions even when deletion fails', async () => {
  const { store, app, cookie, sid, data } = await setup();
  const now = Date.now();
  await set(store, sid, { ...data, createdAt: now - absolute, lastActivityAt: now - 1 });
  vi.spyOn(store, 'destroy').mockImplementation((_sid, callback) =>
    callback?.(new Error('private storage details')),
  );
  expect((await request(app).get('/api/auth/session').set('Cookie', cookie)).status).toBe(401);
});

it('keeps concurrent renewals monotonic when an older save completes late', async () => {
  const { store, app, cookie, sid, data } = await setup();
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  await set(store, sid, { ...data, createdAt: now - absolute / 2, lastActivityAt: now - 1 });
  const original = store.set.bind(store);
  let release: () => void = () => {};
  let entered: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  vi.spyOn(store, 'set').mockImplementationOnce((id, value, callback) => {
    release = () => original(id, value, callback);
    entered();
  });
  const first = request(app)
    .get('/api/employees')
    .set('Cookie', cookie)
    .then((response) => response);
  await waiting;
  clock.mockReturnValue(now + 1000);
  let lookup: () => void = () => {};
  const loaded = new Promise<void>((resolve) => {
    lookup = resolve;
  });
  const get = store.get.bind(store);
  vi.spyOn(store, 'get').mockImplementationOnce((id, callback) =>
    get(id, (error, value) => {
      callback(error, value);
      lookup();
    }),
  );
  const second = request(app)
    .get('/api/employees')
    .set('Cookie', cookie)
    .then((response) => response);
  await loaded;
  release();
  expect((await first).status).toBe(200);
  expect((await second).status).toBe(200);
  expect((await rows(store))[sid]!.lastActivityAt).toBe(now + 1000);
});

it('does not resurrect a session when logout races a delayed renewal', async () => {
  const { store, app, cookie } = await setup();
  const original = store.set.bind(store);
  let release: () => void = () => {};
  let entered: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  vi.spyOn(store, 'set').mockImplementationOnce((id, value, callback) => {
    release = () => original(id, value, callback);
    entered();
  });
  const renewal = request(app)
    .get('/api/employees')
    .set('Cookie', cookie)
    .then((response) => response);
  await waiting;
  const get = store.get.bind(store);
  let notify: () => void = () => {};
  const loaded = new Promise<void>((resolve) => {
    notify = resolve;
  });
  vi.spyOn(store, 'get').mockImplementationOnce((id, callback) =>
    get(id, (error, value) => {
      callback(error, value);
      notify();
    }),
  );
  const logout = request(app)
    .post('/api/auth/logout')
    .set('Origin', origin)
    .set('Cookie', cookie)
    .then((response) => response);
  await loaded;
  release();
  expect((await renewal).status).toBe(200);
  expect((await logout).status).toBe(204);
  expect((await request(app).get('/api/auth/session').set('Cookie', cookie)).status).toBe(401);
});
