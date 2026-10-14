import { createApp } from './app.js';
import { createPool } from './database.js';
import { createEmployee } from './create-employee.js';
import { listEmployees } from './list-employees.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to start the API');
}
const pool = createPool(connectionString);
const app = createApp({
  createEmployee: (input) => createEmployee(pool, input),
  listEmployees: (pagination) => listEmployees(pool, pagination),
});
const port = Number(process.env.PORT ?? 3000);

const server = app.listen(port, () => {
  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  console.log(`API listening on port ${boundPort}`);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async (error) => {
    if (error) process.exitCode = 1;
    try {
      await pool.end();
    } catch {
      console.error('Database shutdown failed');
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
server.on('error', () => {
  console.error('API listener failed');
  process.exitCode = 1;
  shutdown();
});
