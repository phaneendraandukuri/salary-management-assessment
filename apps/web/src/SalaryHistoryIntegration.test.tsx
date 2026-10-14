import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { App } from './App';

const employee = {
  employeeId: 'ACME-001',
  name: 'First Employee',
  email: 'a@example.test',
  department: 'Engineering',
  role: 'Developer',
  country: 'India',
  currency: 'USD',
  salaryAmount: '100.00',
};
const other = {
  ...employee,
  employeeId: 'ACME-002',
  name: 'Second Employee',
  currency: 'EUR',
  salaryAmount: '200.00',
};
const entry = {
  historyId: '9007199254740993',
  employeeId: employee.employeeId,
  currency: 'USD',
  oldAmount: '50.00',
  newAmount: '100.00',
  changedAt: '2026-10-14T12:00:00.000Z',
};
function employees() {
  return new Response(
    JSON.stringify({ employees: [employee, other], page: 1, pageSize: 25, total: 2 }),
    { status: 200 },
  );
}
function history(rows = [entry], total = rows.length, page = 1) {
  return new Response(JSON.stringify({ history: rows, total, page, pageSize: 25 }), {
    status: 200,
  });
}
function panel(id = employee.employeeId) {
  return within(screen.getByRole('region', { name: `Salary history for ${id}` }));
}

it('switches history employees and resets pagination on close/reopen without stale data', async () => {
  let resolve!: (response: Response) => void;
  const otherEntry = {
    ...entry,
    employeeId: other.employeeId,
    currency: other.currency,
    newAmount: '200.00',
  };
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url.startsWith('/api/employees?page=')) return Promise.resolve(employees());
    if (url.includes('ACME-002/salary-history')) return Promise.resolve(history([otherEntry]));
    if (url.includes('page=2'))
      return new Promise<Response>((done) => {
        resolve = done;
      });
    return Promise.resolve(history([entry], 26));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'View history for ACME-001' }));
  await panel().findByRole('table');
  await user.click(panel().getByRole('button', { name: 'Next' }));
  await user.click(screen.getByRole('button', { name: 'View history for ACME-002' }));
  await panel(other.employeeId).findByRole('cell', { name: '200.00' });
  const obsolete = fetchMock.mock.calls.find((call) => call[0].includes('page=2'));
  expect(obsolete?.[1].signal.aborted).toBe(true);
  await act(async () => {
    resolve(history([{ ...entry, newAmount: '999.99' }], 26, 2));
  });
  expect(panel(other.employeeId).queryByRole('cell', { name: '999.99' })).not.toBeInTheDocument();
  await user.click(panel(other.employeeId).getByRole('button', { name: 'Close history' }));
  expect(
    screen.queryByRole('region', { name: `Salary history for ${other.employeeId}` }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'View history for ACME-001' }));
  await panel().findByRole('table');
  expect(panel().getByText('Page 1')).toBeInTheDocument();
  expect(
    within(screen.getByRole('navigation', { name: 'Employee pagination' })).getByText('Page 1'),
  ).toBeInTheDocument();
});

it('closing and reopening pending history aborts the old request and ignores its response', async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(employees())
      .mockReturnValueOnce(
        new Promise<Response>((done) => {
          resolve = done;
        }),
      )
      .mockResolvedValueOnce(history()),
  );
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'View history for ACME-001' }));
  await user.click(panel().getByRole('button', { name: 'Close history' }));
  await user.click(screen.getByRole('button', { name: 'View history for ACME-001' }));
  await panel().findByRole('table');
  await act(async () => {
    resolve(history([{ ...entry, newAmount: '999.99' }]));
  });
  expect(panel().queryByRole('cell', { name: '999.99' })).not.toBeInTheDocument();
});

