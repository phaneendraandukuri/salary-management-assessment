import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { App } from './App';
const employee = {
  employeeId: 'A',
  name: 'Synthetic Person',
  email: 'a@example.test',
  country: 'India',
  department: 'Engineering',
  role: 'Developer',
  currency: 'USD',
  salaryAmount: '100.00',
};
function directory() {
  return new Response(JSON.stringify({ employees: [employee], total: 1, page: 1, pageSize: 25 }));
}
function insights(mode = 'currency', amount = '100.00') {
  return new Response(
    JSON.stringify({
      groupBy: mode,
      headcount: 1,
      groups: [
        {
          currency: 'USD',
          groupValue: mode === 'currency' ? null : mode === 'country' ? 'India' : 'Engineering',
          headcount: 1,
          total: amount,
          average: amount,
          median: amount,
          minimum: amount,
          maximum: amount,
        },
      ],
    }),
  );
}
function panel() {
  return within(screen.getByRole('region', { name: 'Compensation insights' }));
}
it('starts closed, aborts on close, and reopens with defaults without old responses', async () => {
  let resolve!: (response: Response) => void;
  let calls = 0;
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url.startsWith('/api/employees')) return Promise.resolve(directory());
    calls++;
    if (calls === 2)
      return new Promise<Response>((done) => {
        resolve = done;
      });
    return Promise.resolve(insights());
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByRole('table');
  expect(screen.queryByRole('region', { name: 'Compensation insights' })).not.toBeInTheDocument();
  expect(calls).toBe(0);
  await user.click(screen.getByRole('button', { name: 'Show compensation insights' }));
  await panel().findByRole('table');
  await user.type(panel().getByRole('textbox', { name: 'Insights country' }), 'India');
  await user.selectOptions(panel().getByRole('combobox', { name: 'Insights grouping' }), 'country');
  await user.click(panel().getByRole('button', { name: 'Apply insights' }));
  await user.click(screen.getByRole('button', { name: 'Hide compensation insights' }));
  expect(screen.queryByRole('region', { name: 'Compensation insights' })).not.toBeInTheDocument();
  const old = fetchMock.mock.calls.find((call) => call[0].includes('groupBy=country'));
  expect(old?.[1].signal.aborted).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Show compensation insights' }));
  await panel().findByRole('table');
  expect(panel().getByRole('textbox', { name: 'Insights country' })).toHaveValue('');
  expect(panel().getByRole('combobox', { name: 'Insights grouping' })).toHaveValue('currency');
  await act(async () => {
    resolve(insights('country', '999.00'));
  });
  expect(panel().queryByRole('cell', { name: '999.00' })).not.toBeInTheDocument();
});

async function submit(user: ReturnType<typeof userEvent.setup>, operation: string) {
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
  } else {
    await user.click(screen.getByRole('button', { name: 'Edit salary for A' }));
    await user.click(screen.getByRole('button', { name: 'Save salary' }));
  }
}
it.each([
  { operation: 'create', fails: false },
  { operation: 'create', fails: true },
  { operation: 'salary', fails: false },
  { operation: 'salary', fails: true },
])(
  'confirmed $operation refresh preserves applied insights; retrieval failure=$fails',
  async ({ operation, fails }) => {
    let saved = false;
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method) {
        saved = true;
        return Promise.resolve(
          new Response(JSON.stringify({ employee: { ...employee, salaryAmount: '200.00' } }), {
            status: options.method === 'POST' ? 201 : 200,
          }),
        );
      }
      if (url.startsWith('/api/employees')) return Promise.resolve(directory());
      const mode = new URL(url, 'http://localhost').searchParams.get('groupBy') ?? 'currency';
      return Promise.resolve(
        saved && fails
          ? new Response('private SQL', { status: 500 })
          : insights(mode, saved ? '200.00' : '100.00'),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Show compensation insights' }));
    await panel().findByRole('table');
    await user.type(panel().getByRole('textbox', { name: 'Insights country' }), 'India');
    await user.selectOptions(
      panel().getByRole('combobox', { name: 'Insights grouping' }),
      'country',
    );
    await user.click(panel().getByRole('button', { name: 'Apply insights' }));
    await panel().findByRole('columnheader', { name: 'Country' });
    await user.clear(panel().getByRole('textbox', { name: 'Insights country' }));
    await user.type(panel().getByRole('textbox', { name: 'Insights country' }), 'unapplied');
    await user.selectOptions(
      panel().getByRole('combobox', { name: 'Insights grouping' }),
      'department',
    );
    await submit(user, operation);
    const confirmation =
      operation === 'create' ? 'Employee A created.' : 'Salary updated for A: USD 200.00.';
    await screen.findByText(confirmation);
    if (fails) {
      expect(await panel().findByRole('alert')).toHaveTextContent(
        'Unable to load compensation insights',
      );
      expect(screen.getByText(confirmation)).toBeInTheDocument();
    } else expect(await panel().findAllByRole('cell', { name: '200.00' })).toHaveLength(5);
    const calls = fetchMock.mock.calls.filter((call) =>
      call[0].startsWith('/api/compensation-insights'),
    );
    expect(calls).toHaveLength(3);
    expect(Object.fromEntries(new URL(calls[2][0], 'http://localhost').searchParams)).toEqual({
      groupBy: 'country',
      country: 'India',
    });
    expect(
      within(screen.getByRole('region', { name: 'Employee directory' })).queryByRole('alert'),
    ).not.toBeInTheDocument();
  },
);
it.each([
  { operation: 'create', failure: 'duplicate' },
  { operation: 'create', failure: 'uncertain' },
  { operation: 'salary', failure: 'validation' },
  { operation: 'salary', failure: 'conflict' },
  { operation: 'salary', failure: 'uncertain' },
])('does not refresh insights after $operation $failure', async ({ operation, failure }) => {
  const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (options?.method) {
      if (failure === 'uncertain') return Promise.reject(new Error('network'));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code:
                failure === 'duplicate'
                  ? 'duplicate_employee_id'
                  : failure === 'conflict'
                    ? 'salary_unchanged'
                    : 'invalid_amount',
              field: failure === 'duplicate' ? 'employeeId' : 'salaryAmount',
            },
          }),
          { status: failure === 'validation' ? 400 : 409 },
        ),
      );
    }
    return Promise.resolve(url.startsWith('/api/employees') ? directory() : insights());
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByRole('table');
  await user.click(screen.getByRole('button', { name: 'Show compensation insights' }));
  await panel().findByRole('table');
  await submit(user, operation);
  await screen.findByRole('alert');
  expect(
    fetchMock.mock.calls.filter((call) => call[0].startsWith('/api/compensation-insights')),
  ).toHaveLength(1);
  expect(panel().getByRole('table')).toBeInTheDocument();
});
