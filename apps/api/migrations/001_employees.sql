CREATE TABLE IF NOT EXISTS employees (
  employee_id TEXT COLLATE "C" PRIMARY KEY CHECK (employee_id ~ '[^[:space:]]'),
  name TEXT NOT NULL CHECK (name ~ '[^[:space:]]'),
  email TEXT NOT NULL CHECK (email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  department TEXT NOT NULL CHECK (department ~ '[^[:space:]]'),
  role TEXT NOT NULL CHECK (role ~ '[^[:space:]]'),
  country TEXT NOT NULL CHECK (country ~ '[^[:space:]]'),
  currency TEXT NOT NULL CHECK (currency IN ('INR', 'USD', 'EUR', 'GBP')),
  salary_amount NUMERIC NOT NULL CHECK (
    salary_amount > 0
    AND salary_amount NOT IN ('Infinity'::NUMERIC, '-Infinity'::NUMERIC, 'NaN'::NUMERIC)
    AND scale(salary_amount) <= 2
  )
);
