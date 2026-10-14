import type { Pool } from 'pg';
import type { Employee } from './employee.js';
import type { Pagination } from './pagination.js';

export type EmployeePage = Pagination & { employees: Employee[]; total: number };

export async function listEmployees(pool: Pool, pagination: Pagination): Promise<EmployeePage> {
  const count = await pool.query<{ total: string }>('SELECT count(*)::text AS total FROM employees');
  const result = await pool.query<Employee>(
    `SELECT employee_id AS "employeeId", name, email, department, role, country,
       currency, salary_amount::text AS "salaryAmount"
     FROM employees ORDER BY employee_id ASC LIMIT $1 OFFSET $2`,
    [pagination.pageSize, (pagination.page - 1) * pagination.pageSize],
  );
  return { ...pagination, employees: result.rows, total: Number(count.rows[0].total) };
}
