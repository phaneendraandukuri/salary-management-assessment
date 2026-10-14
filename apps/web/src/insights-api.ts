export type InsightsCriteria = {
  country: string;
  department: string;
  groupBy: 'currency' | 'country' | 'department';
};
export type InsightsGroup = {
  currency: string;
  groupValue: string | null;
  headcount: number;
  total: string;
  average: string;
  median: string;
  minimum: string;
  maximum: string;
};
export type InsightsData = {
  groupBy: InsightsCriteria['groupBy'];
  headcount: number;
  groups: InsightsGroup[];
};
export async function getInsights(
  criteria: InsightsCriteria,
  signal: AbortSignal,
  apiRequest: typeof fetch = fetch,
): Promise<InsightsData> {
  const params = new URLSearchParams({ groupBy: criteria.groupBy });
  for (const field of ['country', 'department'] as const)
    if (criteria[field].trim()) params.set(field, criteria[field].trim());
  const response = await apiRequest(`/api/compensation-insights?${params}`, { signal });
  if (!response.ok) throw new Error('Insights request failed');
  const data = (await response.json()) as InsightsData;
  if (
    !data ||
    data.groupBy !== criteria.groupBy ||
    !Number.isSafeInteger(data.headcount) ||
    data.headcount < 0 ||
    !Array.isArray(data.groups)
  )
    throw new Error('Invalid insights response');
  const keys = new Set<string>();
  for (const row of data.groups) {
    if (
      !row ||
      typeof row !== 'object' ||
      !['INR', 'USD', 'EUR', 'GBP'].includes(row.currency) ||
      !Number.isSafeInteger(row.headcount) ||
      row.headcount < 1 ||
      (data.groupBy === 'currency'
        ? row.groupValue !== null
        : typeof row.groupValue !== 'string' || !row.groupValue) ||
      ![row.total, row.average, row.median, row.minimum, row.maximum].every(
        (value) => typeof value === 'string' && /^[0-9]+\.[0-9]{2}$/.test(value),
      )
    )
      throw new Error('Invalid insights group');
    const key = JSON.stringify([row.groupValue, row.currency]);
    if (keys.has(key)) throw new Error('Duplicate insights group');
    keys.add(key);
  }
  if (data.groups.reduce((sum, row) => sum + row.headcount, 0) !== data.headcount)
    throw new Error('Invalid insights headcount');
  return data;
}
