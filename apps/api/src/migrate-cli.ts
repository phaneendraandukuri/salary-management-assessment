import { createPool } from './database.js';
import { migrate } from './migrate.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for migration');
}

const pool = createPool(connectionString);
try {
  await migrate(pool);
  console.log('Migration 001_employees applied');
} catch {
  console.error('Migration failed; check the database connection and schema');
  process.exitCode = 1;
} finally {
  await pool.end();
}
