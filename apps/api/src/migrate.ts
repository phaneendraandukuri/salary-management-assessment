import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

export async function migrate(pool: Pool): Promise<void> {
  const sql = await readFile(new URL('../migrations/001_employees.sql', import.meta.url), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
