CREATE TABLE IF NOT EXISTS hr_sessions (
  sid varchar PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS hr_sessions_expire_idx ON hr_sessions (expire);
