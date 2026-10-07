import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supervise } from '../src/supervisor.mjs';

test('an unexpected child exit stops its peers and fails the service', async () => {
  const group = supervise([
    { name: 'worker', command: process.execPath, args: ['-e', 'setTimeout(()=>process.exit(7),100)'] },
    { name: 'api', command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] },
  ], { graceMs: 200 });
  assert.equal(await group.done, 1);
  assert.ok(group.children.every(child => child.exitCode !== null || child.signalCode !== null));
});

test('shutdown escalates for a child that ignores SIGTERM', async () => {
  const group = supervise([
    { name: 'stuck', command: process.execPath, args: ['-e', 'process.on("SIGTERM",()=>{}); console.log("ready"); setInterval(()=>{},1000)'] },
  ], { graceMs: 50, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(resolve => group.children[0].stdout.once('data', resolve));
  group.stop();
  assert.equal(await group.done, 0);
  assert.equal(group.children[0].signalCode, 'SIGKILL');
});

test('a child spawn failure terminates the service', async () => {
  const group = supervise([{ name: 'bad', command: '/does-not-exist/marketplace', args: [] }]);
  assert.equal(await group.done, 1);
});
