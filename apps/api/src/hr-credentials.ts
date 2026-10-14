import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export type HrCredentials = { username: string; passwordHash: string; sessionSecret: string };

const hashPattern = /^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export function credentialConfig(env: NodeJS.ProcessEnv): HrCredentials {
  const username = env.HR_USERNAME;
  const passwordHash = env.HR_PASSWORD_HASH;
  const sessionSecret = env.SESSION_SECRET;
  if (
    !username ||
    username.trim() !== username ||
    username.length > 100 ||
    !passwordHash ||
    !hashPattern.test(passwordHash) ||
    !sessionSecret ||
    !/^[A-Za-z0-9_-]{43,}$/.test(sessionSecret)
  ) {
    throw new Error(
      'HR_USERNAME, HR_PASSWORD_HASH and SESSION_SECRET must contain valid authentication configuration',
    );
  }
  return { username, passwordHash, sessionSecret };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$32768$8$3$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parts = hashPattern.exec(hash);
  if (!parts) return false;
  const key = await derive(password, Buffer.from(parts[1]!, 'hex'));
  return timingSafeEqual(key, Buffer.from(parts[2]!, 'hex'));
}
