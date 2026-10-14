import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

export async function migrate(pool: Pool): Promise<void> {
  const files = ['001_employees.sql', '002_salary_history.sql', '003_hr_sessions.sql'];
  const statements = await Promise.all(
    files.map((file) => readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')),
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const sql of statements) await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
