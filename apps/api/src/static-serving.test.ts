import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

let root: string;
let frontend: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'acme-static-'));
  frontend = join(root, 'dist');
  await mkdir(join(frontend, 'assets'), { recursive: true });
  await writeFile(join(frontend, 'index.html'), '<!doctype html><title>Built ACME UI</title>');
  await writeFile(join(frontend, 'assets', 'app.js'), 'console.log("built asset");');
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

it('serves the built frontend HTML at /', async () => {
  const response = await request(createApp(undefined, frontend)).get('/');
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('text/html');
  expect(response.text).toContain('Built ACME UI');
});
it('serves built assets with their proper content type', async () => {
  const response = await request(createApp(undefined, frontend)).get('/assets/app.js');
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/javascript/);
  expect(response.text).toBe('console.log("built asset");');
});
it('does not serve the frontend without explicit production configuration', async () => {
  expect((await request(createApp()).get('/')).status).toBe(404);
});
it('preserves health and employee API responses with static serving configured', async () => {
  const page = { employees: [], total: 0, page: 1, pageSize: 25 };
  const app = createApp(
    {
      createEmployee: vi.fn(),
      listEmployees: vi.fn().mockResolvedValue(page),
      updateSalary: vi.fn(),
      listSalaryHistory: vi.fn(),
    },
    frontend,
  );
  expect((await request(app).get('/health')).body).toEqual({ status: 'ok' });
  expect((await request(app).get('/api/employees')).body).toEqual(page);
  expect((await request(app).get('/api/employees?page=0')).body).toEqual({
    error: { field: 'page', code: 'invalid_pagination' },
  });
});

it.each(['/api/trap', '/API/trap', '/%61pi/trap', '/api%2ftrap', '/assets/%2e%2e%2fapi%2ftrap'])(
  'never serves a build file under reserved API path %s',
  async (path) => {
    await mkdir(join(frontend, 'api'), { recursive: true });
    await writeFile(join(frontend, 'api', 'trap'), 'API FILE MUST NOT BE SERVED');
    const response = await request(createApp(undefined, frontend)).get(path);
    expect(response.status).toBe(404);
    expect(response.text).not.toContain('API FILE MUST NOT BE SERVED');
    expect(response.text).not.toContain('Built ACME UI');
  },
);

it.each([
  '/src/app.ts',
  '/apps/api/src/app.ts',
  '/.env',
  '/.env.example',
  '/migrations/001_employees.sql',
  '/apps/api/migrations/001_employees.sql',
  '/assets/%2e%2e%2f%2e%2e%2f.env',
  '/%2e%2e%2fsrc%2fapp.ts',
  '/assets/missing.js',
  '/not-a-client-route',
])('returns 404 without exposing source/env/migration/missing files for %s', async (path) => {
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'migrations'), { recursive: true });
  await writeFile(join(root, 'src', 'app.ts'), 'PRIVATE SOURCE');
  await writeFile(join(root, '.env'), 'PRIVATE ENV');
  await writeFile(join(root, 'migrations', '001_employees.sql'), 'PRIVATE SQL');
  await writeFile(join(frontend, '.env'), 'PRIVATE BUILD DOTFILE');
  const response = await request(createApp(undefined, frontend)).get(path);
  expect(response.status).toBe(404);
  expect(response.text).not.toMatch(/PRIVATE|Built ACME UI/);
});
