import type { Pool, PoolClient } from 'pg';
import type { Employee } from './employee.js';
import { validateSalary } from './salary.js';

export type UpdateSalaryResult =
  | { ok: true; employee: Employee }
  | {
      ok: false;
      error: {
        field: 'employeeId' | 'salaryAmount' | 'employee';
        code:
          | 'employee_not_found'
          | 'invalid_amount'
          | 'salary_unchanged'
          | 'amount_not_storable'
          | 'persistence_failed';
      };
    };

export async function updateSalary(
  pool: Pool,
  employeeId: string,
  amount: unknown,
): Promise<UpdateSalaryResult> {
  let client: PoolClient | undefined;
  let discardClient = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const found = await client.query<Employee>(
      `SELECT employee_id AS "employeeId", name, email, department, role, country,
        currency, salary_amount::text AS "salaryAmount" FROM employees WHERE employee_id = $1 FOR UPDATE`,
      [employeeId],
    );
    const employee = found.rows[0];
    if (!employee) {
      await client.query('ROLLBACK');
      return { ok: false, error: { field: 'employeeId', code: 'employee_not_found' } };
    }
    const salary = validateSalary(amount, employee.currency);
    if (!salary.ok) {
      await client.query('ROLLBACK');
      return { ok: false, error: { field: 'salaryAmount', code: 'invalid_amount' } };
    }
    const currentSalary = validateSalary(employee.salaryAmount, employee.currency);
    if (!currentSalary.ok) {
      await client.query('ROLLBACK');
      return { ok: false, error: { field: 'employee', code: 'persistence_failed' } };
    }
    if (salary.salary.amount === currentSalary.salary.amount) {
      await client.query('ROLLBACK');
      return { ok: false, error: { field: 'salaryAmount', code: 'salary_unchanged' } };
    }
    const updated = await client.query<Employee>(
      `UPDATE employees SET salary_amount = $2 WHERE employee_id = $1
       RETURNING employee_id AS "employeeId", name, email, department, role, country,
         currency, salary_amount::text AS "salaryAmount"`,
      [employeeId, salary.salary.amount],
    );
    await client.query(
      `INSERT INTO salary_history (employee_id, currency, old_amount, new_amount)
       VALUES ($1, $2, $3, $4)`,
      [employeeId, employee.currency, employee.salaryAmount, salary.salary.amount],
    );
    await client.query('COMMIT');
    return { ok: true, employee: updated.rows[0] };
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        discardClient = true;
        return { ok: false, error: { field: 'employee', code: 'persistence_failed' } };
      }
    }
    if (error instanceof Error && 'code' in error && error.code === '22003') {
      return { ok: false, error: { field: 'salaryAmount', code: 'amount_not_storable' } };
    }
    return { ok: false, error: { field: 'employee', code: 'persistence_failed' } };
  } finally {
    client?.release(discardClient);
  }
}
