import { create } from 'zustand';
import { getAdminCatalog, getCatalog, type CatalogResponse } from '../lib/api';
import type {
  RestaurantData,
  Variant,
  Extra,
  MenuInfo,
  MenuCategory,
  MenuEntry,
  Allergen,
  WorkingHours,
} from '../lib/types';

interface RestaurantState {
  data: RestaurantData | null;
  variantsCache: Map<string, Variant>;
  extrasCache: Map<string, Extra>;
  categoriesCache: Map<string, MenuCategory>;
  isLoading: boolean;
  error: string | null;

  loadRestaurant: (options?: { force?: boolean }) => Promise<void>;
  getVariant: (path: string) => Variant | undefined;
  getExtra: (path: string) => Extra | undefined;
  getCategory: (path: string) => MenuCategory | undefined;
  setData: (data: RestaurantData) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  data: null,
  variantsCache: new Map<string, Variant>(),
  extrasCache: new Map<string, Extra>(),
  categoriesCache: new Map<string, MenuCategory>(),
  isLoading: false,
  error: null,
};

export const useRestaurantStore = create<RestaurantState>((set, get) => ({
  ...initialState,

  loadRestaurant: async (options?: { force?: boolean }) => {
    const currentState = get();
    if (!options?.force && currentState.data && !currentState.error) return;
    if (currentState.isLoading) return;

    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      const mock = (window as Window & { __playwright_restaurant__?: RestaurantData }).__playwright_restaurant__;
      if (mock) {
        const categoriesCache = new Map<string, MenuCategory>();
        for (const cat of mock.categories) categoriesCache.set(cat.path, cat);
        set({ data: mock, variantsCache: new Map(), extrasCache: new Map(), categoriesCache, isLoading: false, error: null });
        return;
      }
    }

    set({ isLoading: true, error: null });

    try {
      const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
      const catalog = isAdminRoute ? await getAdminCatalog() : await getCatalog();
      const { data: restaurantData, variantsCache, extrasCache, categoriesCache } = catalogToStore(catalog);
      set({ data: restaurantData, variantsCache, extrasCache, categoriesCache, isLoading: false, error: null });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load restaurant';
      console.error('Error loading restaurant:', error);
      set({ error: errorMessage, isLoading: false });
    }
  },

  getVariant: (path: string) => get().variantsCache.get(path),
  getExtra: (path: string) => get().extrasCache.get(path),
  getCategory: (path: string) => get().categoriesCache.get(path),

  setData: (data: RestaurantData) => {
    const variantsCache = new Map<string, Variant>();
    const extrasCache = new Map<string, Extra>();
    const categoriesCache = new Map<string, MenuCategory>();
    for (const category of data.categories) categoriesCache.set(category.path, category);
    set({ data, variantsCache, extrasCache, categoriesCache, isLoading: false, error: null });
  },

  setLoading: (isLoading: boolean) => set({ isLoading }),
  setError: (error: string | null) => set({ error, isLoading: false }),
  reset: () => set(initialState),
}));

/**
 * Converts the backend catalog API response into the store's internal format.
 * Single-tenant: paths no longer carry a restaurantId segment.
 */
