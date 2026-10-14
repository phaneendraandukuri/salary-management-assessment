import type { Pool } from 'pg';
import type { Employee, EmployeeValidationResult } from './employee.js';
import { validateEmployee } from './employee.js';

export type CreateEmployeeResult =
  | EmployeeValidationResult
  | {
      ok: false;
      error: {
        field: 'employeeId' | 'salaryAmount' | 'employee';
        code: 'duplicate_employee_id' | 'amount_not_storable' | 'persistence_failed';
      };
    };

export async function createEmployee(pool: Pool, input: unknown): Promise<CreateEmployeeResult> {
  const validation = validateEmployee(input);
  if (!validation.ok) return validation;
  const employee = validation.employee;

  try {
    const result = await pool.query<Employee>(
      `INSERT INTO employees
        (employee_id, name, email, department, role, country, currency, salary_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING employee_id AS "employeeId", name, email, department, role, country,
         currency, salary_amount::text AS "salaryAmount"`,
      [
        employee.employeeId,
        employee.name,
        employee.email,
        employee.department,
        employee.role,
        employee.country,
        employee.currency,
        employee.salaryAmount,
      ],
    );
    return { ok: true, employee: result.rows[0] };
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === '23505' &&
      'constraint' in error &&
      error.constraint === 'employees_pkey'
    ) {
      return { ok: false, error: { field: 'employeeId', code: 'duplicate_employee_id' } };
    }
    if (error instanceof Error && 'code' in error && error.code === '22003') {
      return { ok: false, error: { field: 'salaryAmount', code: 'amount_not_storable' } };
    }
    return { ok: false, error: { field: 'employee', code: 'persistence_failed' } };
  }
}
