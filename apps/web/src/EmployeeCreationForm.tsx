import { useState } from 'react';
import type { FormEvent } from 'react';
import { postEmployee } from './employee-api';
import type { Employee } from './employee-api';

const textFields = [
  { name: 'employeeId', label: 'Employee ID' },
  { name: 'name', label: 'Name' },
  { name: 'email', label: 'Email' },
  { name: 'department', label: 'Department' },
  { name: 'role', label: 'Role' },
  { name: 'country', label: 'Country' },
  { name: 'salaryAmount', label: 'Annual salary' },
] as const;

const errorMessages: Record<string, string> = {
  invalid_email: 'Enter a valid email address.',
  invalid_amount: 'Enter a positive salary with at most two decimal places.',
  unsupported_currency: 'Select INR, USD, EUR, or GBP.',
  amount_not_storable: 'This salary exceeds the database storage range.',
  duplicate_employee_id: 'This employee ID already exists.',
  creation_uncertain:
    'Creation could not be confirmed. Check the directory before submitting again.',
};

type FormState =
  | { status: 'idle' | 'submitting' }
  | { status: 'success'; employeeId: string }
  | { status: 'error'; message: string; field?: string };

export function EmployeeCreationForm({ onCreated }: { onCreated: () => void }) {
  const [state, setState] = useState<FormState>({ status: 'idle' });
  const submitting = state.status === 'submitting';
  const error = state.status === 'error' ? state : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    // This fixed form contains only the eight named string-valued employee controls.
    const employee = Object.fromEntries(new FormData(form)) as Employee;
    setState({ status: 'submitting' });
    const result = await postEmployee(employee);
    if (!result.ok) {
      const field = textFields.find((field) => field.name === result.error.field);
      const message =
        result.error.code === 'invalid_field' && field
          ? `Enter a valid ${field.label.toLowerCase()}.`
          : Object.hasOwn(errorMessages, result.error.code)
            ? errorMessages[result.error.code]
            : 'Unable to create employee. Please try again.';
      setState({
        status: 'error',
        message,
        field: field?.name ?? (result.error.field === 'currency' ? 'currency' : undefined),
      });
      return;
    }
    form.reset();
    setState({ status: 'success', employeeId: result.employeeId });
    onCreated();
  }

  return (
    <form onSubmit={submit} aria-label="Create employee" className="creation-form">
      <h2>Add employee</h2>
      <p>All fields are required. Salary is annual base compensation.</p>
      {submitting && <p role="status">Creating employee…</p>}
      {state.status === 'success' && <p role="status">Employee {state.employeeId} created.</p>}
      {error && (
        <p role="alert" id="employee-creation-error">
          {error.message}
        </p>
      )}
      <fieldset disabled={submitting}>
        <legend className="visually-hidden">Employee details</legend>
        <div className="creation-fields">
          {textFields.map((field) => (
            <label key={field.name}>
              {field.label}
              <input
                name={field.name}
                required
                type={field.name === 'email' ? 'email' : 'text'}
                inputMode={field.name === 'salaryAmount' ? 'decimal' : undefined}
                aria-invalid={error?.field === field.name || undefined}
                aria-describedby={
                  error?.field === field.name
                    ? 'employee-creation-error'
                    : field.name === 'salaryAmount'
                      ? 'salary-guidance'
                      : undefined
                }
              />
            </label>
          ))}
          <label>
            Currency
            <select
              name="currency"
              required
              aria-invalid={error?.field === 'currency' || undefined}
              aria-describedby={error?.field === 'currency' ? 'employee-creation-error' : undefined}
            >
              {['INR', 'USD', 'EUR', 'GBP'].map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          </label>
        </div>
        <p id="salary-guidance">
          Enter a positive salary with at most two decimal places, without commas.
        </p>
        <button type="submit">Create employee</button>
      </fieldset>
    </form>
  );
}
