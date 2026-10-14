import type { Employee } from './employee.js';
import { validateEmployee } from './employee.js';
import type { SalaryCurrency } from './salary.js';

const markets: { country: string; currency: SalaryCurrency; minimum: number; maximum: number }[] = [
  { country: 'India', currency: 'INR', minimum: 400000, maximum: 4000000 },
  { country: 'United States', currency: 'USD', minimum: 40000, maximum: 180000 },
  { country: 'Germany', currency: 'EUR', minimum: 35000, maximum: 150000 },
  { country: 'United Kingdom', currency: 'GBP', minimum: 30000, maximum: 130000 },
];
const departments = ['Engineering', 'Sales', 'Finance', 'HR', 'Operations'];
const roles = ['Specialist', 'Analyst', 'Manager', 'Lead'];
const firstNames = ['Asha', 'Alex', 'Sam', 'Maya', 'Robin', 'Leo', 'Nina', 'Jamie'];
const lastNames = ['Patel', 'Smith', 'Meyer', 'Taylor', 'Shah', 'Jones', 'Weber'];

export function generateSeedEmployees(): Employee[] {
  return Array.from({ length: 10000 }, (_, index) => {
    const ordinal = index + 1;
    const suffix = String(ordinal).padStart(5, '0');
    const market = markets[index % markets.length];
    const whole = market.minimum + ((ordinal * 7919) % (market.maximum - market.minimum + 1));
    const fraction = String((ordinal * 37) % 100).padStart(2, '0');
    const result = validateEmployee({
      employeeId: `SEED-${suffix}`,
      name: `Synthetic ${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length) % lastNames.length]}`,
      email: `seed-${suffix}@example.test`,
      department: departments[Math.floor(index / markets.length) % departments.length],
      role: roles[Math.floor(index / (markets.length * departments.length)) % roles.length],
      country: market.country,
      currency: market.currency,
      salaryAmount: `${whole}.${fraction}`,
    });
    if (!result.ok) throw new Error(`Invalid synthetic employee ${ordinal}: ${result.error.code}`);
    return result.employee;
  });
}
