import type { Pool } from 'pg';
import type { Employee } from './employee.js';
import type { Pagination } from './pagination.js';
import type { DirectoryCriteria } from './directory-query.js';
import { directorySortColumns } from './directory-query.js';

export type EmployeePage = Pagination & { employees: Employee[]; total: number };

export async function listEmployees(
  pool: Pool,
  query: Pagination & DirectoryCriteria,
): Promise<EmployeePage> {
  const values: string[] = [];
  const conditions: string[] = [];
  if (query.search) {
    values.push(`%${query.search.replace(/[!%_]/g, '!$&')}%`);
    conditions.push(
      `(name ILIKE $${values.length} ESCAPE '!' OR email ILIKE $${values.length} ESCAPE '!')`,
    );
  }
  for (const field of ['country', 'department', 'currency'] as const) {
    const value = query[field];
    if (value !== undefined) {
      values.push(value);
      conditions.push(`${field} = $${values.length}`);
    }
  }
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const sortColumn = directorySortColumns[query.sortBy ?? 'employeeId'];
  const direction = query.sortDirection === 'desc' ? 'DESC' : 'ASC';
  const order = `${sortColumn} ${direction}, employee_id ASC`;
  const count = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM employees${where}`,
    values,
  );
  const result = await pool.query<Employee>(
    `SELECT employee_id AS "employeeId", name, email, department, role, country,
       currency, salary_amount::text AS "salaryAmount"
     FROM employees${where} ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    page: query.page,
    pageSize: query.pageSize,
    employees: result.rows,
    total: Number(count.rows[0].total),
  };
}
