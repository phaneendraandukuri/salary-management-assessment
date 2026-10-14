import { useEffect, useState } from 'react';
import { getEmployeePage } from './employee-api';
import type { EmployeePage } from './employee-api';
import { EmployeeCreationForm } from './EmployeeCreationForm';
import './App.css';

type DirectoryState =
  { status: 'loading' } | { status: 'error' } | { status: 'loaded'; data: EmployeePage };

export function App() {
  const [request, setRequest] = useState({ page: 1, attempt: 0 });
  const [state, setState] = useState<DirectoryState>({ status: 'loading' });
  const data = state.status === 'loaded' ? state.data : null;
  useEffect(() => {
    const controller = new AbortController();
    void getEmployeePage(request.page, controller.signal)
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
    setRequest({ page, attempt: request.attempt + 1 });
  }

  function refreshDirectory() {
    setState({ status: 'loading' });
    setRequest((current) => ({ ...current, attempt: current.attempt + 1 }));
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
      <section className="directory-card" aria-labelledby="directory-heading">
        <div className="directory-heading">
          <h2 id="directory-heading">Employee directory</h2>
          {data && (
            <p className="count">
              {data.total} {data.total === 1 ? 'employee' : 'employees'}
            </p>
          )}
        </div>
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
            {data.total === 0 ? 'No employees yet.' : 'No employees on this page.'}
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
                  <th scope="col">Annual base salary</th>
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
