import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';
import { useApiRequest } from './api-context';
import { getEmployeePage, postEmployee, patchSalary, getSalaryHistory } from './employee-api';
import { getInsights } from './insights-api';

const employee = {
  employeeId: 'E',
  name: 'Example',
  email: 'example@example.test',
  country: 'India',
  department: 'HR',
  role: 'Manager',
  currency: 'INR',
  salaryAmount: '9007199254740993.01',
};
const helpers = {
  directory: (api: typeof fetch) => getEmployeePage(1, new AbortController().signal, {}, api),
  creation: (api: typeof fetch) => postEmployee(employee, api),
  salary: (api: typeof fetch) => patchSalary('E', '100.01', api),
  history: (api: typeof fetch) => getSalaryHistory('E', 1, new AbortController().signal, api),
  insights: (api: typeof fetch) =>
    getInsights(
      { country: '', department: '', groupBy: 'currency' },
      new AbortController().signal,
      api,
    ),
};
function Workflow({ kind }: { kind: keyof typeof helpers }) {
  const api = useApiRequest();
  return (
    <>
      <p>Protected employee data</p>
      <button onClick={() => void helpers[kind](api).catch(() => {})}>
        Request protected workflow
      </button>
    </>
  );
}
function response(status: number) {
  return new Response(JSON.stringify(status === 200 ? { user: { username: 'hr' } } : {}), {
    status,
  });
}
async function login() {
  await screen.findByRole('form', { name: 'HR login' });
  await userEvent.type(screen.getByLabelText('Username'), 'hr');
  await userEvent.type(screen.getByLabelText('Password'), 'test-only-password');
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
  await screen.findByText('Protected employee data');
}

it.each(Object.keys(helpers) as (keyof typeof helpers)[])(
  'returns to login on %s 401 even when the helper catches errors',
  async (kind) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(401)),
    );
    render(
      <AuthGate>
        <Workflow kind={kind} />
      </AuthGate>,
    );
    await screen.findByText('Protected employee data');
    await userEvent.click(screen.getByRole('button', { name: 'Request protected workflow' }));
    expect(await screen.findByRole('form', { name: 'HR login' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('session expired');
    expect(screen.queryByText('Protected employee data')).not.toBeInTheDocument();
  },
);

it('ignores stale 401 after logout and a newer successful login', async () => {
  let resolve: (value: Response) => void = () => {};
  const stale = new Promise<Response>((done) => {
    resolve = done;
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response(200))
    .mockReturnValueOnce(stale)
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(response(200));
  vi.stubGlobal('fetch', fetchMock);
  render(
    <AuthGate>
      <Workflow kind="directory" />
    </AuthGate>,
  );
  await screen.findByText('Protected employee data');
  await userEvent.click(screen.getByRole('button', { name: 'Request protected workflow' }));
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
  await login();
  await act(async () => resolve(response(401)));
  expect(screen.getByText('Protected employee data')).toBeInTheDocument();
  expect(screen.queryByRole('form', { name: 'HR login' })).not.toBeInTheDocument();
});

it.each(['creation', 'salary'] as const)(
  'never replays %s after reauthentication',
  async (kind) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <AuthGate>
        <Workflow kind={kind} />
      </AuthGate>,
    );
    await screen.findByText('Protected employee data');
    await userEvent.click(screen.getByRole('button', { name: 'Request protected workflow' }));
    await login();
    expect(
      fetchMock.mock.calls.filter(
        (call) => call[0] === (kind === 'creation' ? '/api/employees' : '/api/employees/E/salary'),
      ).length,
    ).toBe(1);
  },
);
