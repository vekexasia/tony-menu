/**
 * Deterministic fixtures for the schema benchmarks.
 *
 * Everything here is generated from a fixed seed so that the payload shape and
 * size are identical on every run — CodSpeed compares instruction counts, so a
 * fixture that varies between runs would show up as phantom regressions.
 */

const LOCALES = ['en', 'de', 'fr'] as const;

/** Tiny xorshift PRNG: deterministic across platforms and Node versions. */
function makeRandom(seed = 0x2f6e2b1): () => number {
  let state = seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

function i18nFor(name: string, description: string): Record<string, Record<string, string>> {
  const map: Record<string, Record<string, string>> = {};
  for (const locale of LOCALES) {
    map[locale] = { name: `${name} (${locale})`, description: `${description} (${locale})` };
  }
  return map;
}

export interface CatalogFixtureOptions {
  menus?: number;
  categories?: number;
  entriesPerCategory?: number;
}

/**
 * A catalog payload sized like a real mid-size restaurant: a handful of menus,
 * ~12 categories and ~25 dishes per category, all translated into 3 locales.
 */
export function makeCatalogPayload(options: CatalogFixtureOptions = {}): unknown {
  const { menus: menuCount = 3, categories: categoryCount = 12, entriesPerCategory = 25 } = options;
  const random = makeRandom();

  const menus = Array.from({ length: menuCount }, (_, m) => ({
    id: `menu-${m}`,
    code: `menu-code-${m}`,
    title: `Menu ${m}`,
    i18n: i18nFor(`Menu ${m}`, `Menu ${m} description`),
    published: true,
    sortOrder: m,
    icon: 'utensils',
    availableFrom: m % 2 === 0 ? '11:00' : null,
    availableTo: m % 2 === 0 ? '15:30' : null,
    availableDays: m % 2 === 0 ? ['mon', 'tue', 'wed', 'thu', 'fri'] : null,
  }));

  const labels = Array.from({ length: 8 }, (_, l) => ({
    id: `label-${l}`,
    name: `Label ${l}`,
    color: (['primary', 'green', 'amber', 'red', 'gray'] as const)[l % 5],
    sortOrder: l,
    i18n: i18nFor(`Label ${l}`, `Label ${l} description`),
  }));

  const categories = Array.from({ length: categoryCount }, (_, c) => ({
    id: `cat-${c}`,
    name: `Category ${c}`,
    sortOrder: c,
    i18n: i18nFor(`Category ${c}`, `Category ${c} description`),
    entries: Array.from({ length: entriesPerCategory }, (_, e) => {
      const name = `Dish ${c}-${e}`;
      const description = `A generously described plate number ${e} from category ${c}`;
      return {
        id: `entry-${c}-${e}`,
        name,
        description,
        internalCode: `SKU-${c}-${e}`,
        price: Math.round(random() * 4000) + 250,
        priceUnit: e % 7 === 0 ? 'kg' : null,
        imageUrl: e % 3 === 0 ? `https://cdn.example.com/img/${c}-${e}.webp` : null,
        outOfStock: e % 11 === 0,
        frozen: e % 13 === 0,
        sortOrder: e,
        hidden: e % 17 === 0,
        menuIds: [`menu-${e % menuCount}`],
        labelIds: [`label-${e % labels.length}`, `label-${(e + 3) % labels.length}`],
        destinationIds: [`dest-${e % 2}`],
        allergens: e % 4 === 0 ? ['gluten', 'milk'] : null,
        i18n: i18nFor(name, description),
        metadata: e % 5 === 0 ? { source: 'import', revision: e } : null,
      };
    }),
  }));

  const variants = Array.from({ length: 10 }, (_, v) => ({
    id: `variant-${v}`,
    name: `Variant ${v}`,
    description: `Variant ${v} description`,
    sortOrder: v,
    selections: Array.from({ length: 4 }, (_, s) => ({
      name: `Size ${s}`,
      desc: `Size ${s} description`,
      price: 100 * (s + 1),
      isDefault: s === 0,
      i18n: i18nFor(`Size ${s}`, `Size ${s} description`),
    })),
    i18n: i18nFor(`Variant ${v}`, `Variant ${v} description`),
  }));

  const extras = Array.from({ length: 10 }, (_, x) => ({
    id: `extra-${x}`,
    name: `Extra ${x}`,
    type: 'multi',
    max: 3,
    options: Array.from({ length: 5 }, (_, o) => ({
      name: `Option ${o}`,
      internalCode: `OPT-${x}-${o}`,
      desc: `Option ${o} description`,
      price: 50 * (o + 1),
      i18n: i18nFor(`Option ${o}`, `Option ${o} description`),
    })),
    i18n: i18nFor(`Extra ${x}`, `Extra ${x} description`),
  }));

  return {
    restaurant: {
      id: 'restaurant-1',
      slug: 'trattoria-bench',
      name: 'Trattoria Bench',
      payoff: 'Cucina tradizionale',
      theme: { splashColor: '#101010', primaryColor: '#c81e1e', font: 'Inter', palette: 'warm' },
      info: {
        phone: '+39 000 0000000',
        addressLine1: 'Via Roma 1',
        city: 'Bologna',
        zip: '40100',
        region: 'Emilia-Romagna',
        latlong: { latitude: 44.4949, longitude: 11.3426 },
        menuNotice: { enabled: true, text: 'Coperto 2 EUR', i18n: i18nFor('Notice', 'Notice') },
      },
      socials: { facebook: 'trattoria', instagram: 'trattoria', whatsapp: '+390000000000' },
      openingSchedule: {
        open: true,
        bookable: true,
        minWaitSlot: 30,
        slotDuration: 15,
        maxDaysLookAhead: 30,
        schedule: Array.from({ length: 7 }, () => [
          { start: '12:00', end: '15:00' },
          { start: '19:00', end: '23:00' },
        ]),
      },
      features: {
        aiChat: true,
        aiVoice: false,
        analytics: true,
        ordering: { enabled: true, mode: 'send', submitMode: 'both' },
        primaryLocale: 'it',
        enabledLocales: [...LOCALES],
        disabledLocales: null,
        customLocales: [{ code: 'sc', name: 'Sardu', flagUrl: null }],
      },
    },
    menus,
    categories,
    variants,
    extras,
    labels,
    generatedAt: '2024-06-15T10:00:00.000Z',
  };
}

/** The JSON text a browser actually receives for the catalog above. */
export function makeCatalogJson(options: CatalogFixtureOptions = {}): string {
  return JSON.stringify(makeCatalogPayload(options));
}

/** A large table check: 200 lines, a percentage discount and a few adjustments. */
export function makeCheckFixture(lineCount = 200) {
  const random = makeRandom(0x51ab33d);
  return {
    lines: Array.from({ length: lineCount }, (_, i) => ({
      entryId: `entry-${i}`,
      name: `Dish ${i}`,
      quantity: 1 + (i % 4),
      unitPrice: Math.round(random() * 3000) + 200,
    })),
    discount: { type: 'percent' as const, value: 10 },
    adjustments: [
      { label: 'Coperto', amount: 400 },
      { label: 'Servizio', amount: 250 },
      { label: 'Sconto fedelta', amount: -150 },
    ],
  };
}

/** A maximum-size order submission (the schema caps lines at 100). */
export function makeSubmitOrderPayload(lineCount = 100): unknown {
  return {
    idempotencyKey: 'bench-idempotency-key-0001',
    tableSessionId: 'session-1',
    lines: Array.from({ length: lineCount }, (_, i) => ({
      entryId: `entry-${i}`,
      quantity: 1 + (i % 9),
    })),
  };
}
