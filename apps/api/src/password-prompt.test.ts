import { randomBytes } from 'node:crypto';
import { PassThrough } from 'node:stream';
import type { ReadStream } from 'node:tty';
import { expect, it, vi } from 'vitest';
import { readHiddenPassword } from './password-prompt.js';

function terminal() {
  const input = new PassThrough();
  input.on('error', () => {});
  Object.assign(input, { isTTY: true, isRaw: false, setRawMode: vi.fn() });
  const output = new PassThrough();
  let written = '';
  output.on('data', (chunk) => {
    written += String(chunk);
  });
  return { input, output, written: () => written };
}

it('reads a hidden password, handles backspace, and restores terminal mode', async () => {
  const { input, output, written } = terminal();
  const password = randomBytes(24).toString('base64url');
  const pending = readHiddenPassword(input as unknown as ReadStream, output);
  input.write(`${password}x\x7f\r`);
  expect((await pending) === password).toBe(true);
  expect(written().includes(password)).toBe(false);
  const raw = (input as unknown as ReadStream).setRawMode;
  expect(raw).toHaveBeenNthCalledWith(1, true);
  expect(raw).toHaveBeenLastCalledWith(false);
  expect(input.listenerCount('data')).toBe(0);
});

it('rejects piped input instead of accepting exposed credentials', async () => {
  await expect(
    readHiddenPassword(new PassThrough() as unknown as ReadStream, new PassThrough()),
  ).rejects.toThrow('interactive terminal');
});

it.each(['\x03', 'end', 'error'])('restores terminal mode on %s', async (event) => {
  const { input, output } = terminal();
  const pending = readHiddenPassword(input as unknown as ReadStream, output).then(
    () => '',
    (error: unknown) => (error instanceof Error ? error.message : ''),
  );
  if (event === 'end') input.emit('end');
  else if (event === 'error') input.emit('error', new Error('input failed'));
  else input.write(event);
  expect((await pending).startsWith('Password entry')).toBe(true);
  expect((input as unknown as ReadStream).setRawMode).toHaveBeenLastCalledWith(false);
  expect(input.listenerCount('data')).toBe(0);
});
