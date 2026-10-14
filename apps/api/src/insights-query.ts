export type InsightsQuery = {
  country?: string;
  department?: string;
  groupBy: 'currency' | 'country' | 'department';
};
type InsightsQueryResult =
  | { ok: true; query: InsightsQuery }
  | { ok: false; error: { field: keyof InsightsQuery; code: 'invalid_query' } };
export function parseInsightsQuery(input: Record<string, unknown>): InsightsQueryResult {
  const groupBy = input.groupBy === undefined ? 'currency' : input.groupBy;
  if (groupBy !== 'currency' && groupBy !== 'country' && groupBy !== 'department')
    return { ok: false, error: { field: 'groupBy', code: 'invalid_query' } };
  const query: InsightsQuery = { groupBy };
  for (const field of ['country', 'department'] as const) {
    const value = input[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') return { ok: false, error: { field, code: 'invalid_query' } };
    if (value.trim()) query[field] = value.trim();
  }
  return { ok: true, query };
}
