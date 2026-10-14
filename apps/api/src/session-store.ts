import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import type { Pool } from 'pg';

const PgStore = connectPgSimple(session);

export function createSessionStore(pool: Pool) {
  return new PgStore({
    pool,
    tableName: 'hr_sessions',
    createTableIfMissing: false,
    pruneSessionInterval: false,
    disableTouch: true,
  });
}
