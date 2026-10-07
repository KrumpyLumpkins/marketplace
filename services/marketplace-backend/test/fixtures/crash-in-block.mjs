import { writeSync } from 'node:fs';
import { Store } from '../../src/store.mjs';
const store = new Store(process.argv[2]);
store.applyBlock({ number: 1, hash: '0x1', parentHash: '0x0', timestamp: 1, events: [] });
store.project = () => {
  // Pause after an uncommitted mutation; parent kills this OS process.
  store.put('crash-probe', 'partial', { value: 'uncommitted' }, 2);
  writeSync(1, 'inside-transaction\n');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
};
store.applyBlock({ number: 2, hash: '0x2', parentHash: '0x1', timestamp: 2, events: [{ type: 'probe' }] });
