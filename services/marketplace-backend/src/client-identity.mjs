import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

function normalize(value) {
  if (typeof value !== 'string' || value.includes('%') || !isIP(value)) return null;
  if (isIP(value) === 4) return value;
  const ip = new URL(`http://[${value}]`).hostname.slice(1, -1);
  const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/i.exec(ip);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return ip;
}

/** Trust only configured immediate peers, never an arbitrary forwarded address. */
export function createClientIdentity(config, resolve = lookup) {
  const hosts = config.trustedProxyHosts ?? [];
  const addresses = config.trustedProxyAddresses ?? [];
  const fixed = new Set(addresses.map(normalize).filter(Boolean));
  const header = 'x-real-ip';
  let cached = new Set(), expires = 0, resolving;
  async function peers() {
    if (!hosts.length) return fixed;
    if (Date.now() >= expires && !resolving) {
      resolving = Promise.allSettled(hosts.map(host => resolve(host, { all: true }))).then(results => {
        cached = new Set(results.flatMap(r => r.status === 'fulfilled' ? r.value.map(v => normalize(v.address)).filter(Boolean) : []));
        expires = Date.now() + 30000;
      }).finally(() => { resolving = undefined; });
    }
    if (resolving) await resolving;
    return new Set([...fixed, ...cached]);
  }
  return async req => {
    const peer = normalize(req.socket.remoteAddress) ?? 'unknown';
    if (!(await peers()).has(peer)) return peer;
    const forwarded = req.headers[header];
    if (typeof forwarded !== 'string' || forwarded.length > 2048) return peer;
    // Railway overwrites this at public ingress. Its trusted private frontend
    // relays it unchanged; never infer identity from a caller-supplied XFF chain.
    const candidate = forwarded.trim();
    return normalize(candidate) ?? peer;
  };
}
