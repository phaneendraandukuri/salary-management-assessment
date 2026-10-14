import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { App } from './App';
import { getEmployeePage } from './employee-api';

const employee = {
  employeeId: 'A',
  name: 'Synthetic Person',
  email: 'a@example.test',
  country: 'India',
  department: 'Engineering',
  role: 'Developer',
  currency: 'INR',
  salaryAmount: '9007199254740993.01',
};
function response(rows = [employee], total = rows.length, page = 1) {
  return new Response(JSON.stringify({ employees: rows, total, page, pageSize: 25 }), {
    status: 200,
  });
}
function controls() {
  return within(screen.getByRole('form', { name: 'Directory controls' }));
}
function query(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  return new URL(fetchMock.mock.calls[index][0], 'http://localhost').searchParams;
}

it('encodes selected criteria as query values without changing salary strings', async () => {
  const fetchMock = vi.fn().mockResolvedValue(response());
  vi.stubGlobal('fetch', fetchMock);
  const result = await getEmployeePage(2, new AbortController().signal, {
    search: ' A%_\\& ',
    country: ' India ',
    department: ' HR ',
    currency: 'USD',
    sortBy: 'salaryAmount',
    sortDirection: 'desc',
  });
  expect(Object.fromEntries(query(fetchMock, 0))).toEqual({
    page: '2',
    pageSize: '25',
    search: 'A%_\\&',
    country: 'India',
    department: 'HR',
    currency: 'USD',
    sortBy: 'salaryAmount',
    sortDirection: 'desc',
  });
  expect(result.employees[0].salaryAmount).toBe(employee.salaryAmount);
});

it('keeps draft edits unapplied, then applies combined criteria from page 1', async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string) =>
      Promise.resolve(
        response([employee], 26, Number(new URL(url, 'http://localhost').searchParams.get('page'))),
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByRole('table');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('table');
  const form = controls();
  await user.type(form.getByRole('textbox', { name: 'Name or email' }), ' Alex ');
  await user.type(form.getByRole('textbox', { name: 'Filter country' }), ' India ');
  await user.type(form.getByRole('textbox', { name: 'Filter department' }), ' Engineering ');
  await user.selectOptions(form.getByRole('combobox', { name: 'Filter currency' }), 'INR');
  await user.selectOptions(form.getByRole('combobox', { name: 'Sort field' }), 'salaryAmount');
  await user.selectOptions(form.getByRole('combobox', { name: 'Sort direction' }), 'desc');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/Applied query:/)).not.toHaveTextContent('Alex');
  await user.click(form.getByRole('button', { name: 'Apply' }));
  await screen.findByRole('table');
  expect(Object.fromEntries(query(fetchMock, 2))).toEqual({
    page: '1',
    pageSize: '25',
    search: 'Alex',
    country: 'India',
    department: 'Engineering',
    currency: 'INR',
    sortBy: 'salaryAmount',
    sortDirection: 'desc',
  });
  expect(screen.getByText('Page 1')).toBeInTheDocument();
  expect(screen.getByText(/Applied query:/)).toHaveTextContent('Alex');
  expect(screen.getByText(/Exact match/)).toBeInTheDocument();
  expect(screen.getByText(/nominal/)).toBeInTheDocument();
});

it('Reset restores default controls and requests page 1 even while a query is pending', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response([employee], 26))
    .mockReturnValueOnce(new Promise(() => {}))
    .mockResolvedValueOnce(response());
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByRole('table');
  const form = controls();
  await user.type(form.getByRole('textbox', { name: 'Name or email' }), 'missing');
  await user.selectOptions(form.getByRole('combobox', { name: 'Sort field' }), 'name');
  await user.selectOptions(form.getByRole('combobox', { name: 'Sort direction' }), 'desc');
  await user.click(form.getByRole('button', { name: 'Apply' }));
  expect(screen.getByRole('status')).toHaveTextContent('Loading employees');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  await user.click(form.getByRole('button', { name: 'Reset' }));
  await screen.findByRole('table');
  expect(fetchMock.mock.calls[2][0]).toBe('/api/employees?page=1&pageSize=25');
  expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
  expect(form.getByRole('textbox', { name: 'Name or email' })).toHaveValue('');
  expect(form.getByRole('combobox', { name: 'Sort field' })).toHaveValue('employeeId');
  expect(form.getByRole('combobox', { name: 'Sort direction' })).toHaveValue('asc');
  expect(screen.getByText(/Applied query:/)).not.toHaveTextContent('missing');
});

it('distinguishes zero filtered matches from an empty unfiltered directory', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(response([], 0))),
  );
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText('No employees yet.');
  await user.type(controls().getByRole('textbox', { name: 'Name or email' }), 'missing');
  await user.click(controls().getByRole('button', { name: 'Apply' }));
  expect(await screen.findByText('No employees match these criteria.')).toBeInTheDocument();
  expect(screen.queryByText('No employees yet.')).not.toBeInTheDocument();
  await user.click(controls().getByRole('button', { name: 'Reset' }));
  expect(await screen.findByText('No employees yet.')).toBeInTheDocument();
});

