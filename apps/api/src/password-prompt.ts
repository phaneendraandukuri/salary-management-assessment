import type { ReadStream } from 'node:tty';
import type { Writable } from 'node:stream';

export async function readHiddenPassword(input: ReadStream, output: Writable): Promise<string> {
  if (!input.isTTY) throw new Error('Password entry requires an interactive terminal');
  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw;
    let value = '';
    function finish(error?: Error) {
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('error', onError);
      input.setRawMode(wasRaw);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
    }
    function onEnd() {
      finish(new Error('Password entry ended before confirmation'));
    }
    function onError() {
      finish(new Error('Password entry failed'));
    }
    function onData(chunk: string) {
      for (const character of chunk) {
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\x03') {
          finish(new Error('Password entry cancelled'));
          return;
        }
        if (character === '\x7f' || character === '\b')
          value = Array.from(value).slice(0, -1).join('');
        else if (character >= ' ') value += character;
        if (Buffer.byteLength(value) > 1024) {
          finish(new Error('Password entry exceeds 1024 bytes'));
          return;
        }
      }
    }
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.on('data', onData);
    input.once('end', onEnd);
    input.once('error', onError);
    output.write('HR password (hidden): ');
    input.resume();
  });
}
