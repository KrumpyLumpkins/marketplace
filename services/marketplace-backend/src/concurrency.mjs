/** Bounded I/O concurrency, preserving input order. */
export async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0,
    failed = false,
    failure;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (!failed && next < items.length) {
        const i = next++;
        try {
          results[i] = await fn(items[i], i);
        } catch (error) {
          if (!failed) { failure = error; failed = true; }
        }
      }
    }),
  );
  if (failed) throw failure;
  return results;
}
