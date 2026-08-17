import { bench, describe } from 'vitest';
import { CatalogResponseSchema } from '../catalog.js';
import { computeCheckTotals, UpdateCheckBodySchema } from '../checks.js';
import { normalizeModulesConfig } from '../modules.js';
import { SubmitOrderBodySchema } from '../orders.js';
import { AnalyticsResponseSchema } from '../responses.js';
import {
  makeCatalogJson,
  makeCatalogPayload,
  makeCheckFixture,
  makeSubmitOrderPayload,
} from './fixtures.js';

// The catalog is the single hottest payload in the product: the backend
// validates it before caching it, and every diner's browser validates it again
// on page load.
const largeCatalog = makeCatalogPayload();
const largeCatalogJson = makeCatalogJson();
const smallCatalog = makeCatalogPayload({ menus: 1, categories: 2, entriesPerCategory: 4 });

describe('CatalogResponseSchema', () => {
  bench('parse - full restaurant catalog (12 categories x 25 entries)', () => {
    CatalogResponseSchema.parse(largeCatalog);
  });

  bench('parse - small catalog (2 categories x 4 entries)', () => {
    CatalogResponseSchema.parse(smallCatalog);
  });

  bench('JSON.parse + validate - what the browser does on page load', () => {
    CatalogResponseSchema.parse(JSON.parse(largeCatalogJson));
  });
});

const analyticsPayload = {
  period: '30d',
  viewedItems: Array.from({ length: 250 }, (_, i) => ({
    entryId: `entry-${i}`,
    name: `Dish ${i}`,
    categoryId: `cat-${i % 12}`,
    categoryName: `Category ${i % 12}`,
    image: null,
    viewCount: 1000 - i,
    rank: i + 1,
    previousRank: i === 0 ? null : i,
    delta: i === 0 ? null : 1,
    status: (i === 0 ? 'new' : 'up') as 'new' | 'up',
  })),
  dailyTotals: Array.from({ length: 30 }, (_, i) => ({ date: `2024-06-${i + 1}`, viewCount: i * 13 })),
  menuBreakdown: Array.from({ length: 3 }, (_, i) => ({
    menuId: `menu-${i}`,
    menuCode: `code-${i}`,
    menuTitle: `Menu ${i}`,
    icon: 'utensils',
    viewCount: 500 - i,
  })),
  hourlyTotals: Array.from({ length: 24 }, (_, i) => ({ hour: i, viewCount: i * 7 })),
};

describe('AnalyticsResponseSchema', () => {
  bench('parse - 30 day dashboard payload', () => {
    AnalyticsResponseSchema.parse(analyticsPayload);
  });
});

const submitOrder = makeSubmitOrderPayload();
const invalidSubmitOrder = makeSubmitOrderPayload(0);

describe('SubmitOrderBodySchema', () => {
  bench('safeParse - valid 100 line order', () => {
    SubmitOrderBodySchema.safeParse(submitOrder);
  });

  // Rejection collects issues, which is a different (and often slower) path.
  bench('safeParse - rejected empty order', () => {
    SubmitOrderBodySchema.safeParse(invalidSubmitOrder);
  });
});

const check = makeCheckFixture();

describe('check money math', () => {
  bench('computeCheckTotals - 200 line check with discount and adjustments', () => {
    computeCheckTotals(check.lines, check.discount, check.adjustments);
  });

  bench('UpdateCheckBodySchema.safeParse', () => {
    UpdateCheckBodySchema.safeParse({
      discount: check.discount,
      adjustments: check.adjustments,
    });
  });
});

describe('normalizeModulesConfig', () => {
  const stored = {
    ordering: { enabled: true, mode: 'send' },
    ai: { enabled: true, voiceEnabled: true },
    analytics: { enabled: true },
  };

  bench('stored config', () => {
    normalizeModulesConfig(stored);
  });

  bench('legacy fallback (no modules column)', () => {
    normalizeModulesConfig(null, { aiChatEnabled: true, aiVoiceEnabled: false });
  });
});
