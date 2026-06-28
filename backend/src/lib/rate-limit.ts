interface RateLimitEntry {
  timestamps: number[];
}

// ponytail: per-isolate in-memory store, not distributed. Each Worker isolate keeps
// its own counter, so the effective limit scales with isolate count. Upgrade path:
// back this with a Durable Object or Workers KV if a global limit becomes required.
const store = new Map<string, RateLimitEntry>();

let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 300_000;

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

/**
 * Sliding window rate limiter. Returns 429 Response if exceeded, null otherwise.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Response | null {
  const now = Date.now();
  cleanup(windowMs);

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  const cutoff = now - windowMs;
  entry.timestamps = entry.timestamps.filter(t => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } },
    );
  }

  entry.timestamps.push(now);
  return null;
}
