import type { Pool } from 'pg';
import type { Pagination } from './pagination.js';
import type { SalaryCurrency } from './salary.js';

export type SalaryHistoryEntry = {
  historyId: string;
  employeeId: string;
  currency: SalaryCurrency;
  oldAmount: string;
  newAmount: string;
  changedAt: string;
};

export type SalaryHistoryPage = Pagination & { history: SalaryHistoryEntry[]; total: number };
export type SalaryHistoryResult =
  | { ok: true; historyPage: SalaryHistoryPage }
  | { ok: false; error: { field: 'employeeId'; code: 'employee_not_found' } };

export async function listSalaryHistory(
  pool: Pool,
  employeeId: string,
  pagination: Pagination,
): Promise<SalaryHistoryResult> {
  const employee = await pool.query('SELECT employee_id FROM employees WHERE employee_id = $1', [
    employeeId,
  ]);
  if (employee.rows.length === 0) {
    return { ok: false, error: { field: 'employeeId', code: 'employee_not_found' } };
  }
  const count = await pool.query<{ total: string }>(
    'SELECT count(*)::text AS total FROM salary_history WHERE employee_id = $1',
    [employeeId],
  );
  const rows = await pool.query<Omit<SalaryHistoryEntry, 'changedAt'> & { changedAt: Date }>(
    `SELECT history_id::text AS "historyId", employee_id AS "employeeId", currency,
       old_amount::text AS "oldAmount", new_amount::text AS "newAmount", changed_at AS "changedAt"
     FROM salary_history WHERE employee_id = $1
     ORDER BY changed_at DESC, history_id DESC LIMIT $2 OFFSET $3`,
    [employeeId, pagination.pageSize, (pagination.page - 1) * pagination.pageSize],
  );
  return {
    ok: true,
    historyPage: {
      ...pagination,
      total: Number(count.rows[0].total),
      history: rows.rows.map((row) => ({ ...row, changedAt: row.changedAt.toISOString() })),
    },
  };
}
