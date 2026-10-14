CREATE TABLE IF NOT EXISTS salary_history (
  history_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id TEXT COLLATE "C" NOT NULL REFERENCES employees(employee_id),
  currency TEXT NOT NULL CHECK (currency IN ('INR', 'USD', 'EUR', 'GBP')),
  old_amount NUMERIC NOT NULL CHECK (
    old_amount > 0
    AND old_amount NOT IN ('Infinity'::NUMERIC, '-Infinity'::NUMERIC, 'NaN'::NUMERIC)
    AND scale(old_amount) <= 2
  ),
  new_amount NUMERIC NOT NULL CHECK (
    new_amount > 0
    AND new_amount NOT IN ('Infinity'::NUMERIC, '-Infinity'::NUMERIC, 'NaN'::NUMERIC)
    AND scale(new_amount) <= 2
  ),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (old_amount <> new_amount)
);

CREATE INDEX IF NOT EXISTS salary_history_employee_order_idx
  ON salary_history (employee_id, changed_at DESC, history_id DESC);
