import type { SalaryCurrency } from './salary.js';
import { validateSalary } from './salary.js';

export type Employee = {
  employeeId: string;
  name: string;
  email: string;
  department: string;
  role: string;
  country: string;
  currency: SalaryCurrency;
  salaryAmount: string;
};

export type EmployeeField = keyof Employee | 'employee';

export type EmployeeValidationResult =
  | { ok: true; employee: Employee }
  | {
      ok: false;
      error: {
        field: EmployeeField;
        code: 'invalid_field' | 'invalid_email' | 'invalid_amount' | 'unsupported_currency';
      };
    };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateEmployee(input: unknown): EmployeeValidationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: { field: 'employee', code: 'invalid_field' } };
  }

  const raw = input as Record<string, unknown>;
  const fields = {
    employeeId: text(raw.employeeId),
    name: text(raw.name),
    email: text(raw.email),
    department: text(raw.department),
    role: text(raw.role),
    country: text(raw.country),
  };

  for (const field of Object.keys(fields) as (keyof typeof fields)[]) {
    if (!fields[field]) {
      return { ok: false, error: { field, code: 'invalid_field' } };
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    return { ok: false, error: { field: 'email', code: 'invalid_email' } };
  }

  const salary = validateSalary(raw.salaryAmount, raw.currency);
  if (!salary.ok) {
    return {
      ok: false,
      error: {
        field: salary.error === 'unsupported_currency' ? 'currency' : 'salaryAmount',
        code: salary.error,
      },
    };
  }

  return {
    ok: true,
    employee: { ...fields, currency: salary.salary.currency, salaryAmount: salary.salary.amount },
  };
}
