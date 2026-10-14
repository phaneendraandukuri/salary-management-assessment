import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import { createPool } from './database.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';
import { createSessionStore } from './session-store.js';
import { hashPassword } from './hr-credentials.js';
import { origin } from './test-support/auth.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || new URL(connectionString).pathname !== '/acme_test') {
  throw new Error('TEST_DATABASE_URL must point to the dedicated acme_test database');
}
const schema = `test_auth_${randomUUID().replaceAll('-', '')}`;
const isolatedUrl = new URL(connectionString);
isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
const password = randomBytes(24).toString('base64url');
const sessionSecret = randomBytes(32).toString('base64url');
let admin: Pool;
let pool: Pool;
let observer: Pool;
let schemaCreated = false;
let passwordHash: string;
const stores: ReturnType<typeof createSessionStore>[] = [];
afterEach(() => vi.restoreAllMocks());

beforeAll(async () => {
  admin = createPool(connectionString);
  await admin.query('SELECT 1');
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  pool = createPool(isolatedUrl.toString());
  observer = createPool(isolatedUrl.toString());
  await migrate(pool);
  passwordHash = await hashPassword(password);
});
beforeEach(async () => {
  await pool.query('DELETE FROM hr_sessions');
});
afterAll(async () => {
  try {
    for (const store of stores) await store.close();
  } finally {
    try {
      await Promise.all([pool?.end(), observer?.end()]);
    } finally {
      try {
        if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin?.end();
      }
    }
  }
});
function setup(database = pool, store = createSessionStore(database)) {
  stores.push(store);
  return createApp(undefined, undefined, {
    credentials: { username: 'hr', passwordHash, sessionSecret },
    store,
    origin,
  });
}
async function login(app = setup(), oldCookie?: string) {
  const pending = request(app).post('/api/auth/login').set('Origin', origin);
  if (oldCookie) pending.set('Cookie', oldCookie);
  const response = await pending.send({ username: 'hr', password });
  expect(response.status).toBe(200);
  const cookies: unknown = response.headers['set-cookie'];
  return Array.isArray(cookies) && typeof cookies[0] === 'string' ? cookies[0].split(';')[0]! : '';
}

it('persists sessions across separate application instances and stores no credentials', async () => {
  const cookie = await login();
  const response = await request(setup(observer)).get('/api/auth/session').set('Cookie', cookie);
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ user: { username: 'hr' } });
  const rows = (await observer.query('SELECT sess FROM hr_sessions')).rows;
  expect(rows.length).toBe(1);
  expect(Object.keys(rows[0].sess).sort()).toEqual([
    'cookie',
    'createdAt',
    'lastActivityAt',
    'username',
  ]);
});

async function activeSession() {
  const store = createSessionStore(pool);
  const app = setup(pool, store);
  const cookie = await login(app);
  const row = (await observer.query('SELECT sid, sess FROM hr_sessions')).rows[0];
  return {
    store,
    app,
    cookie,
    sid: row.sid as string,
    data: row.sess as import('express-session').SessionData,
  };
}
async function storedData() {
  return (await observer.query('SELECT sess FROM hr_sessions')).rows[0]?.sess as
    import('express-session').SessionData | undefined;
}
it('persists sliding activity, then rejects the exact idle boundary in PostgreSQL', async () => {
  const { app, cookie, sid, data } = await activeSession();
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  const createdAt = now - 60 * 60 * 1000;
  await observer.query('UPDATE hr_sessions SET sess=$1 WHERE sid=$2', [
    { ...data, createdAt, lastActivityAt: now - 30 * 60 * 1000 + 1 },
    sid,
  ]);
  expect((await request(app).get('/api/auth/session').set('Cookie', cookie)).status).toBe(200);
  expect((await storedData())?.createdAt).toBe(createdAt);
  expect((await storedData())?.lastActivityAt).toBe(now);
  clock.mockReturnValue(now + 30 * 60 * 1000);
  expect((await request(app).get('/api/auth/session').set('Cookie', cookie)).status).toBe(401);
});
it('enforces absolute expiry even when the database row remains unexpired', async () => {
  const { app, cookie, sid, data } = await activeSession();
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now);
  await observer.query('UPDATE hr_sessions SET sess=$1 WHERE sid=$2', [
    { ...data, createdAt: now - 8 * 60 * 60 * 1000, lastActivityAt: now - 1 },
    sid,
  ]);
  expect((await request(app).get('/api/auth/session').set('Cookie', cookie)).status).toBe(401);
});
it('sanitizes real PostgreSQL renewal failures without reporting an authenticated response', async () => {
  const { app, cookie, data } = await activeSession();
  await pool.query(
    "CREATE FUNCTION reject_auth_renewal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-only renewal failure'; END $$",
  );
  await pool.query(
    'CREATE TRIGGER reject_auth_renewal BEFORE UPDATE ON hr_sessions FOR EACH ROW EXECUTE FUNCTION reject_auth_renewal()',
  );
  try {
    const response = await request(app).get('/api/auth/session').set('Cookie', cookie);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'persistence_failed' } });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect((await storedData())?.lastActivityAt).toBe(data.lastActivityAt);
  } finally {
    await pool.query('DROP TRIGGER reject_auth_renewal ON hr_sessions');
    await pool.query('DROP FUNCTION reject_auth_renewal()');
  }
});
it('serializes concurrent PostgreSQL renewals without losing newer activity', async () => {
  const { store, app, cookie } = await activeSession();
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
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
    .get('/api/auth/session')
    .set('Cookie', cookie)
    .then((response) => response);
  await waiting;
  clock.mockReturnValue(now + 1000);
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
  const second = request(app)
    .get('/api/auth/session')
    .set('Cookie', cookie)
    .then((response) => response);
  await loaded;
  release();
  expect((await first).status).toBe(200);
  expect((await second).status).toBe(200);
  expect((await storedData())?.lastActivityAt).toBe(now + 1000);
});
it('never restores a PostgreSQL session when logout races renewal', async () => {
  const { store, app, cookie } = await activeSession();
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
    .get('/api/auth/session')
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
  expect(await storedData()).toBeUndefined();
});