it.each([false, true])(
  'confirmed matching save reloads history from page 1; history failure=%s',
  async (historyFails) => {
    let saved = false;
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') {
        saved = true;
        return Promise.resolve(
          new Response(JSON.stringify({ employee: { ...employee, salaryAmount: '300.00' } }), {
            status: 200,
          }),
        );
      }
      if (url.startsWith('/api/employees?page=')) return Promise.resolve(employees());
      if (saved)
        return Promise.resolve(
          historyFails
            ? new Response('private SQL details', { status: 500 })
            : history([{ ...entry, oldAmount: '100.00', newAmount: '300.00' }], 27),
        );
      return Promise.resolve(history([entry], 26, url.includes('page=2') ? 2 : 1));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'View history for ACME-001' }));
    await panel().findByRole('table');
    await user.click(panel().getByRole('button', { name: 'Next' }));
    await panel().findByRole('table');
    expect(panel().getByText('Page 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit salary for ACME-001' }));
    const input = screen.getByRole('textbox', { name: 'New annual salary' });
    await user.clear(input);
    await user.type(input, '300.00');
    await user.click(screen.getByRole('button', { name: 'Save salary' }));
    expect(await screen.findByText('Salary updated for ACME-001: USD 300.00.')).toBeInTheDocument();
    if (historyFails) {
      expect(await panel().findByRole('alert')).toHaveTextContent('Unable to load salary history');
      expect(screen.getByText('Salary updated for ACME-001: USD 300.00.')).toBeInTheDocument();
    } else expect(await panel().findByRole('cell', { name: '300.00' })).toBeInTheDocument();
    expect(panel().getByText('Page 1')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls
        .filter((call) => call[0].includes('salary-history'))
        .map((call) => call[0]),
    ).toEqual(
      [1, 2, 1].map((page) => `/api/employees/ACME-001/salary-history?page=${page}&pageSize=25`),
    );
  },
);

it.each(['conflict', 'server', 'network'])(
  'does not refresh history after %s update failure',
  async (failure) => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === 'PATCH')
        return failure === 'network'
          ? Promise.reject(new Error('Network failure'))
          : Promise.resolve(
              new Response(
                JSON.stringify({
                  error: {
                    code: failure === 'conflict' ? 'salary_unchanged' : 'persistence_failed',
                    field: 'salaryAmount',
                  },
                }),
                { status: failure === 'conflict' ? 409 : 500 },
              ),
            );
      if (url.startsWith('/api/employees?page=')) return Promise.resolve(employees());
      return Promise.resolve(history([entry], 26, url.includes('page=2') ? 2 : 1));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'View history for ACME-001' }));
    await panel().findByRole('table');
    await user.click(panel().getByRole('button', { name: 'Next' }));
    await panel().findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Edit salary for ACME-001' }));
    await user.click(screen.getByRole('button', { name: 'Save salary' }));
    await screen.findByRole('alert');
    expect(panel().getByText('Page 2')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((call) => call[0].includes('salary-history'))).toHaveLength(
      2,
    );
  },
);

it('does not refresh another employee history when a save completes', async () => {
  let resolve!: (response: Response) => void;
  const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (options?.method === 'PATCH')
      return new Promise<Response>((done) => {
        resolve = done;
      });
    if (url.startsWith('/api/employees?page=')) return Promise.resolve(employees());
    return Promise.resolve(
      history([
        { ...entry, employeeId: other.employeeId, currency: other.currency, newAmount: '200.00' },
      ]),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Edit salary for ACME-001' }));
  await user.click(screen.getByRole('button', { name: 'Save salary' }));
  await user.click(screen.getByRole('button', { name: 'View history for ACME-002' }));
  await panel(other.employeeId).findByRole('table');
  await act(async () => {
    resolve(new Response(JSON.stringify({ employee }), { status: 200 }));
  });
  expect(screen.getByText('Salary updated for ACME-001: USD 100.00.')).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter((call) => call[0].includes('salary-history'))).toHaveLength(1);
  expect(panel(other.employeeId).getByRole('cell', { name: '200.00' })).toBeInTheDocument();
});
