import { useApiRequest } from './api-context';
import { useEffect, useState } from 'react';
import { getInsights } from './insights-api';
import type { InsightsCriteria, InsightsData } from './insights-api';
const defaults: InsightsCriteria = { country: '', department: '', groupBy: 'currency' };
type InsightsRequest = { criteria: InsightsCriteria; attempt: number };
type InsightsState =
  | { status: 'loading' }
  | { status: 'error'; request: InsightsRequest; version: number }
  | { status: 'loaded'; data: InsightsData; request: InsightsRequest; version: number };
export function CompensationInsights({ refreshVersion = 0 }: { refreshVersion?: number }) {
  const apiRequest = useApiRequest();
  const [request, setRequest] = useState<InsightsRequest>({ criteria: defaults, attempt: 0 });
  const [draft, setDraft] = useState(defaults);
  const [state, setState] = useState<InsightsState>({ status: 'loading' });
  const current =
    state.status === 'loading' || state.request !== request || state.version !== refreshVersion
      ? { status: 'loading' as const }
      : state;
  const data = current.status === 'loaded' ? current.data : null;
  useEffect(() => {
    const controller = new AbortController();
    void getInsights(request.criteria, controller.signal, apiRequest)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ status: 'loaded', data, request, version: refreshVersion });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ status: 'error', request, version: refreshVersion });
      });
    return () => controller.abort();
  }, [request, refreshVersion, apiRequest]);
  function apply(criteria: InsightsCriteria) {
    setRequest((current) => ({
      criteria: {
        ...criteria,
        country: criteria.country.trim(),
        department: criteria.department.trim(),
      },
      attempt: current.attempt + 1,
    }));
  }
  return (
    <section
      aria-label="Compensation insights"
      id="compensation-insights"
      className="insights-panel"
    >
      <h2>Compensation insights</h2>
      <p>
        Current annual base salaries, separated by currency. Average and median are rounded to two
        decimals; positive half-cent ties round up.
      </p>
      <form
        aria-label="Insights controls"
        onSubmit={(event) => {
          event.preventDefault();
          apply(draft);
        }}
      >
        <div className="directory-fields">
          <label>
            Insights country
            <input
              aria-describedby="insights-filter-guidance"
              value={draft.country}
              onChange={(event) => setDraft({ ...draft, country: event.target.value })}
            />
          </label>
          <label>
            Insights department
            <input
              aria-describedby="insights-filter-guidance"
              value={draft.department}
              onChange={(event) => setDraft({ ...draft, department: event.target.value })}
            />
          </label>
          <label>
            Insights grouping
            <select
              value={draft.groupBy}
              onChange={(event) =>
                setDraft({ ...draft, groupBy: event.target.value as InsightsCriteria['groupBy'] })
              }
            >
              <option value="currency">Currency</option>
              <option value="country">Country</option>
              <option value="department">Department</option>
            </select>
          </label>
        </div>
        <p id="insights-filter-guidance">
          Country and department require exact matches, including case. Edits take effect after
          Apply.
        </p>
        <div className="directory-control-actions">
          <button type="submit">Apply insights</button>
          <button
            type="button"
            onClick={() => {
              setDraft(defaults);
              apply(defaults);
            }}
          >
            Reset insights
          </button>
        </div>
      </form>
      <p>
        Applied insights: Country: {request.criteria.country || 'All'}; Department:{' '}
        {request.criteria.department || 'All'}; Group: {request.criteria.groupBy}.
      </p>
      {current.status === 'loading' && <p role="status">Loading compensation insights…</p>}
      {current.status === 'error' && (
        <div>
          <p role="alert">Unable to load compensation insights. Please try again.</p>
          <button
            onClick={() => setRequest((current) => ({ ...current, attempt: current.attempt + 1 }))}
          >
            Retry insights
          </button>
        </div>
      )}
      {data && (
        <p>
          {data.headcount} {data.headcount === 1 ? 'matching employee' : 'matching employees'}
        </p>
      )}
      {data && data.groups.length === 0 && <p>No employees match these criteria.</p>}
      {data && data.groups.length > 0 && (
        <div
          className="table-scroll"
          role="region"
          aria-label="Compensation statistics"
          tabIndex={0}
        >
          <table>
            <caption>
              Annual base salary statistics by {data.groupBy}, separated by currency
            </caption>
            <thead>
              <tr>
                {data.groupBy !== 'currency' && (
                  <th scope="col">{data.groupBy === 'country' ? 'Country' : 'Department'}</th>
                )}
                {['Currency', 'Headcount', 'Total', 'Average', 'Median', 'Minimum', 'Maximum'].map(
                  (label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.groups.map((row) => (
                <tr key={JSON.stringify([row.groupValue, row.currency])}>
                  {data.groupBy !== 'currency' && <td>{row.groupValue}</td>}
                  <td>{row.currency}</td>
                  <td>{row.headcount}</td>
                  {[row.total, row.average, row.median, row.minimum, row.maximum].map(
                    (amount, index) => (
                      <td className="salary" key={index}>
                        {amount}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
