import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { EmployeeCreationForm } from './EmployeeCreationForm';

const input = {
  employeeId: 'ACME-NEW',
  name: 'Synthetic New Employee',
  email: 'new@example.test',
  department: 'Engineering',
  role: 'Developer',
  country: 'India',
  salaryAmount: '9007199254740993.01',
  currency: 'USD',
};

const labels: Record<string, string> = {
  employeeId: 'Employee ID',
  name: 'Name',
  email: 'Email',
  department: 'Department',
  role: 'Role',
  country: 'Country',
  salaryAmount: 'Annual salary',
};

async function fillForm() {
  const user = userEvent.setup();
  for (const [field, value] of Object.entries(input)) {
    if (field === 'currency') await user.selectOptions(screen.getByRole('combobox'), value);
    else await user.type(screen.getByRole('textbox', { name: labels[field] }), value);
  }
  return user;
}

it('posts all eight fields as JSON without changing salary digits', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ employee: input }), { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<EmployeeCreationForm onCreated={vi.fn()} />);
  const user = await fillForm();
  await user.click(screen.getByRole('button', { name: 'Create employee' }));
  expect(fetchMock).toHaveBeenCalledWith('/api/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
});

it('disables controls and prevents another POST while submitting', async () => {
  let resolve!: (response: Response) => void;
  const fetchMock = vi.fn().mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<EmployeeCreationForm onCreated={vi.fn()} />);
  const user = await fillForm();
  await user.click(screen.getByRole('button', { name: 'Create employee' }));
  expect(screen.getByRole('status')).toHaveTextContent('Creating employee');
  for (const control of [
    ...screen.getAllByRole('textbox'),
    screen.getByRole('combobox'),
    screen.getByRole('button'),
  ]) {
    expect(control).toBeDisabled();
  }
  await user.click(screen.getByRole('button'));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve(new Response(JSON.stringify({ employee: input }), { status: 201 }));
  });
});

it('confirms the stored employee ID, resets the form, and notifies the directory', async () => {
  const onCreated = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ employee: { ...input, employeeId: 'STORED-ID' } }), {
        status: 201,
      }),
    ),
  );
  render(<EmployeeCreationForm onCreated={onCreated} />);
  const user = await fillForm();
  await user.click(screen.getByRole('button', { name: 'Create employee' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Employee STORED-ID created');
  const confirmation = screen.getByRole('status');
  expect(confirmation).toBeVisible();
  expect(confirmation).toHaveClass('creation-success');
  expect(confirmation.querySelector('[aria-hidden="true"]')).toHaveTextContent('✓');
  for (const control of screen.getAllByRole('textbox')) expect(control).toHaveValue('');
  expect(screen.getByRole('combobox')).toHaveValue('INR');
  expect(onCreated).toHaveBeenCalledTimes(1);
});

it.each([
  { status: 400, field: 'name', code: 'invalid_field', message: 'Enter a valid name.' },
  { status: 400, field: 'email', code: 'invalid_email', message: 'Enter a valid email address.' },
  {
    status: 400,
    field: 'salaryAmount',
    code: 'invalid_amount',
    message: 'Enter a positive salary with at most two decimal places.',
  },
  {
    status: 400,
    field: 'currency',
    code: 'unsupported_currency',
    message: 'Select INR, USD, EUR, or GBP.',
  },
  {
    status: 400,
    field: 'salaryAmount',
    code: 'amount_not_storable',
    message: 'This salary exceeds the database storage range.',
  },
  {
    status: 409,
    field: 'employeeId',
    code: 'duplicate_employee_id',
    message: 'This employee ID already exists.',
  },
])(
  'shows $code against $field and retains entered values',
  async ({ status, field, code, message }) => {
    const onCreated = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ error: { field, code } }), { status })),
    );
    render(<EmployeeCreationForm onCreated={onCreated} />);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: 'Create employee' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    const control =
      field === 'currency'
        ? screen.getByRole('combobox')
        : screen.getByRole('textbox', { name: labels[field] });
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAccessibleDescription(message);
    expect(screen.getByRole('textbox', { name: 'Annual salary' })).toHaveValue(input.salaryAmount);
    expect(screen.getByRole('button', { name: 'Create employee' })).toBeEnabled();
    expect(onCreated).not.toHaveBeenCalled();
  },
);

it.each(['network', 'server', 'unexpected', 'unreadable-success'])(
  'handles %s failure without automatic retry or losing values',
  async (failure) => {
    const fetchMock = vi.fn();
    if (failure === 'network') fetchMock.mockRejectedValue(new Error('private network details'));
    else if (failure === 'unreadable-success')
      fetchMock.mockResolvedValue(new Response('{}', { status: 201 }));
    else
      fetchMock.mockResolvedValue(
        new Response('private server details', { status: failure === 'server' ? 500 : 418 }),
      );
    const onCreated = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<EmployeeCreationForm onCreated={onCreated} />);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: 'Create employee' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      failure === 'network' || failure === 'unreadable-success'
        ? 'Creation could not be confirmed. Check the directory before submitting again.'
        : 'Unable to create employee. Please try again.',
    );
    expect(screen.getByRole('textbox', { name: 'Employee ID' })).toHaveValue(input.employeeId);
    expect(screen.getByRole('textbox', { name: 'Annual salary' })).toHaveValue(input.salaryAmount);
    expect(screen.getByRole('button', { name: 'Create employee' })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.queryByText(/private.*details/)).not.toBeInTheDocument();
  },
);

it.each(['__proto__', 'malformed-error'])(
  'handles an unrecognized API error %s safely',
  async (code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(code === 'malformed-error' ? '{' : JSON.stringify({ error: { code } }), {
          status: 400,
        }),
      ),
    );
    render(<EmployeeCreationForm onCreated={vi.fn()} />);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: 'Create employee' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to create employee. Please try again.',
    );
  },
);

it('uses native required/email checks without sending invalid form values', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  render(<EmployeeCreationForm onCreated={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Create employee' }));
  expect(screen.getByRole('textbox', { name: 'Employee ID' })).toBeInvalid();
  await fillForm();
  const email = screen.getByRole('textbox', { name: 'Email' });
  await user.clear(email);
  await user.type(email, 'invalid');
  await user.click(screen.getByRole('button', { name: 'Create employee' }));
  expect(email).toBeInvalid();
  expect(fetchMock).not.toHaveBeenCalled();
});
