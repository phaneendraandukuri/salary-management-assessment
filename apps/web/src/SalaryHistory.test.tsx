import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { expect, it, vi } from 'vitest';
import { SalaryHistory } from './SalaryHistory';

const employee = {
  employeeId: 'ACME/A 001',
  name: 'Synthetic Employee',
  email: 'a@example.test',
  department: 'Engineering',
  role: 'Developer',
  country: 'India',
  currency: 'USD',
  salaryAmount: '100.00',
};
const entry = {
  historyId: '9007199254740993',
  employeeId: employee.employeeId,
  currency: 'USD',
  oldAmount: '9007199254740993.01',
  newAmount: '12345678901234567890.99',
  changedAt: '2026-10-14T12:00:00.000Z',
};
function response(history = [entry], total = history.length, page = 1) {
  return new Response(JSON.stringify({ history, total, page, pageSize: 25 }), { status: 200 });
}

it('identifies the selected employee, requests page 1, and shows loading', () => {
  const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  render(<SalaryHistory employee={employee} onClose={vi.fn()} />);
  expect(screen.getByRole('heading')).toHaveTextContent(
    `Salary history for ${employee.name} (${employee.employeeId})`,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Loading salary history');
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/employees/ACME%2FA%20001/salary-history?page=1&pageSize=25',
    { signal: expect.any(AbortSignal) },
  );
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});

it('renders exact strings and UTC timestamps in the received order', async () => {
  const older = {
    ...entry,
    historyId: '9007199254740994',
    oldAmount: '10.00',
    newAmount: '20.00',
    changedAt: '2026-10-13T12:00:00.000Z',
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([entry, older])));
  render(<SalaryHistory employee={employee} onClose={vi.fn()} />);
  expect(await screen.findByRole('table')).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Changed at (UTC)' })).toBeInTheDocument();
  for (const text of [entry.oldAmount, entry.newAmount, entry.changedAt]) {
    expect(screen.getByRole('cell', { name: text })).toBeInTheDocument();
  }
  const rows = screen.getAllByRole('row');
  expect(rows[1]).toHaveTextContent(entry.newAmount);
  expect(rows[2]).toHaveTextContent(older.newAmount);
  expect(screen.getByText('2 salary changes')).toBeInTheDocument();
});

it('shows empty history with disabled pagination', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([], 0)));
  render(<SalaryHistory employee={employee} onClose={vi.fn()} />);
  expect(await screen.findByText('No salary changes yet.')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});

it.each(['network', 'http', 'json', 'wrong-employee', 'numeric-money', 'numeric-id', 'shape'])(
  'shows a friendly error and retries after %s failure',
  async (failure) => {
    const fetchMock = vi.fn();
    if (failure === 'network')
      fetchMock.mockRejectedValueOnce(new Error('private network details'));
    else if (failure === 'http')
      fetchMock.mockResolvedValueOnce(new Response('private SQL details', { status: 500 }));
    else if (failure === 'json')
      fetchMock.mockResolvedValueOnce(new Response('{', { status: 200 }));
    else {
      const bad =
        failure === 'wrong-employee'
          ? { ...entry, employeeId: 'OTHER' }
          : failure === 'numeric-money'
            ? { ...entry, oldAmount: 100 }
            : { ...entry, historyId: 100 };
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            failure === 'shape'
              ? {}
              : {
                  history: [bad],
                  total: 1,
                  page: 1,
                  pageSize: 25,
                },
          ),
          { status: 200 },
        ),
      );
    }
    fetchMock.mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetchMock);
    render(<SalaryHistory employee={employee} onClose={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load salary history. Please try again.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/private.*details/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry history' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      '/api/employees/ACME%2FA%20001/salary-history?page=1&pageSize=25',
    );
  },
);

it('distinguishes missing employees from empty history', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'employee_not_found' } }), { status: 404 }),
      ),
  );
  render(<SalaryHistory employee={employee} onClose={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Employee was not found. Refresh the directory.',
  );
  expect(screen.queryByText('No salary changes yet.')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry history' })).not.toBeInTheDocument();
});

it('paginates independently, disables pending/boundary controls, and returns to page 1', async () => {
  let resolve!: (response: Response) => void;
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response([entry], 26))
    .mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    )
    .mockResolvedValueOnce(response([entry], 26));
  vi.stubGlobal('fetch', fetchMock);
  render(<SalaryHistory employee={employee} onClose={vi.fn()} />);
  const user = userEvent.setup();
  await screen.findByRole('table');
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('status')).toHaveTextContent('Loading salary history');
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(fetchMock.mock.calls[1][0]).toContain('page=2&pageSize=25');
  await act(async () => {
    resolve(response([{ ...entry, newAmount: '20.00' }], 26, 2));
  });
  expect(screen.getByText('Page 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByRole('cell', { name: entry.newAmount });
  expect(screen.getByText('Page 1')).toBeInTheDocument();
});

it('distinguishes an empty later page and allows navigating back', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response([entry], 26))
      .mockResolvedValueOnce(response([], 1, 2)),
  );
  render(<SalaryHistory employee={employee} onClose={vi.fn()} />);
  const user = userEvent.setup();
  await screen.findByRole('table');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('No salary changes on this page.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
});

it('ignores a late success from an aborted StrictMode request', async () => {
  let resolve!: (response: Response) => void;
  const fetchMock = vi
    .fn()
    .mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    )
    .mockResolvedValueOnce(response());
  vi.stubGlobal('fetch', fetchMock);
  render(
    <StrictMode>
      <SalaryHistory employee={employee} onClose={vi.fn()} />
    </StrictMode>,
  );
  await screen.findByRole('cell', { name: entry.newAmount });
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => {
    resolve(response([{ ...entry, newAmount: '999.99' }]));
  });
  expect(screen.getByRole('cell', { name: entry.newAmount })).toBeInTheDocument();
  expect(screen.queryByRole('cell', { name: '999.99' })).not.toBeInTheDocument();
});

it('ignores a late failure from an aborted StrictMode request', async () => {
  let reject!: (error: Error) => void;
  const fetchMock = vi
    .fn()
    .mockReturnValueOnce(
      new Promise<Response>((_resolve, fail) => {
        reject = fail;
      }),
    )
    .mockResolvedValueOnce(response());
  vi.stubGlobal('fetch', fetchMock);
  render(
    <StrictMode>
      <SalaryHistory employee={employee} onClose={vi.fn()} />
    </StrictMode>,
  );
  await screen.findByRole('cell', { name: entry.newAmount });
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => {
    reject(new Error('Obsolete request failed'));
  });
  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
