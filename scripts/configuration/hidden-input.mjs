import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';

export async function hiddenInput(label) {
  if (!process.stdin.isTTY) {
    let value = '';
    for await (const chunk of process.stdin) {
      value += chunk;
      if (value.length > 1024 * 1024) throw new Error('Input is too large.');
    }
    return value.trim();
  }
  const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const terminal = createInterface({ input: process.stdin, output, terminal: true });
  const abort = new AbortController();
  terminal.on('SIGINT', () => abort.abort());
  process.stdout.write(label);
  try { return (await terminal.question('', { signal: abort.signal })).trim(); }
  finally { terminal.close(); process.stdout.write('\n'); }
}
