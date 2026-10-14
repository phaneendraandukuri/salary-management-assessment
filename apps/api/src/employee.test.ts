import { describe, expect, it } from 'vitest';
import { validateEmployee } from './employee.js';

const validInput = {
  employeeId: ' ACME-001 ',
  name: ' Alex Example ',
  email: ' alex@example.test ',
  department: ' Engineering ',
  role: ' Developer ',
  country: ' India ',
  currency: 'INR',
  salaryAmount: '00100.5',
};

describe('validateEmployee', () => {
  it('trims employee text fields and reuses salary normalization', () => {
    expect(validateEmployee(validInput)).toEqual({
      ok: true,
      employee: {
        employeeId: 'ACME-001',
        name: 'Alex Example',
        email: 'alex@example.test',
        department: 'Engineering',
        role: 'Developer',
        country: 'India',
        currency: 'INR',
        salaryAmount: '100.50',
      },
    });
  });

  for (const field of ['employeeId', 'name', 'email', 'department', 'role', 'country']) {
    it.each([undefined, null, 123, '', ' \t\n ', {}, []].map((value) => ({ value })))(
      `rejects invalid ${field}: %j`,
      ({ value }) => {
        expect(validateEmployee({ ...validInput, [field]: value })).toEqual({
          ok: false,
          error: { field, code: 'invalid_field' },
        });
      },
    );
  }

  it.each(['alex', 'alex@', '@example.test', 'alex@example', 'alex example@test.com', 'a@@b.com'])(
    'rejects malformed email %s',
    (email) => {
      expect(validateEmployee({ ...validInput, email })).toEqual({
        ok: false,
        error: { field: 'email', code: 'invalid_email' },
      });
    },
  );

  it.each([null, undefined, 'employee', 123, []].map((input) => ({ input })))(
    'rejects non-object input $input',
    ({ input }) => {
      expect(validateEmployee(input)).toEqual({
        ok: false,
        error: { field: 'employee', code: 'invalid_field' },
      });
    },
  );

  it.each([
    { salaryAmount: '0', field: 'salaryAmount', code: 'invalid_amount' },
    { salaryAmount: '1.234', field: 'salaryAmount', code: 'invalid_amount' },
    { salaryAmount: 100, field: 'salaryAmount', code: 'invalid_amount' },
    { currency: 'JPY', field: 'currency', code: 'unsupported_currency' },
  ])('propagates salary validation error $code', ({ field, code, ...override }) => {
    expect(validateEmployee({ ...validInput, ...override })).toEqual({
      ok: false,
      error: { field, code },
    });
  });

  it('preserves employee ID casing and exact salary digits', () => {
    const salaryAmount = '9007199254740993.01';
    const result = validateEmployee({ ...validInput, employeeId: 'acme-001', salaryAmount });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.employee.employeeId).toBe('acme-001');
      expect(result.employee.salaryAmount).toBe(salaryAmount);
    }
  });
});
