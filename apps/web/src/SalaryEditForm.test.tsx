import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { SalaryEditForm } from './SalaryEditForm';

const employee = {
  employeeId: 'ACME/A 001',
  name: 'Synthetic Salary Employee',
  email: 'salary@example.test',
  department: 'Engineering',
  role: 'Developer',
  country: 'India',
  currency: 'USD',
  salaryAmount: '9007199254740993.01',
};

function props() {
  return { employee, onSaved: vi.fn(), onCancel: vi.fn(), onSavingChange: vi.fn() };
}

it('identifies the employee, displays fixed currency, and prefills the exact salary', () => {
  render(<SalaryEditForm {...props()} />);
  expect(screen.getByRole('heading')).toHaveTextContent(
    `Edit salary for ${employee.name} (${employee.employeeId})`,
  );
  expect(screen.getByText('Currency: USD')).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'New annual salary' })).toHaveValue(
    employee.salaryAmount,
  );
});

it('PATCHes only the exact salary to the encoded employee ID', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ employee: { ...employee, salaryAmount: '12345678901234567890.01' } }),
        { status: 200 },
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  render(<SalaryEditForm {...props()} />);
  const user = userEvent.setup();
  const input = screen.getByRole('textbox', { name: 'New annual salary' });
  await user.clear(input);
  await user.type(input, '12345678901234567890.01');
  await user.click(screen.getByRole('button', { name: 'Save salary' }));
  expect(fetchMock).toHaveBeenCalledWith('/api/employees/ACME%2FA%20001/salary', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ salaryAmount: '12345678901234567890.01' }),
  });
});

it('disables salary editing, save, and cancel while a request is pending', async () => {
  let resolve!: (response: Response) => void;
  const fetchMock = vi.fn().mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const callbacks = props();
  render(<SalaryEditForm {...callbacks} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Save salary' }));
  expect(screen.getByRole('status')).toHaveTextContent('Saving salary');
  expect(screen.getByRole('textbox', { name: 'New annual salary' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save salary' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Save salary' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(callbacks.onCancel).not.toHaveBeenCalled();
  expect(callbacks.onSavingChange).toHaveBeenCalledWith(true);
  await act(async () => {
    resolve(new Response(JSON.stringify({ employee }), { status: 200 }));
  });
});

it('confirms normalized saved salary, updates the input/current amount, and requests refresh', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ employee: { ...employee, salaryAmount: '100.50' } }), {
        status: 200,
      }),
    ),
  );
  const callbacks = props();
  render(<SalaryEditForm {...callbacks} />);
  const user = userEvent.setup();
  const input = screen.getByRole('textbox', { name: 'New annual salary' });
  await user.clear(input);
  await user.type(input, '00100.5');
  await user.click(screen.getByRole('button', { name: 'Save salary' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Salary updated for ACME/A 001: USD 100.50.',
  );
  expect(input).toHaveValue('100.50');
  expect(screen.getByText('Current annual salary: 100.50')).toBeInTheDocument();
  expect(callbacks.onSaved).toHaveBeenCalledTimes(1);
  expect(callbacks.onSavingChange).toHaveBeenLastCalledWith(false);
});

it.each([
  {
    status: 400,
    code: 'invalid_amount',
    field: 'salaryAmount',
    message: 'Enter a positive salary with at most two decimal places.',
  },
  {
    status: 400,
    code: 'amount_not_storable',
    field: 'salaryAmount',
    message: 'This salary exceeds the database storage range.',
  },
  {
    status: 409,
    code: 'salary_unchanged',
    field: 'salaryAmount',
    message: 'Salary is unchanged. Enter a different amount.',
  },
  {
    status: 404,
    code: 'employee_not_found',
    field: 'employeeId',
    message: 'Employee was not found. Refresh the directory.',
  },
  {
    status: 500,
    code: 'persistence_failed',
    field: 'employee',
    message: 'Unable to update salary. Please try again.',
  },
])(
  'handles $code and retains input without refreshing',
  async ({ status, code, field, message }) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ error: { code, field } }), { status })),
    );
    const callbacks = props();
    render(<SalaryEditForm {...callbacks} />);
    const user = userEvent.setup();
    const input = screen.getByRole('textbox', { name: 'New annual salary' });
    await user.clear(input);
    await user.type(input, '123.45');
    await user.click(screen.getByRole('button', { name: 'Save salary' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(input).toHaveValue('123.45');
    if (field === 'salaryAmount') {
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAccessibleDescription(message);
    }
    expect(screen.getByRole('button', { name: 'Save salary' })).toBeEnabled();
    expect(callbacks.onSaved).not.toHaveBeenCalled();
    expect(callbacks.onSavingChange).toHaveBeenLastCalledWith(false);
  },
);

it.each([
  'network',
  'invalid-json',
  'wrong-employee',
  'nonstring-salary',
  'server',
  'unexpected',
  'unknown-code',
  'malformed-error',
])('handles %s without automatic retries or false success', async (failure) => {
  const fetchMock = vi.fn();
  const uncertain = ['network', 'invalid-json', 'wrong-employee', 'nonstring-salary'].includes(
    failure,
  );
  if (failure === 'network') fetchMock.mockRejectedValue(new Error('private network details'));
  else if (failure === 'invalid-json')
    fetchMock.mockResolvedValue(new Response('{', { status: 200 }));
  else if (failure === 'wrong-employee')
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ employee: { ...employee, employeeId: 'OTHER' } }), {
        status: 200,
      }),
    );
  else if (failure === 'nonstring-salary')
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ employee: { ...employee, salaryAmount: 100 } }), {
        status: 200,
      }),
    );
  else if (failure === 'unknown-code')
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: '__proto__' } }), { status: 400 }),
    );
  else if (failure === 'malformed-error')
    fetchMock.mockResolvedValue(new Response('{', { status: 400 }));
  else
    fetchMock.mockResolvedValue(
      new Response('private server details', { status: failure === 'server' ? 500 : 418 }),
    );
  vi.stubGlobal('fetch', fetchMock);
  const callbacks = props();
  render(<SalaryEditForm {...callbacks} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Save salary' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    uncertain
      ? 'Update could not be confirmed. Check the directory before submitting again.'
      : 'Unable to update salary. Please try again.',
  );
  expect(screen.getByRole('textbox', { name: 'New annual salary' })).toHaveValue(
    employee.salaryAmount,
  );
  expect(screen.getByRole('button', { name: 'Save salary' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  expect(callbacks.onSaved).not.toHaveBeenCalled();
  expect(callbacks.onSavingChange).toHaveBeenLastCalledWith(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/private.*details/)).not.toBeInTheDocument();
});

it('does not submit a blank required salary', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  render(<SalaryEditForm {...props()} />);
  const user = userEvent.setup();
  await user.clear(screen.getByRole('textbox', { name: 'New annual salary' }));
  await user.click(screen.getByRole('button', { name: 'Save salary' }));
  expect(screen.getByRole('textbox', { name: 'New annual salary' })).toBeInvalid();
  expect(fetchMock).not.toHaveBeenCalled();
});
