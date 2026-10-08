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
  return async (url, options) => {
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
}
