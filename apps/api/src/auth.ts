import { Router, json } from 'express';
import session from 'express-session';
import { verifyPassword, type HrCredentials } from './hr-credentials.js';
import { withSessionLock } from './session-lock.js';
import { authOrigin } from './auth-config.js';
import { rateLimit } from 'express-rate-limit';

declare module 'express-session' {
  interface SessionData {
    username?: string;
    createdAt?: number;
    lastActivityAt?: number;
  }
}

export type AuthOptions = {
  credentials: HrCredentials;
  store: session.Store & { pruneSessions?: (callback: (error?: Error | null) => void) => void };
  production?: boolean;
  origin: string;
};

function sessionOperation(operation: (callback: (error?: unknown) => void) => void): Promise<void> {
  return new Promise((resolve, reject) =>
    operation((error) => (error ? reject(error) : resolve())),
  );
}

export function authRouter({ credentials, store, origin, production = false }: AuthOptions) {
  authOrigin({ APP_ORIGIN: origin, NODE_ENV: production ? 'production' : 'development' });
  const router = Router();
  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: production, path: '/' };
  let verifying = 0;
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use((request, response, next) => {
    if (production && !request.secure) {
      response.status(403).json({ error: { code: 'https_required' } });
    } else if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.get('Origin') !== origin
    ) {
      response.status(403).json({ error: { code: 'invalid_origin' } });
    } else next();
  });
  const limits = {
    windowMs: 15 * 60 * 1000,
    standardHeaders: 'draft-8' as const,
    legacyHeaders: false,
    message: { error: { code: 'login_rate_limited' } },
  };
  router.post(
    '/auth/login',
    rateLimit({ ...limits, limit: 60, keyGenerator: () => 'hr-login-global' }),
    rateLimit({ ...limits, limit: 5, validate: { xForwardedForHeader: production } }),
  );
  router.use('/auth', json({ limit: '4kb' }));
  router.use(
    session({
      name: 'acme_session',
      secret: credentials.sessionSecret,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { ...cookieOptions, maxAge: 30 * 60 * 1000 },
    }),
  );
  router.use(
    ['/auth/session', '/employees', '/compensation-insights'],
    async (request, response, next) => {
      if (request.session.username !== credentials.username) {
        response.status(401).json({ error: { code: 'authentication_required' } });
        return;
      }
      const allowed = await withSessionLock(request.sessionID, async () => {
        try {
          await sessionOperation((callback) => request.session.reload(callback));
        } catch (error) {
          // express-session uses this fixed error when another request removed the row.
          if (error instanceof Error && error.message === 'failed to load session') {
            delete (request as { session?: session.Session }).session;
            response.clearCookie('acme_session', cookieOptions);
            response.status(401).json({ error: { code: 'authentication_required' } });
            return false;
          }
          delete (request as { session?: session.Session }).session;
          throw error;
        }
        const now = Date.now();
        const { createdAt, lastActivityAt } = request.session;
        if (
          !Number.isSafeInteger(createdAt) ||
          !Number.isSafeInteger(lastActivityAt) ||
          createdAt === undefined ||
          lastActivityAt === undefined ||
          createdAt < 0 ||
          createdAt > lastActivityAt ||
          lastActivityAt > now ||
          now - lastActivityAt >= 30 * 60 * 1000 ||
          now - createdAt >= 8 * 60 * 60 * 1000
        ) {
          await sessionOperation((callback) => request.session.destroy(callback)).catch(() => {});
          response.clearCookie('acme_session', cookieOptions);
          response.status(401).json({ error: { code: 'authentication_required' } });
          return false;
        }
        request.session.lastActivityAt = now;
        request.session.cookie.maxAge = Math.min(
          30 * 60 * 1000,
          createdAt + 8 * 60 * 60 * 1000 - now,
        );
        try {
          await sessionOperation((callback) => request.session.save(callback));
        } catch (error) {
          delete (request as { session?: session.Session }).session;
          next(error);
          return false;
        }
        return true;
      });
      if (allowed) next();
    },
  );
  router.post('/auth/login', async (request, response, next) => {
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
    if (verifying >= 2) {
      response
        .set('Retry-After', '1')
        .status(503)
        .json({ error: { code: 'authentication_busy' } });
      return;
    }
    let verified: boolean;
    verifying++;
    try {
      verified = await verifyPassword(body.password, credentials.passwordHash);
    } finally {
      verifying--;
    }
    if (!verified || body.username !== credentials.username) {
      response.status(401).json({ error: { code: 'invalid_credentials' } });
      return;
    }
    await withSessionLock(request.sessionID, async () => {
      try {
        await sessionOperation((callback) => request.session.regenerate(callback));
        request.session.username = credentials.username;
        request.session.createdAt = Date.now();
        request.session.lastActivityAt = request.session.createdAt;
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
  });
  router.get('/auth/session', (request, response) => {
    if (request.session.username !== credentials.username) {
      response.status(401).json({ error: { code: 'authentication_required' } });
    } else response.json({ user: { username: credentials.username } });
  });
  router.post('/auth/logout', async (request, response) => {
    await withSessionLock(request.sessionID, async () => {
      await sessionOperation((callback) => request.session.destroy(callback));
      response.clearCookie('acme_session', cookieOptions);
      response.sendStatus(204);
    });
  });
  return router;
}
