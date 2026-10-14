import { expect, it, vi } from 'vitest';
import * as validation from './employee.js';
import { generateSeedEmployees } from './seed-employees.js';

it('generates exactly 10000 deterministic employees with stable unique IDs/emails', () => {
  const employees = generateSeedEmployees();
  expect(employees).toHaveLength(10000);
  expect(generateSeedEmployees()).toEqual(employees);
  expect(new Set(employees.map((row) => row.employeeId)).size).toBe(10000);
  expect(new Set(employees.map((row) => row.email)).size).toBe(10000);
  expect(employees[0].employeeId).toBe('SEED-00001');
  expect(employees.at(-1)?.employeeId).toBe('SEED-10000');
});

it('validates every generated record with the existing validator', () => {
  const spy = vi.spyOn(validation, 'validateEmployee');
  try {
    const rows = generateSeedEmployees();
    expect(spy).toHaveBeenCalledTimes(10000);
    expect(rows.every((row) => validation.validateEmployee(row).ok)).toBe(true);
    expect(
      rows.every((row) => row.name.startsWith('Synthetic ') && row.email.endsWith('@example.test')),
    ).toBe(true);
    expect(new Set(rows.map((row) => row.country)).size).toBe(4);
    expect(new Set(rows.map((row) => row.department)).size).toBe(5);
    expect(new Set(rows.map((row) => row.role)).size).toBe(4);
  } finally {
    spy.mockRestore();
  }
});

it.each([
  ['INR', 400000n, 4000000n],
  ['USD', 40000n, 180000n],
  ['EUR', 35000n, 150000n],
  ['GBP', 30000n, 130000n],
] as const)(
  'generates 2500 %s salaries within plausible demo ranges with exact cents',
  (currency, minimum, maximum) => {
    const rows = generateSeedEmployees().filter((row) => row.currency === currency);
    expect(rows).toHaveLength(2500);
    for (const row of rows) {
      expect(row.salaryAmount).toMatch(/^[1-9][0-9]*\.[0-9]{2}$/);
      const cents = BigInt(row.salaryAmount.replace('.', ''));
      expect(cents >= minimum * 100n && cents <= maximum * 100n + 99n).toBe(true);
    }
    expect(new Set(rows.map((row) => row.salaryAmount.split('.')[1])).size).toBeGreaterThan(10);
  },
);
