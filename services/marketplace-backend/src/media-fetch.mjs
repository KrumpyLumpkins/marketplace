// Bound origin pressure independently of parallel RPC/database work. Queued
// requests share a host cooldown; retries never bypass that same queue.
export function createMediaFetcher(
  fetcher,
  {
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  const hosts = new Map();
  const fetchOrigin = async (url, options) => {
    const host = new URL(url).host;
    let gate = hosts.get(host);
    if (!gate) {
      gate = { next: 0, turn: Promise.resolve() };
      hosts.set(host, gate);
    }
    for (let attempt = 0; ; attempt++) {
      gate.turn = gate.turn.then(async () => {
        // Another in-flight response can extend the cooldown while we sleep.
        while (gate.next > now()) await sleep(gate.next - now());
        gate.next = now() + 1100;
      });
      await gate.turn;
      try {
        return await fetcher(url, options);
      } catch (error) {
        if (error.status !== 429) throw error;
        gate.next = Math.max(
          gate.next,
          now() + Math.min(60000, Math.max(5000, error.retryAfterMs ?? 0)),
        );
        if (attempt >= 2) throw error;
      }
    }
  };
  const cache = new Map(),
    pending = new Map();
  let cachedBytes = 0;
  return async (url, options) => {
    const immutable =
      /^https?:\/\/[^/]+\/ipfs\/(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})(\/|$)/.test(
        url,
      );
    if (!immutable) return fetchOrigin(url, options);
    const key = url + ":" + (options?.maxBytes ?? 0);
    if (cache.has(key)) {
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      return value;
    }
    if (pending.has(key)) return pending.get(key);
    const request = fetchOrigin(url, options)
      .then((value) => {
        const size = value.bytes.length;
        if (size <= 32 * 1024 * 1024) {
          while (
            cache.size &&
            (cachedBytes + size > 32 * 1024 * 1024 || cache.size >= 128)
          ) {
            const first = cache.keys().next().value;
            cachedBytes -= cache.get(first).bytes.length;
            cache.delete(first);
          }
          cache.set(key, value);
          cachedBytes += size;
        }
        return value;
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
