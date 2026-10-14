import fs, { type Stats } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import { startupConfig } from './startup-config.js';

it('defaults to port 3000 without serving frontend files in development', () => {
  expect(startupConfig({})).toEqual({ port: 3000 });
});
it.each(['0', '3001', '65535'])('accepts explicit port %s', (PORT) => {
  expect(startupConfig({ PORT })).toEqual({ port: Number(PORT) });
});
it.each([
  '',
  ' ',
  ' 3000',
  '3000 ',
  '-1',
  '65536',
  '1.5',
  '3e3',
  'abc',
  'Infinity',
  '9007199254740992',
])('rejects invalid port %j clearly', (PORT) => {
  expect(() => startupConfig({ PORT })).toThrow('PORT must be an integer from 0 to 65535');
});

it('resolves production assets relative to the module and checks required files', () => {
  const stat = vi
    .spyOn(fs, 'statSync')
    .mockReturnValue({ isFile: () => true, isDirectory: () => true } as Stats);
  try {
    const frontendDirectory = fileURLToPath(new URL('../../web/dist/', import.meta.url));
    expect(startupConfig({ NODE_ENV: 'production' })).toEqual({ port: 3000, frontendDirectory });
    expect(stat).toHaveBeenCalledWith(join(frontendDirectory, 'index.html'));
    expect(stat).toHaveBeenCalledWith(join(frontendDirectory, 'assets'));
  } finally {
    stat.mockRestore();
  }
});

it.each(['missing', 'not-files'])('fails clearly when production assets are %s', (mode) => {
  const stat = vi.spyOn(fs, 'statSync');
  if (mode === 'missing')
    stat.mockImplementation(() => {
      throw new Error('ENOENT');
    });
  else stat.mockReturnValue({ isFile: () => false, isDirectory: () => false } as Stats);
  try {
    expect(() => startupConfig({ NODE_ENV: 'production' })).toThrow(
      'Production frontend build is missing; run npm run build',
    );
    expect(startupConfig({ NODE_ENV: 'development' })).toEqual({ port: 3000 });
  } finally {
    stat.mockRestore();
  }
});
