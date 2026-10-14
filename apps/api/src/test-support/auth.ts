import { randomBytes } from 'node:crypto';
import session from 'express-session';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp, type EmployeeOperations } from '../app.js';
import { hashPassword } from '../hr-credentials.js';
import { createSessionStore } from '../session-store.js';

export const origin = 'http://127.0.0.1:5173';
export const password = randomBytes(24).toString('base64url');
const sessionSecret = randomBytes(32).toString('base64url');
const hashed = hashPassword(password);
export async function authOptions(store: session.Store = new session.MemoryStore()) {
  return {
    credentials: { username: 'hr', passwordHash: await hashed, sessionSecret },
    store,
    origin,
  };
}
export async function authenticatedRequest(
  operations: EmployeeOperations,
  pool?: Pool,
  frontend?: string,
) {
  const app = createApp(
    operations,
    frontend,
    await authOptions(pool ? createSessionStore(pool) : undefined),
  );
  const agent = request.agent(app).set('Origin', origin);
  const response = await agent.post('/api/auth/login').send({ username: 'hr', password });
  if (response.status !== 200) throw new Error('Test authentication failed');
  return agent;
}
