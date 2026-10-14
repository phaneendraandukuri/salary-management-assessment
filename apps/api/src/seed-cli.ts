import type { Pool } from 'pg';
import { createPool } from './database.js';
import { seedEmployees } from './seed.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required for seeding');
  process.exitCode = 1;
} else {
  let pool: Pool | undefined;
  try {
    const target = new URL(connectionString);
    if (
      !['postgres:', 'postgresql:'].includes(target.protocol) ||
      !target.hostname ||
      target.pathname.length < 2
    ) {
      throw new Error('An explicit PostgreSQL host and database are required');
    }
    console.log(`Seed target: ${target.hostname}:${target.port || '5432'}${target.pathname}`);
    pool = createPool(connectionString);
    const result = await seedEmployees(pool);
    console.log(
      `Seed complete: ${result.inserted} inserted; ${result.skipped} skipped/conflicting IDs (existing records preserved)`,
    );
  } catch {
    console.error('Seed failed; check the database connection and applied migrations');
    process.exitCode = 1;
  } finally {
    try {
      await pool?.end();
    } catch {
      console.error('Seed pool shutdown failed');
      process.exitCode = 1;
    }
  }
}
