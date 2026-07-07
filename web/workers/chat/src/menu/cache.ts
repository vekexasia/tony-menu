import type { Env, MenuDataCache } from '../types';
import { fetchMenuFromD1 } from './d1';

const CACHE_TTL = 3600; // 1 hour
const CACHE_KEY = 'menu:v1';

// Module-level in-memory cache — survives across requests within the same worker instance.
// Eliminates the KV round-trip (~10ms) for warm instances. Stale data is acceptable:
// menu changes are rare and owners trigger /refresh-menu which clears KV so the next
// cold instance picks up fresh data.
let memCache: MenuDataCache | null = null;

export async function getMenuData(env: Env): Promise<MenuDataCache> {
  // 1. In-memory (fastest, ~0ms)
  if (memCache) return memCache;

  // 2. KV (~10ms); if KV is down, fall through to D1 instead of crashing chat.
  try {
    const cached = await env.MENU_CACHE.get(CACHE_KEY, 'json');
    if (cached) {
      memCache = cached as MenuDataCache;
      return memCache;
    }
  } catch (error) {
    console.warn('[MENU CACHE] get failed:', error);
  }

  // 3. D1 (~20ms) — only on cold start or after invalidation
  const data = await fetchMenuFromD1(env);
  memCache = data;
  try {
    await env.MENU_CACHE.put(CACHE_KEY, JSON.stringify(data), { expirationTtl: CACHE_TTL });
  } catch (error) {
    console.warn('[MENU CACHE] put failed:', error);
  }

  return data;
}

export async function invalidateCache(env: Env): Promise<void> {
  memCache = null;
  try {
    await env.MENU_CACHE.delete(CACHE_KEY);
  } catch (error) {
    console.warn('[MENU CACHE] delete failed:', error);
  }
}
