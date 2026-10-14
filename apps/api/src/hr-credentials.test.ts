import { randomBytes } from 'node:crypto';
import { beforeAll, expect, it } from 'vitest';
import { credentialConfig, hashPassword, verifyPassword } from './hr-credentials.js';

const password = randomBytes(24).toString('base64url');
const secret = randomBytes(32).toString('base64url');
let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword(password);
});

it('verifies the correct password but rejects a different password', async () => {
  expect(await verifyPassword(password, passwordHash)).toBe(true);
  expect(await verifyPassword(randomBytes(24).toString('base64url'), passwordHash)).toBe(false);
});

it('uses a random salt and the fixed scrypt parameters', async () => {
  const second = await hashPassword(password);
  expect(second === passwordHash).toBe(false);
  expect(/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(passwordHash)).toBe(true);
});

it('rejects malformed hashes without attempting unsafe parameter settings', async () => {
  for (const hash of ['', 'not-a-hash', passwordHash.replace('32768', '1048576')]) {
    expect(await verifyPassword(password, hash)).toBe(false);
  }
});

it('accepts valid configuration without changing credential values', () => {
  const result = credentialConfig({
    HR_USERNAME: 'hr',
    HR_PASSWORD_HASH: passwordHash,
    SESSION_SECRET: secret,
  });
  expect(result.username).toBe('hr');
  expect(result.passwordHash === passwordHash).toBe(true);
  expect(result.sessionSecret === secret).toBe(true);
});

it('rejects missing or invalid configuration with messages containing no secret values', () => {
  const valid = { HR_USERNAME: 'hr', HR_PASSWORD_HASH: passwordHash, SESSION_SECRET: secret };
  for (const env of [
    {},
    { ...valid, HR_USERNAME: '  ' },
    { ...valid, HR_PASSWORD_HASH: 'invalid' },
    { ...valid, SESSION_SECRET: 'short' },
  ]) {
    let message = '';
    try {
      credentialConfig(env);
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message.startsWith('HR_USERNAME, HR_PASSWORD_HASH and SESSION_SECRET')).toBe(true);
    expect(message.includes(secret)).toBe(false);
    expect(message.includes(passwordHash) && passwordHash.length > 0).toBe(false);
  }
});