function catalogToStore(catalog: CatalogResponse) {
  const r = catalog.restaurant;
  const variantsCache = new Map<string, Variant>();
  const extrasCache = new Map<string, Extra>();
  const categoriesCache = new Map<string, MenuCategory>();

  for (const v of catalog.variants) {
    const path = `variants/${v.id}`;
    variantsCache.set(path, {
      id: v.id,
      path,
      name: v.name,
      description: v.description || undefined,
      order: v.sortOrder,
      selections: (v.selections || []).map((s) => ({
        name: s.name || '',
        price: s.price || 0,
        isDefault: s.isDefault || false,
      })),
      i18n: v.i18n as Record<string, Record<string, string>> | undefined,
    });
  }

  for (const ex of catalog.extras) {
    const path = `extras/${ex.id}`;
    extrasCache.set(path, {
      id: ex.id,
      path,
      name: ex.name,
      max: ex.max,
      type: ex.type as 'zeroorone' | 'zeroormulti',
      extras: (ex.options || []).map((o) => ({
        name: o.name || '',
        internalCode: o.internalCode,
        desc: o.desc,
        price: o.price || 0,
        i18n: o.i18n as Record<string, Record<string, string>> | undefined,
      })),
      i18n: ex.i18n as Record<string, Record<string, string>> | undefined,
    });
  }

  const menus: MenuInfo[] = catalog.menus
    .map((m) => ({
      id: m.id,
      code: m.code,
      title: m.title,
      i18n: m.i18n as Record<string, Record<string, string>> | undefined,
      published: m.published,
      sortOrder: m.sortOrder,
      icon: m.icon,
      availableFrom: m.availableFrom ?? null,
      availableTo: m.availableTo ?? null,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const categories: MenuCategory[] = [];
  for (const cat of catalog.categories) {
    const catPath = `menuEntries/${cat.id}`;
    const entries: MenuEntry[] = cat.entries.map((e) => ({
      id: e.id,
      path: `${catPath}/entries/${e.id}`,
      categoryPath: catPath,
      name: e.name,
      price: Number(e.price) || 0,
      description: e.description || '',
      image: e.imageUrl || undefined,
      order: e.sortOrder,
      minQuantity: (e.metadata?.minQuantity as number) || 1,
      priceUnit: e.priceUnit || undefined,
      outOfStock: e.outOfStock,
      containsFrozenIngredient: e.frozen,
      allergens: (e.allergens || []) as Allergen[],
      menuIds: e.menuIds,
      hidden: e.hidden,
      overriddenVariantPaths: (e.metadata?.variantRefs as string[]) || [],
      overriddenExtraPaths: (e.metadata?.extraRefs as string[]) || [],
      i18n: e.i18n as Record<string, Record<string, string>> | undefined,
    }));

    const category: MenuCategory = {
      id: cat.id,
      path: catPath,
      name: cat.name,
      order: cat.sortOrder,
      entries,
      variantPaths: [],
      extraPaths: [],
      i18n: cat.i18n as Record<string, Record<string, string>> | undefined,
    };
    categories.push(category);
    categoriesCache.set(catPath, category);
  }

  categories.sort((a, b) => a.order - b.order);

  const apiSchedule = r.openingSchedule as Record<string, unknown> | null;
  const openingSchedule: WorkingHours | undefined = apiSchedule
    ? {
        open: (apiSchedule.open as boolean) ?? true,
        bookable: apiSchedule.bookable as boolean | undefined,
        minWaitSlot: (apiSchedule.minWaitSlot as number) ?? 0,
        slotDuration: (apiSchedule.slotDuration as number) ?? 15,
        maxDaysLookAhead: (apiSchedule.maxDaysLookAhead as number) ?? 12,
        schedule: (() => {
          const sched: Array<Array<{ start: string; end: string }>> = [];
          for (let i = 0; i < 7; i++) {
            const day =
              (apiSchedule[`schedule.${i}`] as Array<{ start: string; end: string }> | undefined) ??
              ((apiSchedule.schedule as Array<unknown> | Record<string, unknown> | undefined)?.[i as never] as Array<{ start: string; end: string }> | undefined) ??
              [];
            sched.push(day);
          }
          return sched;
        })(),
      }
    : undefined;

  const data: RestaurantData = {
    id: 'singleton',
    name: r.name,
    payoff: r.payoff || '',
    headerImage: (r.info as Record<string, unknown>)?.headerImage as string || '',
    ownerID: '',
    theme: r.theme ? {
      primaryColor: (r.theme as Record<string, string>).primaryColor,
      splashColor: (r.theme as Record<string, string>).splashColor,
      font: (r.theme as Record<string, string>).font,
      palette: (r.theme as Record<string, string>).palette,
    } : undefined,
    info: r.info ? {
      phone: (r.info as Record<string, string>).phone,
      addressLine1: (r.info as Record<string, string>).addressLine1 || (r.info as Record<string, string>).address_line_1,
      city: (r.info as Record<string, string>).city,
      zip: (r.info as Record<string, string>).zip,
      region: (r.info as Record<string, string>).region,
      privacyPolicyURL: (r.info as Record<string, string>).privacyPolicyURL,
      menuNotice: (r.info as Record<string, unknown>).menuNotice as RestaurantData['info'] extends infer I ? I extends { menuNotice?: infer M } ? M : never : never,
      latlong: (r.info as Record<string, Record<string, number>>).latlong ? {
        latitude: (r.info as Record<string, Record<string, number>>).latlong.latitude,
        longitude: (r.info as Record<string, Record<string, number>>).latlong.longitude,
      } : undefined,
    } : undefined,
    socials: r.socials ? {
      facebook: (r.socials as Record<string, string>).facebook,
      instagram: (r.socials as Record<string, string>).instagram,
      whatsapp: (r.socials as Record<string, string>).whatsapp,
    } : undefined,
    messages: undefined,
    menus,
    openingSchedule,
    categories,
    promotion: undefined,
    features: r.features ? { aiChat: r.features.aiChat, primaryLocale: r.features.primaryLocale, enabledLocales: r.features.enabledLocales, disabledLocales: r.features.disabledLocales, customLocales: r.features.customLocales } : undefined,
  };

  return { data, variantsCache, extrasCache, categoriesCache };
}

const EMPTY_CATEGORIES: import('../lib/types').MenuCategory[] = [];

export const useRestaurantData = () => useRestaurantStore((state) => state.data);
export const useRestaurantLoading = () => useRestaurantStore((state) => state.isLoading);
export const useRestaurantError = () => useRestaurantStore((state) => state.error);
export const useCategories = () => useRestaurantStore((state) => state.data?.categories ?? EMPTY_CATEGORIES);
