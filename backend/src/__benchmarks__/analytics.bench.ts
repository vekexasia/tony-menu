import { bench, describe } from 'vitest';
import { createApp } from '../app';
import { computeLeaderboardMovement, periodToMs, type ViewedItemRaw } from '../lib/analytics';
import { validateImage } from '../lib/image';
import { checkRateLimit } from '../lib/rate-limit';
import { benchEnv, seedBenchRestaurant, silenceRequestLogger } from './fixtures';

function makeLeaderboard(size: number, offset: number): ViewedItemRaw[] {
  return Array.from({ length: size }, (_, i) => ({
    entryId: `entry-${(i + offset) % size}`,
    name: `Dish ${i}`,
    viewCount: size - i,
    categoryId: `cat-${i % 12}`,
    categoryName: `Category ${i % 12}`,
    image: null,
  }));
}

const current = makeLeaderboard(250, 0);
const previous = makeLeaderboard(250, 37);

describe('analytics dashboard', () => {
  bench('computeLeaderboardMovement - 250 items vs 250 items', () => {
    computeLeaderboardMovement(current, previous);
  });

  bench('periodToMs', () => {
    periodToMs('24h');
    periodToMs('7d');
    periodToMs('30d');
    periodToMs('all');
  });
});

describe('rate limiting', () => {
  // A generous limit keeps the benchmark on the "allowed" branch: the sliding
  // window is re-filtered on every call, which is the cost we care about.
  bench('checkRateLimit - sliding window with a warm bucket', () => {
    checkRateLimit('bench-ip', 1_000_000, 60_000);
  });
});

describe('image upload validation', () => {
  const png = new Uint8Array(512 * 1024);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const webp = new Uint8Array(512 * 1024);
  webp.set([0x52, 0x49, 0x46, 0x46], 0);
  webp.set([0x57, 0x45, 0x42, 0x50], 8);

  bench('validateImage - 512 KB PNG', () => {
    validateImage(png.buffer as ArrayBuffer);
  });

  bench('validateImage - 512 KB WebP', () => {
    validateImage(webp.buffer as ArrayBuffer);
  });
});

silenceRequestLogger();

const db = seedBenchRestaurant({ menus: 1, categories: 2, entriesPerCategory: 5 });
const env = benchEnv(db);
const app = createApp();

describe('POST /catalog/view', () => {
  // View tracking runs on every dish a diner opens: body validation, a SHA-256
  // session hash and a de-duplicating insert.
  bench('record a menu item view', async () => {
    const res = await app.fetch(
      new Request('https://bench.local/catalog/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
        body: JSON.stringify({ entryId: 'entry-0-0' }),
      }),
      env,
    );
    await res.arrayBuffer();
  });
});
