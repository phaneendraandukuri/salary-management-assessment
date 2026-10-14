import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import * as credentials from './hr-credentials.js';
import { authOptions, origin, password } from './test-support/auth.js';
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('allows five attempts then rejects before parsing and password verification, and recovers after the window', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const verify = vi.spyOn(credentials, 'verifyPassword').mockResolvedValue(false);
  const app = createApp(undefined, undefined, await authOptions());
  for (let index = 0; index < 5; index++)
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .set('Origin', origin)
          .send({ username: 'hr', password })
      ).status,
    ).toBe(401);
  const rejected = await request(app)
    .post('/api/auth/login')
    .set('Origin', origin)
    .set('Content-Type', 'application/json')
    .send('{');
  expect(rejected.status).toBe(429);
  expect(rejected.body).toEqual({ error: { code: 'login_rate_limited' } });
  expect(Number(rejected.headers['retry-after'])).toBeGreaterThan(0);
  expect(verify).toHaveBeenCalledTimes(5);
  vi.setSystemTime(Date.now() + 15 * 60 * 1000 + 1);
  expect(
    (
      await request(app)
        .post('/api/auth/login')
        .set('Origin', origin)
        .send({ username: 'hr', password })
    ).status,
  ).toBe(401);
});
it('bounds total attempts across different proxy-resolved IP addresses', async () => {
  const verify = vi.spyOn(credentials, 'verifyPassword').mockResolvedValue(false);
  const app = createApp(undefined, undefined, {
    ...(await authOptions()),
    production: true,
    origin: 'https://acme.example.test',
  });
  for (let index = 1; index <= 60; index++)
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .set('Origin', 'https://acme.example.test')
          .set('X-Forwarded-Proto', 'https')
          .set('X-Forwarded-For', `203.0.113.${index}`)
          .send({ username: 'hr', password })
      ).status,
    ).toBe(401);
  const response = await request(app)
    .post('/api/auth/login')
    .set('Origin', 'https://acme.example.test')
    .set('X-Forwarded-Proto', 'https')
    .set('X-Forwarded-For', '203.0.113.100')
    .send({ username: 'hr', password });
  expect(response.status).toBe(429);
  expect(verify).toHaveBeenCalledTimes(60);
});
it('ignores spoofed forwarding addresses in development login limits', async () => {
  vi.spyOn(credentials, 'verifyPassword').mockResolvedValue(false);
  const app = createApp(undefined, undefined, await authOptions());
  for (let index = 1; index <= 5; index++)
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .set('Origin', origin)
          .set('X-Forwarded-For', `203.0.113.${index}`)
          .send({ username: 'hr', password })
      ).status,
    ).toBe(401);
  expect(
    (
      await request(app)
        .post('/api/auth/login')
        .set('Origin', origin)
        .set('X-Forwarded-For', '203.0.113.100')
        .send({ username: 'hr', password })
    ).status,
  ).toBe(429);
});
it('admits at most two verification jobs without queuing and releases slots on errors', async () => {
  const releases: ((value: boolean) => void)[] = [];
  let notify: () => void = () => {};
  const entered = new Promise<void>((resolve) => {
    notify = resolve;
  });
  let thirdStarted: () => void = () => {};
  const unexpected = new Promise<null>((resolve) => {
    thirdStarted = () => resolve(null);
  });
  const verify = vi.spyOn(credentials, 'verifyPassword').mockImplementation(
    () =>
      new Promise((resolve) => {
        releases.push(resolve);
        if (releases.length === 2) notify();
        if (releases.length === 3) thirdStarted();
      }),
  );
  const app = createApp(undefined, undefined, await authOptions());
  const login = () =>
    request(app).post('/api/auth/login').set('Origin', origin).send({ username: 'hr', password });
  const first = login().then((response) => response);
  const second = login().then((response) => response);
  await entered;
  const pendingThird = login().then((response) => response);
  const third = await Promise.race([pendingThird, unexpected]);
  for (const release of releases) release(false);
  await Promise.all([first, second, pendingThird]);
  expect(third?.status).toBe(503);
  expect(third?.body).toEqual({ error: { code: 'authentication_busy' } });
  expect(third?.headers['retry-after']).toBe('1');
  expect(verify).toHaveBeenCalledTimes(2);
  for (const release of releases) release(false);
  expect((await first).status).toBe(401);
  expect((await second).status).toBe(401);
  verify.mockRejectedValueOnce(new Error('private verification details'));
  const failed = await login();
  expect(failed.status).toBe(500);
  expect(failed.body).toEqual({ error: { code: 'persistence_failed' } });
  verify.mockResolvedValue(false);
  expect((await login()).status).toBe(401);
});