it('rejects expired rows before they are physically pruned', async () => {
  const cookie = await login();
  await observer.query("UPDATE hr_sessions SET expire = now() - interval '1 minute'");
  const response = await request(setup()).get('/api/auth/session').set('Cookie', cookie);
  expect(response.status).toBe(401);
  expect(response.body).toEqual({ error: { code: 'authentication_required' } });
  expect(
    (await observer.query('SELECT count(*)::int AS count FROM hr_sessions')).rows[0].count,
  ).toBe(1);
});

it('invalidates the old ID when login regenerates a PostgreSQL session', async () => {
  const app = setup();
  const first = await login(app);
  const second = await login(app, first);
  expect(first === second).toBe(false);
  expect(
    (await request(setup(observer)).get('/api/auth/session').set('Cookie', first)).status,
  ).toBe(401);
  expect(
    (await request(setup(observer)).get('/api/auth/session').set('Cookie', second)).status,
  ).toBe(200);
  expect(
    (await observer.query('SELECT count(*)::int AS count FROM hr_sessions')).rows[0].count,
  ).toBe(1);
});

it('logout deletes the stored session and invalidates it across instances', async () => {
  const cookie = await login();
  expect(
    (
      await request(setup(observer))
        .post('/api/auth/logout')
        .set('Origin', origin)
        .set('Cookie', cookie)
    ).status,
  ).toBe(204);
  expect((await request(setup()).get('/api/auth/session').set('Cookie', cookie)).status).toBe(401);
  expect(
    (await observer.query('SELECT count(*)::int AS count FROM hr_sessions')).rows[0].count,
  ).toBe(0);
});

it('prunes only expired rows during a subsequent valid login', async () => {
  await login();
  await observer.query("UPDATE hr_sessions SET expire = now() - interval '1 minute'");
  const active = await login();
  const newest = await login();
  expect(
    (await observer.query('SELECT count(*)::int AS count FROM hr_sessions')).rows[0].count,
  ).toBe(2);
  const app = setup(observer);
  expect((await request(app).get('/api/auth/session').set('Cookie', active)).status).toBe(200);
  expect((await request(app).get('/api/auth/session').set('Cookie', newest)).status).toBe(200);
});

it('reapplying migrations preserves existing sessions', async () => {
  const cookie = await login();
  await migrate(pool);
  expect(
    (await request(setup(observer)).get('/api/auth/session').set('Cookie', cookie)).status,
  ).toBe(200);
});

it('fails closed with a sanitized response when the session table is unavailable', async () => {
  const brokenUrl = new URL(connectionString!);
  brokenUrl.searchParams.set('options', '-c search_path=missing_auth_schema');
  const broken = createPool(brokenUrl.toString());
  try {
    const response = await request(setup(broken))
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ username: 'hr', password });
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'persistence_failed' } });
    expect(response.headers['set-cookie']).toBeUndefined();
  } finally {
    await broken.end();
  }
});
