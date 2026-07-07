import type { Env } from '../types';

const COUNTER_PREFIX = 'ai-requests';

function todayUtcKey(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${COUNTER_PREFIX}:${year}${month}${day}`;
}

function secondsUntilTomorrow(now = new Date()): number {
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.ceil((tomorrow - now.getTime()) / 1000);
}

function getDailyLimit(env: Env): number | null {
  const raw = env.DAILY_AI_REQUEST_LIMIT;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function consumeDailyAiRequest(env: Env, now = new Date()): Promise<{ allowed: boolean; limit: number | null; used: number }> {
  const limit = getDailyLimit(env);
  if (!limit) return { allowed: true, limit: null, used: 0 };

  const key = todayUtcKey(now);
  try {
    const currentRaw = await env.MENU_CACHE.get(key);
    const current = currentRaw ? Number(currentRaw) || 0 : 0;
    if (current >= limit) return { allowed: false, limit, used: current };

    const next = current + 1;
    // ponytail: this read-modify-write is a soft cap; use Redis/DB atomic increment if it must be hard.
    await env.MENU_CACHE.put(key, String(next), {
      expirationTtl: secondsUntilTomorrow(now) + 86_400,
    });
    return { allowed: true, limit, used: next };
  } catch (error) {
    console.warn('[DAILY CAP] unavailable:', error);
    return { allowed: true, limit, used: 0 };
  }
}
