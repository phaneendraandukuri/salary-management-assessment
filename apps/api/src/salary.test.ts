import { describe, expect, it } from 'vitest';
import { validateSalary } from './salary.js';

describe('validateSalary', () => {
  it.each([
    ['75000', '75000.00'],
    ['75000.5', '75000.50'],
    ['75000.50', '75000.50'],
    ['00100.5', '100.50'],
    ['000.01', '0.01'],
    ['0000001', '1.00'],
  ])('normalizes %s to %s', (amount, normalized) => {
    expect(validateSalary(amount, 'INR')).toEqual({
      ok: true,
      salary: { amount: normalized, currency: 'INR' },
    });
  });

  it.each(['INR', 'USD', 'EUR', 'GBP'])('accepts %s without changing currency', (currency) => {
    expect(validateSalary('100', currency)).toEqual({
      ok: true,
      salary: { amount: '100.00', currency },
    });
  });

  it.each(['JPY', 'usd', ' USD ', '', null, undefined, 123, {}, ['USD']])(
    'rejects unsupported currency %j',
    (currency) => {
      expect(validateSalary('100', currency)).toEqual({
        ok: false,
        error: 'unsupported_currency',
      });
    },
  );

  it.each([
    '',
    '-1',
    '+1',
    '1e3',
    '1E3',
    '1,000',
    '.50',
    '1.',
    '1.234',
    '1.2.3',
    ' 1',
    '1 ',
    '1\n',
    '1\r\n',
    '\t1',
    '1 0',
    'NaN',
    'Infinity',
    'abc',
    '١٠',
    100,
    null,
    undefined,
    {},
    ['100'],
    true,
  ])('rejects invalid amount %j', (amount) => {
    expect(validateSalary(amount, 'INR')).toEqual({
      ok: false,
      error: 'invalid_amount',
    });
  });

  it.each(['0', '0.0', '0.00', '000.00'])('rejects zero amount %s', (amount) => {
    expect(validateSalary(amount, 'INR')).toEqual({
      ok: false,
      error: 'invalid_amount',
    });
  });

  it.each(['0.01', '0.1', '1'])('accepts positive boundary amount %s', (amount) => {
    expect(validateSalary(amount, 'INR').ok).toBe(true);
  });

  it.each([
    '9007199254740993.01',
    '1234567890123456789012345678901234567890.99',
    `${'9'.repeat(1000)}.01`,
  ])('preserves every digit of a large amount (case %#)', (amount) => {
    expect(validateSalary(amount, 'USD')).toEqual({
      ok: true,
      salary: { amount, currency: 'USD' },
    });
  });
});
