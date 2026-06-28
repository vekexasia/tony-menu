/**
 * Tests for api.ts client functions.
 *
 * Focused on the promise semantics of recordView():
 *   - resolves on success → .then() runs, .catch() does NOT run
 *   - rejects on failure → .then() does NOT run, .catch() runs
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── getCatalog ───────────────────────────────────────────────────────────────
describe('getCatalog', () => {
  const ORIG_API_URL = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.test';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ restaurant: {}, menus: [], variants: [], extras: [] }), { status: 200 })));
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = ORIG_API_URL;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('cache-busts public catalog requests so admin edits are visible immediately', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:00:00Z'));
    try {
      const { getCatalog } = await import('./api');
      await getCatalog();
      expect(fetch).toHaveBeenCalledWith('https://api.test/catalog?t=1777550400000', expect.any(Object));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('apiFetch timeout', () => {
  const ORIG_API_URL = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.NEXT_PUBLIC_API_URL = 'https://api.test';
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => {
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }));
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = ORIG_API_URL;
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.useRealTimers();
  });

  it('rejects admin auth requests instead of hanging forever', async () => {
    const { getMe } = await import('./api');

    const assertion = expect(getMe()).rejects.toThrow('Request timed out');
    await vi.advanceTimersByTimeAsync(10000);

    await assertion;
  });
});

// ── getDeploymentInfo ────────────────────────────────────────────────────────
describe('getDeploymentInfo', () => {
  const ORIG_API_URL = process.env.NEXT_PUBLIC_API_URL;
  const ORIG_COMMIT_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.test';
    process.env.NEXT_PUBLIC_COMMIT_SHA = 'web-sha-123';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ commitSha: 'api-sha-456' }), { status: 200 }),
    ));
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = ORIG_API_URL;
    process.env.NEXT_PUBLIC_COMMIT_SHA = ORIG_COMMIT_SHA;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns web and API deployment commit SHAs', async () => {
    const { getDeploymentInfo } = await import('./api');

    await expect(getDeploymentInfo()).resolves.toEqual({
      webCommitSha: 'web-sha-123',
      apiCommitSha: 'api-sha-456',
    });
    expect(fetch).toHaveBeenCalledWith(`${process.env.NEXT_PUBLIC_API_URL}/health`, expect.any(Object));
  });

  it('uses unknown for API SHA when health cannot be loaded', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('Failed to fetch'));
    const { getDeploymentInfo } = await import('./api');

    await expect(getDeploymentInfo()).resolves.toEqual({
      webCommitSha: 'web-sha-123',
      apiCommitSha: 'unknown',
    });
  });
});

// ── recordView ─────────────────────────────────────────────────────────────────

describe('recordView', () => {
  const ORIG_API_URL = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.test';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = ORIG_API_URL;
    vi.unstubAllGlobals();
    // Reset module cache so the API_BASE constant is re-evaluated per test group
    vi.resetModules();
  });

  it('resolves when the server responds 200, so .then() runs', async () => {
    // Arrange: mock fetch to return a successful JSON response
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    // We must dynamic-import AFTER stubbing env + fetch because
    // the module-level API_BASE is captured at import time.
    const { recordView } = await import('./api');

    const thenSpy = vi.fn();
    const catchSpy = vi.fn();

    await recordView('entry-1').then(thenSpy).catch(catchSpy);

    expect(thenSpy).toHaveBeenCalledOnce();
    expect(catchSpy).not.toHaveBeenCalled();
  });

  it('rejects when the server responds 4xx, so .then() does NOT run and .catch() runs', async () => {
    // Arrange: mock fetch to return a 500 error response
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'server error' }), { status: 500 }),
    );

    const { recordView } = await import('./api');

    const thenSpy = vi.fn();
    const catchSpy = vi.fn();

    await recordView('entry-1').then(thenSpy).catch(catchSpy);

    expect(thenSpy).not.toHaveBeenCalled();
    expect(catchSpy).toHaveBeenCalledOnce();
  });

  it('rejects when fetch itself throws (network error), so .then() does NOT run', async () => {
    // Arrange: mock fetch to throw (simulates network failure)
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('Failed to fetch'));

    const { recordView } = await import('./api');

    const thenSpy = vi.fn();
    const catchSpy = vi.fn();

    await recordView('entry-1').then(thenSpy).catch(catchSpy);

    expect(thenSpy).not.toHaveBeenCalled();
    expect(catchSpy).toHaveBeenCalledOnce();
  });
});

// ── viewDedupeKey ──────────────────────────────────────────────────────────────

describe('viewDedupeKey', () => {
  // Import the helper from @/lib/utils where it lives.
  // It is a pure function that only uses `new Date()`.

  it('produces the same key for the same entry on the same day', async () => {
    const { viewDedupeKey } = await import('@/lib/utils');
    const key1 = viewDedupeKey('entry-abc');
    const key2 = viewDedupeKey('entry-abc');
    expect(key1).toBe(key2);
  });

  it('produces different keys for different entries on the same day', async () => {
    const { viewDedupeKey } = await import('@/lib/utils');
    const keyA = viewDedupeKey('entry-A');
    const keyB = viewDedupeKey('entry-B');
    expect(keyA).not.toBe(keyB);
  });

  it('produces different keys for the same entry on different UTC days', async () => {
    vi.useFakeTimers();
    try {
      const { viewDedupeKey } = await import('@/lib/utils');

      vi.setSystemTime(new Date('2024-01-15T23:59:59Z'));
      const keyDay1 = viewDedupeKey('entry-xyz');

      vi.setSystemTime(new Date('2024-01-16T00:00:01Z'));
      const keyDay2 = viewDedupeKey('entry-xyz');

      expect(keyDay1).not.toBe(keyDay2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('key format is "<entryId>:<YYYYMMDD>" as a UTC integer bucket', async () => {
    vi.useFakeTimers();
    try {
      const { viewDedupeKey } = await import('@/lib/utils');

      // June 3 2024 at noon UTC
      vi.setSystemTime(new Date('2024-06-03T12:00:00Z'));
      const key = viewDedupeKey('my-entry');

      // Expected: "my-entry:20240603"
      expect(key).toBe('my-entry:20240603');
    } finally {
      vi.useRealTimers();
    }
  });

  it('key uses UTC date — browser in CET at 00:30 UTC still produces the UTC bucket', async () => {
    vi.useFakeTimers();
    try {
      const { viewDedupeKey } = await import('@/lib/utils');

      // 2024-06-16T00:30:00Z = 2024-06-16 in UTC, but 2024-06-16T02:30 in CEST
      // Without the UTC fix, a CET browser would compute the correct local date here,
      // but more importantly the key must match the backend's UTC dateBucket.
      vi.setSystemTime(new Date('2024-06-16T00:30:00Z'));
      const key = viewDedupeKey('my-entry');

      // Should use UTC date (20240616)
      expect(key).toBe('my-entry:20240616');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses UTC date when local time zone is ahead — 23:30 UTC is next day in CEST', async () => {
    vi.useFakeTimers();
    try {
      const { viewDedupeKey } = await import('@/lib/utils');

      // 2024-06-15T23:30:00Z = June 15 in UTC, but June 16 in CEST (UTC+2).
      // Under the old local-date bug (getDate/getMonth instead of getUTCDate/getUTCMonth),
      // a CET browser would produce "my-entry:20240616" here.
      // The correct UTC-based key must be "my-entry:20240615".
      vi.setSystemTime(new Date('2024-06-15T23:30:00Z'));
      const key = viewDedupeKey('my-entry');

      expect(key).toBe('my-entry:20240615');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('admin mutations: method, path, body', () => {
  const ORIG_API_URL = process.env.NEXT_PUBLIC_API_URL;
  let calls: Array<{ url: string; init: RequestInit }>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.test';
    calls = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }));
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = ORIG_API_URL;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const last = () => calls[calls.length - 1];
  const bodyOf = (init: RequestInit) => JSON.parse(init.body as string);

  it('updateRestaurantSettings PUTs /admin/settings with the body', async () => {
    const { updateRestaurantSettings } = await import('./api');
    await updateRestaurantSettings({ name: 'X' } as never);
    expect(last().url).toBe('https://api.test/admin/settings');
    expect(last().init.method).toBe('PUT');
    expect(bodyOf(last().init)).toEqual({ name: 'X' });
  });

  it('updateModules PUTs /admin/modules', async () => {
    const { updateModules } = await import('./api');
    await updateModules({ foo: true } as never);
    expect(last().url).toBe('https://api.test/admin/modules');
    expect(last().init.method).toBe('PUT');
    expect(bodyOf(last().init)).toEqual({ foo: true });
  });

  it('setMenuPublished PUTs /admin/publication with { published }', async () => {
    const { setMenuPublished } = await import('./api');
    await setMenuPublished(true);
    expect(last().url).toBe('https://api.test/admin/publication');
    expect(last().init.method).toBe('PUT');
    expect(bodyOf(last().init)).toEqual({ published: true });
  });

  it('updateOpeningHours PUTs /admin/hours wrapping openingSchedule', async () => {
    const { updateOpeningHours } = await import('./api');
    await updateOpeningHours({ open: true } as never);
    expect(last().url).toBe('https://api.test/admin/hours');
    expect(last().init.method).toBe('PUT');
    expect(bodyOf(last().init)).toEqual({ openingSchedule: { open: true } });
  });

  it('createMenu POSTs /admin/menus', async () => {
    const { createMenu } = await import('./api');
    await createMenu({ code: 'lunch', title: 'Lunch' } as never);
    expect(last().url).toBe('https://api.test/admin/menus');
    expect(last().init.method).toBe('POST');
    expect(bodyOf(last().init)).toEqual({ code: 'lunch', title: 'Lunch' });
  });

  it('updateMenu PATCHes /admin/menus/:id', async () => {
    const { updateMenu } = await import('./api');
    await updateMenu('m1', { title: 'T' } as never);
    expect(last().url).toBe('https://api.test/admin/menus/m1');
    expect(last().init.method).toBe('PATCH');
    expect(bodyOf(last().init)).toEqual({ title: 'T' });
  });

  it('deleteMenu DELETEs /admin/menus/:id with no body', async () => {
    const { deleteMenu } = await import('./api');
    await deleteMenu('m1');
    expect(last().url).toBe('https://api.test/admin/menus/m1');
    expect(last().init.method).toBe('DELETE');
    expect(last().init.body).toBeUndefined();
  });

  it('createLabel POSTs /admin/labels', async () => {
    const { createLabel } = await import('./api');
    await createLabel({ name: 'Spicy', color: 'red' } as never);
    expect(last().url).toBe('https://api.test/admin/labels');
    expect(last().init.method).toBe('POST');
    expect(bodyOf(last().init)).toEqual({ name: 'Spicy', color: 'red' });
  });

  it('updateLabel PATCHes /admin/labels/:id', async () => {
    const { updateLabel } = await import('./api');
    await updateLabel('l1', { name: 'N' } as never);
    expect(last().url).toBe('https://api.test/admin/labels/l1');
    expect(last().init.method).toBe('PATCH');
  });

  it('deleteLabel DELETEs /admin/labels/:id', async () => {
    const { deleteLabel } = await import('./api');
    await deleteLabel('l1');
    expect(last().url).toBe('https://api.test/admin/labels/l1');
    expect(last().init.method).toBe('DELETE');
  });

  it('reorderLabels PATCHes /admin/labels/reorder with { items }', async () => {
    const { reorderLabels } = await import('./api');
    await reorderLabels([{ id: 'a', order: 0 }]);
    expect(last().url).toBe('https://api.test/admin/labels/reorder');
    expect(last().init.method).toBe('PATCH');
    expect(bodyOf(last().init)).toEqual({ items: [{ id: 'a', order: 0 }] });
  });

  it('reorderMenus PATCHes /admin/menus/reorder with { items }', async () => {
    const { reorderMenus } = await import('./api');
    await reorderMenus([{ id: 'a', order: 1 }]);
    expect(last().url).toBe('https://api.test/admin/menus/reorder');
    expect(last().init.method).toBe('PATCH');
    expect(bodyOf(last().init)).toEqual({ items: [{ id: 'a', order: 1 }] });
  });

  it('createCategory POSTs /admin/categories', async () => {
    const { createCategory } = await import('./api');
    await createCategory({ name: 'Antipasti' });
    expect(last().url).toBe('https://api.test/admin/categories');
    expect(last().init.method).toBe('POST');
    expect(bodyOf(last().init)).toEqual({ name: 'Antipasti' });
  });

  it('updateCategory PUTs /admin/categories/:id', async () => {
    const { updateCategory } = await import('./api');
    await updateCategory('c1', { name: 'N' } as never);
    expect(last().url).toBe('https://api.test/admin/categories/c1');
    expect(last().init.method).toBe('PUT');
  });

  it('deleteCategory DELETEs /admin/categories/:id', async () => {
    const { deleteCategory } = await import('./api');
    await deleteCategory('c1');
    expect(last().url).toBe('https://api.test/admin/categories/c1');
    expect(last().init.method).toBe('DELETE');
  });

  it('reorderCategories PATCHes /admin/categories/reorder', async () => {
    const { reorderCategories } = await import('./api');
    await reorderCategories([{ id: 'a', order: 0 }]);
    expect(last().url).toBe('https://api.test/admin/categories/reorder');
    expect(last().init.method).toBe('PATCH');
    expect(bodyOf(last().init)).toEqual({ items: [{ id: 'a', order: 0 }] });
  });

  it('createEntry POSTs /admin/categories/:id/entries', async () => {
    const { createEntry } = await import('./api');
    await createEntry('c1', { name: 'Dish' } as never);
    expect(last().url).toBe('https://api.test/admin/categories/c1/entries');
    expect(last().init.method).toBe('POST');
    expect(bodyOf(last().init)).toEqual({ name: 'Dish' });
  });

  it('updateEntry PUTs /admin/entries/:id', async () => {
    const { updateEntry } = await import('./api');
    await updateEntry('e1', { name: 'N' } as never);
    expect(last().url).toBe('https://api.test/admin/entries/e1');
    expect(last().init.method).toBe('PUT');
  });

  it('reorderEntries PATCHes /admin/entries/reorder', async () => {
    const { reorderEntries } = await import('./api');
    await reorderEntries([{ id: 'a', order: 0 }]);
    expect(last().url).toBe('https://api.test/admin/entries/reorder');
    expect(last().init.method).toBe('PATCH');
    expect(bodyOf(last().init)).toEqual({ items: [{ id: 'a', order: 0 }] });
  });

  it('deleteEntry DELETEs /admin/entries/:id', async () => {
    const { deleteEntry } = await import('./api');
    await deleteEntry('e1');
    expect(last().url).toBe('https://api.test/admin/entries/e1');
    expect(last().init.method).toBe('DELETE');
  });

  it('moveEntry POSTs /admin/entries/:id/move with { targetCategoryId }', async () => {
    const { moveEntry } = await import('./api');
    await moveEntry('e1', 'c2');
    expect(last().url).toBe('https://api.test/admin/entries/e1/move');
    expect(last().init.method).toBe('POST');
    expect(bodyOf(last().init)).toEqual({ targetCategoryId: 'c2' });
  });

  it('uploadEntryImage POSTs raw bytes with image/jpeg content type', async () => {
    const { uploadEntryImage } = await import('./api');
    await uploadEntryImage('e1', new ArrayBuffer(4));
    expect(last().url).toBe('https://api.test/admin/entries/e1/image');
    expect(last().init.method).toBe('POST');
    expect((last().init.headers as Record<string, string>)['Content-Type']).toBe('image/jpeg');
    expect(last().init.body).toBeInstanceOf(ArrayBuffer);
  });

  it('deleteEntryImage DELETEs /admin/entries/:id/image', async () => {
    const { deleteEntryImage } = await import('./api');
    await deleteEntryImage('e1');
    expect(last().url).toBe('https://api.test/admin/entries/e1/image');
    expect(last().init.method).toBe('DELETE');
  });

  it('uploadHeaderImage POSTs /admin/header-image', async () => {
    const { uploadHeaderImage } = await import('./api');
    await uploadHeaderImage(new ArrayBuffer(2));
    expect(last().url).toBe('https://api.test/admin/header-image');
    expect(last().init.method).toBe('POST');
  });

  it('uploadPromotionImage POSTs /admin/promotion-image', async () => {
    const { uploadPromotionImage } = await import('./api');
    await uploadPromotionImage(new ArrayBuffer(2));
    expect(last().url).toBe('https://api.test/admin/promotion-image');
    expect(last().init.method).toBe('POST');
  });

  it('uploadLocaleFlag POSTs /admin/locale-flag/:code (encoded)', async () => {
    const { uploadLocaleFlag } = await import('./api');
    await uploadLocaleFlag('zh-CN', new ArrayBuffer(2));
    expect(last().url).toBe('https://api.test/admin/locale-flag/zh-CN');
    expect(last().init.method).toBe('POST');
  });

  it('deleteLocaleFlag DELETEs /admin/locale-flag/:code', async () => {
    const { deleteLocaleFlag } = await import('./api');
    await deleteLocaleFlag('vec');
    expect(last().url).toBe('https://api.test/admin/locale-flag/vec');
    expect(last().init.method).toBe('DELETE');
  });

  it('publishCatalog POSTs /catalog/publish', async () => {
    const { publishCatalog } = await import('./api');
    await publishCatalog();
    expect(last().url).toBe('https://api.test/catalog/publish');
    expect(last().init.method).toBe('POST');
  });

  it('translateText POSTs /admin/translate with the source payload', async () => {
    const { translateText } = await import('./api');
    await translateText('Ciao', 'en', 'name');
    expect(last().url).toBe('https://api.test/admin/translate');
    expect(last().init.method).toBe('POST');
    expect(bodyOf(last().init)).toEqual({ sourceText: 'Ciao', targetLocale: 'en', field: 'name' });
  });
});

describe('admin entry API paths', () => {
  const ORIG_API_URL = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.test';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))));
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = ORIG_API_URL;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('encodes entry ids in path segments', async () => {
    const { updateEntry, deleteEntry, moveEntry, uploadEntryImage, deleteEntryImage } = await import('./api');
    const entryId = '003-teciada-di-pesce-in-guazzetto\tcon-crostini';

    await updateEntry(entryId, {} as never);
    await deleteEntry(entryId);
    await moveEntry(entryId, '013-secondi-di-pesce');
    await uploadEntryImage(entryId, new ArrayBuffer(0));
    await deleteEntryImage(entryId);

    expect(fetch).toHaveBeenNthCalledWith(1, 'https://api.test/admin/entries/003-teciada-di-pesce-in-guazzetto%09con-crostini', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://api.test/admin/entries/003-teciada-di-pesce-in-guazzetto%09con-crostini', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(3, 'https://api.test/admin/entries/003-teciada-di-pesce-in-guazzetto%09con-crostini/move', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(4, 'https://api.test/admin/entries/003-teciada-di-pesce-in-guazzetto%09con-crostini/image', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(5, 'https://api.test/admin/entries/003-teciada-di-pesce-in-guazzetto%09con-crostini/image', expect.any(Object));
  });
});
