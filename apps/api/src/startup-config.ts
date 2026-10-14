import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function startupConfig(env: NodeJS.ProcessEnv): {
  port: number;
  frontendDirectory?: string;
} {
  const rawPort = env.PORT ?? '3000';
  const port = Number(rawPort);
  if (!/^[0-9]+$/.test(rawPort) || !Number.isSafeInteger(port) || port > 65535) {
    throw new Error('PORT must be an integer from 0 to 65535');
  }
  if (env.NODE_ENV !== 'production') return { port };
  const frontendDirectory = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  try {
    if (
      !fs.statSync(join(frontendDirectory, 'index.html')).isFile() ||
      !fs.statSync(join(frontendDirectory, 'assets')).isDirectory()
    )
      throw new Error('Missing assets');
  } catch {
    throw new Error('Production frontend build is missing; run npm run build');
  }
  return { port, frontendDirectory };
}
