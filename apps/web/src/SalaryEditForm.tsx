import { useApiRequest } from './api-context';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Employee } from './employee-api';
import { patchSalary } from './employee-api';

type Props = {
  employee: Employee;
  onSaved: () => void;
  onCancel: () => void;
  onSavingChange: (saving: boolean) => void;
};

type SaveState =
  | { status: 'idle' | 'saving' | 'success' }
  | { status: 'error'; message: string; invalidAmount: boolean };

const errorMessages: Record<string, string> = {
  invalid_amount: 'Enter a positive salary with at most two decimal places.',
  amount_not_storable: 'This salary exceeds the database storage range.',
  salary_unchanged: 'Salary is unchanged. Enter a different amount.',
  employee_not_found: 'Employee was not found. Refresh the directory.',
  update_uncertain: 'Update could not be confirmed. Check the directory before submitting again.',
};

export function SalaryEditForm({ employee, onCancel, onSaved, onSavingChange }: Props) {
  const apiRequest = useApiRequest();
  const [amount, setAmount] = useState(employee.salaryAmount);
  const [currentSalary, setCurrentSalary] = useState(employee.salaryAmount);
  const [state, setState] = useState<SaveState>({ status: 'idle' });
  const saving = state.status === 'saving';
  const error = state.status === 'error' ? state : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setState({ status: 'saving' });
    onSavingChange(true);
    const result = await patchSalary(employee.employeeId, amount, apiRequest);
    onSavingChange(false);
    if (!result.ok) {
      setState({
        status: 'error',
        message: Object.hasOwn(errorMessages, result.error.code)
          ? errorMessages[result.error.code]
          : 'Unable to update salary. Please try again.',
        invalidAmount: result.error.field === 'salaryAmount',
      });
      return;
    }
    setAmount(result.salaryAmount);
    setCurrentSalary(result.salaryAmount);
    setState({ status: 'success' });
    onSaved();
  }

  return (
    <form aria-label="Edit salary" onSubmit={submit} className="salary-edit-form">
      <h2 tabIndex={-1}>
        Edit salary for {employee.name} ({employee.employeeId})
      </h2>
      <p>Currency: {employee.currency}</p>
      <p>Current annual salary: {currentSalary}</p>
      {saving && <p role="status">Saving salary…</p>}
      {state.status === 'success' && (
        <p role="status">
          Salary updated for {employee.employeeId}: {employee.currency} {currentSalary}.
        </p>
      )}
      {error && (
        <p role="alert" id="salary-update-error">
          {error.message}
        </p>
      )}
      <fieldset disabled={saving}>
        <legend className="visually-hidden">Salary details</legend>
        <div className="creation-fields">
          <label>
            New annual salary
            <input
              required
              type="text"
              inputMode="decimal"
              value={amount}
              aria-invalid={error?.invalidAmount || undefined}
              aria-describedby={
                error?.invalidAmount ? 'salary-update-error' : 'salary-edit-guidance'
              }
              onChange={(event) => {
                setAmount(event.target.value);
                setState({ status: 'idle' });
              }}
            />
          </label>
        </div>
        <p id="salary-edit-guidance">
          Enter a positive annual base salary with at most two decimal places, without commas.
        </p>
        <div className="salary-edit-actions">
          <button type="submit">Save salary</button>
          <button type="button" onClick={onCancel}>
            {state.status === 'success' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
