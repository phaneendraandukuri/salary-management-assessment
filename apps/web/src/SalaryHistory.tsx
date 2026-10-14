import { useApiRequest } from './api-context';
import { useEffect, useState } from 'react';
import type { Employee, SalaryHistoryPage } from './employee-api';
import { getSalaryHistory } from './employee-api';

type HistoryState =
  | { status: 'loading' }
  | { status: 'loaded'; data: SalaryHistoryPage }
  | { status: 'error'; missing: boolean };

export function SalaryHistory({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const apiRequest = useApiRequest();
  const [state, setState] = useState<HistoryState>({ status: 'loading' });
  const [request, setRequest] = useState({ page: 1, attempt: 0 });
  const data = state.status === 'loaded' ? state.data : null;
  useEffect(() => {
    const controller = new AbortController();
    void getSalaryHistory(employee.employeeId, request.page, controller.signal, apiRequest).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (result.ok) setState({ status: 'loaded', data: result.data });
        else setState({ status: 'error', missing: result.error === 'employee_not_found' });
      },
    );
    return () => controller.abort();
  }, [employee.employeeId, request, apiRequest]);

  function loadPage(page: number) {
    setState({ status: 'loading' });
    setRequest((current) => ({ page, attempt: current.attempt + 1 }));
  }

  return (
    <section aria-label={`Salary history for ${employee.employeeId}`} className="history-panel">
      <h2>
        Salary history for {employee.name} ({employee.employeeId})
      </h2>
      <button onClick={onClose}>Close history</button>
      {state.status === 'loading' && <p role="status">Loading salary history…</p>}
      {state.status === 'error' && (
        <div>
          <p role="alert">
            {state.missing
              ? 'Employee was not found. Refresh the directory.'
              : 'Unable to load salary history. Please try again.'}
          </p>
          {!state.missing && <button onClick={() => loadPage(request.page)}>Retry history</button>}
        </div>
      )}
      {data && (
        <p>
          {data.total} {data.total === 1 ? 'salary change' : 'salary changes'}
        </p>
      )}
      {data && data.history.length === 0 && (
        <p>{data.total === 0 ? 'No salary changes yet.' : 'No salary changes on this page.'}</p>
      )}
      {data && data.history.length > 0 && (
        <div className="table-scroll" role="region" aria-label="Salary changes" tabIndex={0}>
          <table>
            <caption>Salary changes, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Old annual salary</th>
                <th scope="col">New annual salary</th>
                <th scope="col">Currency</th>
                <th scope="col">Changed at (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((entry) => (
                <tr key={entry.historyId}>
                  <td className="salary">{entry.oldAmount}</td>
                  <td className="salary">{entry.newAmount}</td>
                  <td>{entry.currency}</td>
                  <td>
                    <time dateTime={entry.changedAt}>{entry.changedAt}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label="Salary history pagination">
        <button
          disabled={state.status === 'loading' || request.page === 1}
          onClick={() => loadPage(request.page - 1)}
        >
          Previous
        </button>
        <span>Page {request.page}</span>
        <button
          disabled={!data || request.page * data.pageSize >= data.total}
          onClick={() => loadPage(request.page + 1)}
        >
          Next
        </button>
      </nav>
    </section>
  );
}
