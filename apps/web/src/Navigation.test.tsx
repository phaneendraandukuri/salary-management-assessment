import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';

const employee = {
  employeeId: 'E1',
  name: 'Synthetic Person',
  email: 'e@example.test',
  department: 'Engineering',
  role: 'Engineer',
  country: 'India',
  currency: 'INR',
  salaryAmount: '9007199254740993.01',
};
function directory() {
  return new Response(
    JSON.stringify({
      employees: [employee, { ...employee, employeeId: 'E2' }],
      total: 2,
      page: 1,
      pageSize: 25,
    }),
  );
}
function setup() {
  const fetchMock = vi
    .fn()
    .mockImplementation(async (url: string) =>
      url.includes('salary-history')
        ? new Response(JSON.stringify({ history: [], total: 0, page: 1, pageSize: 25 }))
        : directory(),
    );
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  return { user: userEvent.setup(), fetchMock };
}
it('shows only the selected workflow and focuses its heading on navigation', async () => {
  const { user } = setup();
  await screen.findByRole('table');
  expect(screen.queryByRole('form', { name: 'Create employee' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add Employee' }));
  expect(screen.getByRole('heading', { name: 'Add employee' })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('textbox', { name: 'Employee ID' })).toHaveFocus();
  expect(screen.queryByRole('region', { name: 'Employee directory' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add Employee' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await user.click(screen.getByRole('button', { name: 'Employees' }));
  expect(screen.getByRole('heading', { name: 'Employee directory' })).toHaveFocus();
  expect(screen.queryByRole('textbox', { name: 'Employee ID' })).not.toBeInTheDocument();
});

it.each([
  { operation: 'create', success: false },
  { operation: 'salary', success: false },
  { operation: 'create', success: true },
  { operation: 'salary', success: true },
] as const)(
  'blocks navigation during $operation and restores it after success=$success',
  async ({ operation, success }) => {
    const { user, fetchMock } = setup();
    await screen.findByRole('table');
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    if (operation === 'create') {
      await user.click(screen.getByRole('button', { name: 'Add Employee' }));
      for (const [label, value] of [
        ['Employee ID', 'NEW'],
        ['Name', employee.name],
        ['Email', employee.email],
        ['Department', employee.department],
        ['Role', employee.role],
        ['Country', employee.country],
        ['Annual salary', employee.salaryAmount],
      ])
        await user.type(screen.getByRole('textbox', { name: label }), value);
      await user.click(screen.getByRole('button', { name: 'Create employee' }));
    } else {
      await user.click(screen.getByRole('button', { name: 'Edit salary for E1' }));
      await user.click(screen.getByRole('button', { name: 'Save salary' }));
    }
    const navigation = within(screen.getByRole('navigation', { name: 'Application' }));
    for (const button of navigation.getAllByRole('button')) expect(button).toBeDisabled();
    await act(async () =>
      resolve(
        new Response(
          JSON.stringify(success ? { employee } : { error: { code: 'persistence_failed' } }),
          { status: success ? (operation === 'create' ? 201 : 200) : 500 },
        ),
      ),
    );
    for (const button of navigation.getAllByRole('button')) expect(button).toBeEnabled();
  },
);

it('retains the selected history page when navigating away and back without another request', async () => {
  const { user, fetchMock } = setup();
  await screen.findByRole('table');
  fetchMock.mockImplementation(async (url: string) =>
    url.includes('salary-history')
      ? new Response(
          JSON.stringify({
            history: [],
            total: 26,
            page: url.includes('page=2') ? 2 : 1,
            pageSize: 25,
          }),
        )
      : directory(),
  );
  await user.click(screen.getByRole('button', { name: 'View history for E1' }));
  const history = within(screen.getByRole('region', { name: 'Salary history for E1' }));
  await user.click(await history.findByRole('button', { name: 'Next' }));
  await history.findByText('Page 2');
  await user.click(screen.getByRole('button', { name: 'Add Employee' }));
  expect(screen.queryByRole('region', { name: 'Salary history for E1' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Employees' }));
  expect(history.getByText('Page 2')).toBeVisible();
  expect(fetchMock.mock.calls.filter((call) => call[0].includes('salary-history'))).toHaveLength(2);
});

afterEach(() => {
  delete (HTMLElement.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
});
it('reveals history for initial, repeated and different selections, but never on background refresh', async () => {
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: scroll,
    configurable: true,
  });
  const { user, fetchMock } = setup();
  await screen.findByRole('table');
  for (const [index, id] of ['E1', 'E1', 'E2'].entries()) {
    await user.click(screen.getByRole('button', { name: `View history for ${id}` }));
    expect(
      screen.getByRole('heading', { name: `Salary history for ${employee.name} (${id})` }),
    ).toHaveFocus();
    expect(scroll).toHaveBeenCalledTimes(index + 1);
  }
  await user.click(screen.getByRole('button', { name: 'Edit salary for E2' }));
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ employee: { ...employee, employeeId: 'E2', salaryAmount: '100.01' } }),
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Save salary' }));
  await screen.findByText('Salary updated for E2: INR 100.01.');
  expect(scroll).toHaveBeenCalledTimes(3);
  expect(screen.getByRole('button', { name: 'Save salary' })).toHaveFocus();
});
it('retains creation drafts, directory drafts and the selected salary across navigation', async () => {
  const { user } = setup();
  await screen.findByRole('table');
  await user.type(screen.getByLabelText('Name or email'), 'unapplied');
  await user.click(screen.getByRole('button', { name: 'Edit salary for E1' }));
  const salary = screen.getByLabelText('New annual salary');
  await user.clear(salary);
  await user.type(salary, '100.01');
  await user.click(screen.getByRole('button', { name: 'Add Employee' }));
  await user.type(screen.getByLabelText('Employee ID'), 'DRAFT');
  await user.click(screen.getByRole('button', { name: 'Employees' }));
  expect(screen.getByLabelText('Name or email')).toHaveValue('unapplied');
  expect(screen.getByLabelText('New annual salary')).toHaveValue('100.01');
  await user.click(screen.getByRole('button', { name: 'Add Employee' }));
  expect(screen.getByLabelText('Employee ID')).toHaveValue('DRAFT');
});
