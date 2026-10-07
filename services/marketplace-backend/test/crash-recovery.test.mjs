import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';

test('SIGKILL during a SQLite block transaction preserves only the prior checkpoint', { timeout: 10000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'realms-crash-')), path = join(dir, 'chain.sqlite');
  const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/crash-in-block.mjs', import.meta.url)), path], { stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  try {
    const [data] = await once(child.stdout, 'data', { signal: t.signal });
    assert.match(data.toString(), /inside-transaction/);
    child.kill('SIGKILL'); await closed;
    const recovered = new Store(path);
    try {
      assert.equal(recovered.head().number, 1);
      assert.equal(recovered.get('crash-probe', 'partial'), null);
      assert.equal(recovered.db.prepare('SELECT COUNT(*) AS n FROM events').get().n, 0);
      assert.equal(recovered.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      recovered.applyBlock({ number: 2, hash: '0x2', parentHash: '0x1', timestamp: 2, events: [] });
      assert.equal(recovered.head().number, 2);
    } finally { recovered.close(); }
  } finally { child.kill('SIGKILL'); await closed; rmSync(dir, { recursive: true, force: true }); }
});
