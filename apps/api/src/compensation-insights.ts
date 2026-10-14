import type { Pool } from 'pg';
import type { SalaryCurrency } from './salary.js';
import type { InsightsQuery } from './insights-query.js';

export type CompensationGroup = {
  currency: SalaryCurrency;
  groupValue: string | null;
  headcount: number;
  total: string;
  average: string;
  median: string;
  minimum: string;
  maximum: string;
};
export type CompensationInsights = {
  groupBy: InsightsQuery['groupBy'];
  headcount: number;
  groups: CompensationGroup[];
};
export async function compensationInsights(
  pool: Pool,
  query: InsightsQuery,
): Promise<CompensationInsights> {
  const grouping = { currency: 'NULL::text', country: 'country', department: 'department' }[
    query.groupBy
  ];
  const values: string[] = [];
  const conditions: string[] = [];
  for (const field of ['country', 'department'] as const) {
    if (query[field] !== undefined) {
      values.push(query[field]);
      conditions.push(`${field} = $${values.length}`);
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query<Omit<CompensationGroup, 'headcount'> & { headcount: string }>(
    `WITH filtered AS (
      SELECT employee_id, currency, salary_amount, ${grouping} AS group_value
      FROM employees ${where}
    ), ranked AS (
      SELECT currency, group_value, salary_amount,
        row_number() OVER (PARTITION BY group_value, currency ORDER BY salary_amount, employee_id) AS position,
        count(*) OVER (PARTITION BY group_value, currency) AS group_count
      FROM filtered
    ) SELECT currency, group_value AS "groupValue", count(*)::text AS headcount,
      round(sum(salary_amount), 2)::text AS total,
      round(avg(salary_amount), 2)::text AS average,
      round(avg(salary_amount) FILTER (WHERE position IN ((group_count + 1) / 2, (group_count + 2) / 2)), 2)::text AS median,
      round(min(salary_amount), 2)::text AS minimum,
      round(max(salary_amount), 2)::text AS maximum
     FROM ranked GROUP BY group_value, currency
     ORDER BY group_value COLLATE "C" ASC NULLS FIRST, currency COLLATE "C" ASC`,
    values,
  );
  const groups = result.rows.map((row) => ({ ...row, headcount: Number(row.headcount) }));
  return {
    groupBy: query.groupBy,
    headcount: groups.reduce((sum, row) => sum + row.headcount, 0),
    groups,
  };
}
