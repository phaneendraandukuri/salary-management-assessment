import { useEffect, useState } from 'react';
import { getEmployeePage } from './employee-api';
import type { Employee, EmployeePage } from './employee-api';
import { EmployeeCreationForm } from './EmployeeCreationForm';
import { SalaryEditForm } from './SalaryEditForm';
import { SalaryHistory } from './SalaryHistory';
import './App.css';

const defaultCriteria = {
  search: '',
  country: '',
  department: '',
  currency: '',
  sortBy: 'employeeId',
  sortDirection: 'asc',
};
const sortFields = [
  ['employeeId', 'Employee ID'],
  ['name', 'Name'],
  ['department', 'Department'],
  ['role', 'Role'],
  ['country', 'Country'],
  ['currency', 'Currency'],
  ['salaryAmount', 'Annual salary'],
];

type DirectoryState =
  { status: 'loading' } | { status: 'error' } | { status: 'loaded'; data: EmployeePage };

export function App() {
  const [request, setRequest] = useState({ page: 1, criteria: defaultCriteria, attempt: 0 });
  const [draft, setDraft] = useState(defaultCriteria);
  const [state, setState] = useState<DirectoryState>({ status: 'loading' });
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [savingSalary, setSavingSalary] = useState(false);
  const [historySelection, setHistorySelection] = useState<{
    employee: Employee;
    revision: number;
  } | null>(null);
  const data = state.status === 'loaded' ? state.data : null;
  const hasFilters = Boolean(
    request.criteria.search ||
    request.criteria.country ||
    request.criteria.department ||
    request.criteria.currency,
  );
  useEffect(() => {
    const controller = new AbortController();
    void getEmployeePage(request.page, controller.signal, request.criteria)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'loaded', data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [request]);

  function loadPage(page: number) {
    setState({ status: 'loading' });
    setRequest((current) => ({ ...current, page, attempt: current.attempt + 1 }));
  }

  function refreshDirectory() {
    setState({ status: 'loading' });
    setRequest((current) => ({ ...current, attempt: current.attempt + 1 }));
  }

  function applyCriteria(criteria: typeof defaultCriteria) {
    const normalized = {
      ...criteria,
      search: criteria.search.trim(),
      country: criteria.country.trim(),
      department: criteria.department.trim(),
      currency: criteria.currency.trim(),
    };
    setState({ status: 'loading' });
    setRequest((current) => ({ page: 1, criteria: normalized, attempt: current.attempt + 1 }));
  }

  function salarySaved(employeeId: string) {
    refreshDirectory();
    setHistorySelection((current) =>
      current?.employee.employeeId === employeeId
        ? { ...current, revision: current.revision + 1 }
        : current,
    );
  }

  return (
    <main className="directory">
      <header className="page-header">
        <p className="eyebrow">ACME · Human Resources</p>
        <h1>ACME Salary Management</h1>
        <p className="subtitle">
          Current annual base salaries, in each employee’s original currency.
        </p>
      </header>
      <EmployeeCreationForm onCreated={refreshDirectory} />
      {editingEmployee && (
        <SalaryEditForm
          key={editingEmployee.employeeId}
          employee={editingEmployee}
          onSaved={() => salarySaved(editingEmployee.employeeId)}
          onCancel={() => setEditingEmployee(null)}
          onSavingChange={setSavingSalary}
        />
      )}
      {historySelection && (
        <SalaryHistory
          key={`${historySelection.employee.employeeId}:${historySelection.revision}`}
          employee={historySelection.employee}
          onClose={() => setHistorySelection(null)}
        />
      )}
      <section className="directory-card" aria-labelledby="directory-heading">
        <div className="directory-heading">
          <h2 id="directory-heading">Employee directory</h2>
          {data && (
            <p className="count">
              {data.total} {data.total === 1 ? 'employee' : 'employees'}
            </p>
          )}
        </div>
        <form
          aria-label="Directory controls"
          className="directory-controls"
          onSubmit={(event) => {
            event.preventDefault();
            applyCriteria(draft);
          }}
        >
          <div className="directory-fields">
            <label>
              Name or email
              <input
                type="text"
                value={draft.search}
                onChange={(event) => setDraft({ ...draft, search: event.target.value })}
              />
            </label>
            <label>
              Filter country
              <input
                aria-describedby="directory-exact-guidance"
                value={draft.country}
                onChange={(event) => setDraft({ ...draft, country: event.target.value })}
              />
            </label>
            <label>
              Filter department
              <input
                aria-describedby="directory-exact-guidance"
                value={draft.department}
                onChange={(event) => setDraft({ ...draft, department: event.target.value })}
              />
            </label>
            <label>
              Filter currency
              <select
                value={draft.currency}
                onChange={(event) => setDraft({ ...draft, currency: event.target.value })}
              >
                <option value="">All currencies</option>
                {['INR', 'USD', 'EUR', 'GBP'].map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </label>
            <label>
              Sort field
              <select
                value={draft.sortBy}
                onChange={(event) => setDraft({ ...draft, sortBy: event.target.value })}
              >
                {sortFields.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort direction
              <select
                value={draft.sortDirection}
                onChange={(event) => setDraft({ ...draft, sortDirection: event.target.value })}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
          </div>
          <p id="directory-exact-guidance">
            Exact match for country and department, including case. Edits take effect after Apply.
          </p>
          <div className="directory-control-actions">
            <button type="submit">Apply</button>
            <button
              type="button"
              onClick={() => {
                setDraft(defaultCriteria);
                applyCriteria(defaultCriteria);
              }}
            >
              Reset
            </button>
          </div>
        </form>
        <p className="applied-query">
          Applied query:{' '}
          {[
            request.criteria.search && `Search: ${request.criteria.search}`,
            request.criteria.country && `Country: ${request.criteria.country}`,
            request.criteria.department && `Department: ${request.criteria.department}`,
            request.criteria.currency && `Currency: ${request.criteria.currency}`,
          ]
            .filter(Boolean)
            .join('; ') || 'All employees'}
          ; Sort: {sortFields.find(([value]) => value === request.criteria.sortBy)?.[1]}{' '}
          {request.criteria.sortDirection === 'desc' ? 'descending' : 'ascending'}.
        </p>
        {request.criteria.sortBy === 'salaryAmount' && (
          <p className="salary-sort-guidance">
            Salary sorting compares nominal amounts in their original currencies, without
            conversion. Filter by currency for same-currency comparisons.
          </p>
        )}
        {state.status === 'loading' && (
          <p className="notice" role="status">
            Loading employees…
          </p>
        )}
        {state.status === 'error' && (
          <div className="notice error">
            <p role="alert">Unable to load employees. Please try again.</p>
            <button onClick={() => loadPage(request.page)}>Retry</button>
          </div>
        )}
        {data && data.employees.length === 0 && (
          <p className="notice">
            {data.total === 0
              ? hasFilters
                ? 'No employees match these criteria.'
                : 'No employees yet.'
              : 'No employees on this page.'}
          </p>
        )}
        {data && data.employees.length > 0 && (
          <div
            className="table-scroll"
            role="region"
            aria-label="Employee salary records"
            tabIndex={0}
          >
            <table>
              <caption>Current annual base salaries</caption>
              <thead>
                <tr>
                  <th scope="col">Employee ID</th>
                  <th scope="col">Name</th>
                  <th scope="col">Department</th>
                  <th scope="col">Role</th>
                  <th scope="col">Country</th>
                  <th scope="col">Currency</th>
                  <th scope="col" className="salary">
                    Annual base salary
                  </th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.employees.map((employee) => (
                  <tr key={employee.employeeId}>
                    <td className="employee-id">{employee.employeeId}</td>
                    <td>{employee.name}</td>
                    <td>{employee.department}</td>
                    <td>{employee.role}</td>
                    <td>{employee.country}</td>
                    <td>{employee.currency}</td>
                    <td className="salary">{employee.salaryAmount}</td>
                    <td>
                      <div className="employee-actions">
                        <button
                          disabled={savingSalary}
                          aria-label={`Edit salary for ${employee.employeeId}`}
                          onClick={() => setEditingEmployee(employee)}
                        >
                          Edit salary
                        </button>
                        <button
                          aria-label={`View history for ${employee.employeeId}`}
                          onClick={() => setHistorySelection({ employee, revision: 0 })}
                        >
                          View history
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <nav aria-label="Employee pagination">
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
    </main>
  );
}
