import { Router, json } from 'express';
import session from 'express-session';
import { verifyPassword, type HrCredentials } from './hr-credentials.js';

declare module 'express-session' {
  interface SessionData {
    username?: string;
  }
}

export type AuthOptions = {
  credentials: HrCredentials;
  store: session.Store & { pruneSessions?: (callback: (error?: Error | null) => void) => void };
  production?: boolean;
};

function sessionOperation(operation: (callback: (error?: unknown) => void) => void): Promise<void> {
  return new Promise((resolve, reject) =>
    operation((error) => (error ? reject(error) : resolve())),
  );
}

export function authRouter({ credentials, store, production = false }: AuthOptions) {
  const router = Router();
  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: production, path: '/' };
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(json({ limit: '4kb' }));
  router.use(
    session({
      name: 'acme_session',
      secret: credentials.sessionSecret,
      store,
      resave: false,
      saveUninitialized: false,
      cookie: { ...cookieOptions, maxAge: 30 * 60 * 1000 },
    }),
  );
  router.post('/login', async (request, response, next) => {
    const body: unknown = request.body;
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      !('username' in body) ||
      typeof body.username !== 'string' ||
      body.username.length === 0 ||
      body.username.length > 100 ||
      !('password' in body) ||
      typeof body.password !== 'string' ||
      Buffer.byteLength(body.password) === 0 ||
      Buffer.byteLength(body.password) > 1024
    ) {
      response.status(400).json({ error: { code: 'invalid_credentials_input' } });
      return;
    }
    const verified = await verifyPassword(body.password, credentials.passwordHash);
    if (!verified || body.username !== credentials.username) {
      response.status(401).json({ error: { code: 'invalid_credentials' } });
      return;
    }
    try {
      await sessionOperation((callback) => request.session.regenerate(callback));
      request.session.username = credentials.username;
      await sessionOperation((callback) => request.session.save(callback));
    } catch (error) {
      // Unset the failed session so Express cannot retry saving authentication on response end.
      if (request.session) request.session.destroy(() => next(error));
      else next(error);
      return;
    }
    if (store.pruneSessions) {
      // Cleanup is housekeeping; failure must not invalidate an already persisted login.
      await sessionOperation((callback) => store.pruneSessions!(callback)).catch(() => {});
    }
    response.json({ user: { username: credentials.username } });
  });
  router.get('/session', (request, response) => {
    if (request.session.username !== credentials.username) {
      response.status(401).json({ error: { code: 'authentication_required' } });
    } else response.json({ user: { username: credentials.username } });
  });
  router.post('/logout', async (request, response) => {
    await sessionOperation((callback) => request.session.destroy(callback));
    response.clearCookie('acme_session', cookieOptions);
    response.sendStatus(204);
  });
  return router;
}