it('paging and Retry preserve applied criteria rather than unapplied edits; Reset recovers an error', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockResolvedValueOnce(response([employee], 26))
    .mockRejectedValueOnce(new Error('private'))
    .mockResolvedValueOnce(response([], 1, 2));
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByRole('table');
  await user.type(controls().getByRole('textbox', { name: 'Name or email' }), 'Synthetic');
  await user.click(controls().getByRole('button', { name: 'Apply' }));
  await screen.findByRole('table');
  await user.clear(controls().getByRole('textbox', { name: 'Name or email' }));
  await user.type(controls().getByRole('textbox', { name: 'Name or email' }), 'unapplied');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('alert');
  expect(query(fetchMock, 2).get('search')).toBe('Synthetic');
  expect(query(fetchMock, 2).get('page')).toBe('2');
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('No employees on this page.');
  expect(query(fetchMock, 3).get('search')).toBe('Synthetic');
  expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  fetchMock.mockRejectedValueOnce(new Error('Failed again'));
  await user.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByRole('alert');
  fetchMock.mockResolvedValueOnce(response());
  await user.click(controls().getByRole('button', { name: 'Reset' }));
  await screen.findByRole('table');
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/employees?page=1&pageSize=25');
});

it.each(['apply', 'reset', 'paging'])(
  'ignores obsolete success and failure after %s',
  async (action) => {
    let resolve!: (response: Response) => void;
    let reject!: (error: Error) => void;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([employee], 26))
      .mockReturnValueOnce(
        new Promise<Response>((done) => {
          resolve = done;
        }),
      )
      .mockReturnValueOnce(
        new Promise<Response>((_done, fail) => {
          reject = fail;
        }),
      )
      .mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole('table');
    if (action === 'paging') await user.click(screen.getByRole('button', { name: 'Next' }));
    else {
      await user.type(controls().getByRole('textbox', { name: 'Name or email' }), 'old');
      await user.click(controls().getByRole('button', { name: 'Apply' }));
    }
    await user.click(
      controls().getByRole('button', { name: action === 'reset' ? 'Reset' : 'Apply' }),
    );
    await user.click(controls().getByRole('button', { name: 'Reset' }));
    await screen.findByRole('table');
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    expect(fetchMock.mock.calls[2][1].signal.aborted).toBe(true);
    await act(async () => {
      resolve(response([{ ...employee, name: 'Obsolete' }]));
      reject(new Error('Obsolete failure'));
    });
    expect(screen.getByRole('cell', { name: employee.name })).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'Obsolete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  },
);

it.each(['create', 'salary'])(
  'preserves applied query/page during %s refresh and ignores an obsolete refresh',
  async (operation) => {
    let resolveRefresh!: (response: Response) => void;
    let directoryCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method)
        return Promise.resolve(
          new Response(JSON.stringify({ employee }), {
            status: options.method === 'POST' ? 201 : 200,
          }),
        );
      directoryCalls++;
      if (directoryCalls === 4)
        return new Promise<Response>((done) => {
          resolveRefresh = done;
        });
      return Promise.resolve(
        response([employee], 26, Number(new URL(url, 'http://localhost').searchParams.get('page'))),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole('table');
    await user.type(controls().getByRole('textbox', { name: 'Name or email' }), 'Synthetic');
    await user.click(controls().getByRole('button', { name: 'Apply' }));
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('table');
    await user.clear(controls().getByRole('textbox', { name: 'Name or email' }));
    await user.type(controls().getByRole('textbox', { name: 'Name or email' }), 'unapplied');
    if (operation === 'create') {
      const form = within(screen.getByRole('form', { name: 'Create employee' }));
      for (const [label, value] of [
        ['Employee ID', employee.employeeId],
        ['Name', employee.name],
        ['Email', employee.email],
        ['Department', employee.department],
        ['Role', employee.role],
        ['Country', employee.country],
        ['Annual salary', employee.salaryAmount],
      ])
        await user.type(form.getByRole('textbox', { name: label }), value);
      await user.click(form.getByRole('button', { name: 'Create employee' }));
      await screen.findByText('Employee A created.');
    } else {
      await user.click(screen.getByRole('button', { name: 'Edit salary for A' }));
      await user.click(screen.getByRole('button', { name: 'Save salary' }));
      await screen.findByText(`Salary updated for A: INR ${employee.salaryAmount}.`);
    }
    const calls = fetchMock.mock.calls.filter((call) => !call[1]?.method);
    expect(new URL(calls[3][0], 'http://localhost').searchParams.get('search')).toBe('Synthetic');
    expect(new URL(calls[3][0], 'http://localhost').searchParams.get('page')).toBe('2');
    await user.click(controls().getByRole('button', { name: 'Reset' }));
    await screen.findByRole('table');
    expect(calls[3][1].signal.aborted).toBe(true);
    await act(async () => {
      resolveRefresh(response([{ ...employee, name: 'Obsolete refresh' }], 26, 2));
    });
    expect(screen.queryByRole('cell', { name: 'Obsolete refresh' })).not.toBeInTheDocument();
    expect(screen.getByText('Page 1')).toBeInTheDocument();
  },
);
