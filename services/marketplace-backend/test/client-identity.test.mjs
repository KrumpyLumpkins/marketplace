import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClientIdentity } from '../src/client-identity.mjs';

test('direct callers cannot spoof forwarding headers; only a trusted sanitizing proxy supplies identity', async () => {
  const identity = createClientIdentity({ trustedProxyAddresses: ['127.0.0.1'] });
  assert.equal(await identity({ socket: { remoteAddress: '198.51.100.4' }, headers: { 'x-forwarded-for': '1.1.1.1' } }), '198.51.100.4');
  assert.equal(await identity({ socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: { 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '1.1.1.1' } }), '203.0.113.9');
  assert.equal(await identity({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': 'bad' } }), '127.0.0.1');
});
test('Railway trusts only the configured frontend DNS identity and a single edge IP', async () => {
  const identity = createClientIdentity({ trustedProxyHosts: ['web.railway.internal'] }, async () => [{ address: 'fd12::2' }]);
  assert.equal(await identity({ socket: { remoteAddress: 'fd12::2' }, headers: { 'x-real-ip': '203.0.113.1', 'x-forwarded-for': '1.1.1.1' } }), '203.0.113.1');
  assert.equal(await identity({ socket: { remoteAddress: 'fd12::3' }, headers: { 'x-real-ip': '203.0.113.1' } }), 'fd12::3');
  assert.equal(await identity({ socket: { remoteAddress: 'fd12::2' }, headers: { 'x-real-ip': '1.1.1.1, 2.2.2.2' } }), 'fd12::2');
});
test('IPv6 spellings share an identity and DNS failures never authorize headers', async () => {
  const identity = createClientIdentity({ trustedProxyHosts: ['web.internal'] }, async () => { throw Error('DNS unavailable'); });
  assert.equal(await identity({ socket: { remoteAddress: '2001:db8:0:0::1' }, headers: { 'x-forwarded-for': '1.1.1.1' } }), '2001:db8::1');
});

test('loopback forwarding is not trusted unless explicitly configured', async () => {
 const identity=createClientIdentity({});
 assert.equal(await identity({socket:{remoteAddress:'127.0.0.1'},headers:{'x-real-ip':'1.1.1.1'}}),'127.0.0.1');
});
