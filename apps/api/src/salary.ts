export type SalaryCurrency = 'INR' | 'USD' | 'EUR' | 'GBP';

export type SalaryValidationResult =
  | { ok: true; salary: { amount: string; currency: SalaryCurrency } }
  | { ok: false; error: 'invalid_amount' | 'unsupported_currency' };

export function validateSalary(amount: unknown, currency: unknown): SalaryValidationResult {
  if (currency !== 'INR' && currency !== 'USD' && currency !== 'EUR' && currency !== 'GBP') {
    return { ok: false, error: 'unsupported_currency' };
  }

  if (
    typeof amount !== 'string' ||
    amount.trim() !== amount ||
    !/^[0-9]+(?:\.[0-9]{1,2})?$/.test(amount)
  ) {
    return { ok: false, error: 'invalid_amount' };
  }

  if (!/[1-9]/.test(amount)) {
    return { ok: false, error: 'invalid_amount' };
  }

  const [whole, fraction = ''] = amount.split('.');
  const normalizedWhole = whole.replace(/^0+/, '') || '0';
  return {
    ok: true,
    salary: { amount: `${normalizedWhole}.${fraction.padEnd(2, '0')}`, currency },
  };
}
