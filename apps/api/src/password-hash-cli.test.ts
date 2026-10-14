import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, stat, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { writePasswordHash } from './password-hash-cli.js';
import { verifyPassword } from './hr-credentials.js';

let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'acme-auth-hash-'));
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

it('writes only a verifiable hash to a new private file outside the repository', async () => {
  const password = randomBytes(24).toString('base64url');
  const target = join(directory, 'hash');
  await writePasswordHash(password, target);
  const value = await readFile(target, 'utf8');
  expect(value.includes(password)).toBe(false);
  expect(await verifyPassword(password, value.trim())).toBe(true);
  expect((await stat(target)).mode & 0o777).toBe(0o600);
  await expect(writePasswordHash(password, target)).rejects.toThrow();
});

it('rejects short passwords and paths inside the repository, including symlinked parents', async () => {
  const password = randomBytes(24).toString('base64url');
  await expect(writePasswordHash('short', join(directory, 'short'))).rejects.toThrow();
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  await expect(
    writePasswordHash(password, join(root, 'private-hash-must-not-be-written')),
  ).rejects.toThrow();
  await symlink(root, join(directory, 'repository'));
  await expect(
    writePasswordHash(password, join(directory, 'repository', 'private-hash-must-not-be-written')),
  ).rejects.toThrow();
});
