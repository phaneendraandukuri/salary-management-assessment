import type { Pool } from 'pg';
import { generateSeedEmployees } from './seed-employees.js';

export async function seedEmployees(pool: Pool): Promise<{ inserted: number; skipped: number }> {
  const employees = generateSeedEmployees();
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    let inserted = 0;
    for (let offset = 0; offset < employees.length; offset += 500) {
      const batch = employees.slice(offset, offset + 500);
      const values = batch.flatMap((row) => [
        row.employeeId,
        row.name,
        row.email,
        row.department,
        row.role,
        row.country,
        row.currency,
        row.salaryAmount,
      ]);
      const placeholders = batch
        .map(
          (_, index) =>
            `(${Array.from({ length: 8 }, (_, field) => `$${index * 8 + field + 1}`).join(', ')})`,
        )
        .join(', ');
      const result = await client.query(
        `INSERT INTO employees (employee_id, name, email, department, role, country, currency, salary_amount) VALUES ${placeholders} ON CONFLICT (employee_id) DO NOTHING`,
        values,
      );
      inserted += result.rowCount ?? 0;
    }
    await client.query('COMMIT');
    return { inserted, skipped: employees.length - inserted };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
