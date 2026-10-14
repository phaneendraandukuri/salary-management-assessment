import { realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hashPassword } from './hr-credentials.js';
import { readHiddenPassword } from './password-prompt.js';

export async function writePasswordHash(password: string, target: string): Promise<void> {
  if (Array.from(password).length < 12 || Buffer.byteLength(password) > 1024) {
    throw new Error('Use a password of at least 12 characters and at most 1024 bytes');
  }
  const root = await realpath(fileURLToPath(new URL('../../../', import.meta.url)));
  const destination = join(await realpath(dirname(resolve(target))), basename(target));
  const fromRoot = relative(root, destination);
  if (fromRoot !== '..' && !fromRoot.startsWith('../') && !isAbsolute(fromRoot)) {
    throw new Error('Password hash file must be outside the repository');
  }
  await writeFile(destination, `${await hashPassword(password)}\n`, { flag: 'wx', mode: 0o600 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const target = process.argv[2];
    if (!target || process.argv.length !== 3) throw new Error('Missing target');
    const password = await readHiddenPassword(process.stdin, process.stderr);
    await writePasswordHash(password, target);
    console.log(
      'Password hash written to the requested private file. Keep it out of Git and logs.',
    );
  } catch {
    console.error(
      'Password hashing failed: use an interactive terminal, a 12+ character password, and a new file outside the repository.',
    );
    process.exitCode = 1;
  }
}
