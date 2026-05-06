import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCatalogMock } = vi.hoisted(() => ({ getCatalogMock: vi.fn() }));

vi.mock('../lib/api', () => ({
  getCatalog: getCatalogMock,
  getAdminCatalog: vi.fn(),
}));

import { useRestaurantStore } from './restaurantStore';

describe('restaurantStore catalog conversion', () => {
  beforeEach(() => {
    getCatalogMock.mockReset();
    useRestaurantStore.getState().reset();
  });

  it('keeps the catalog menu selection feature flag', async () => {
    getCatalogMock.mockResolvedValue({
      restaurant: {
        id: 'singleton',
        slug: 'singleton',
        name: 'Test Restaurant',
        payoff: null,
        theme: null,
        info: null,
        socials: null,
        openingSchedule: null,
        features: { aiChat: false, selection: true },
      },
      menus: [],
      categories: [],
      variants: [],
      extras: [],
      labels: [],
      generatedAt: new Date().toISOString(),
    });

    await useRestaurantStore.getState().loadRestaurant({ force: true });

    expect(useRestaurantStore.getState().data?.features?.selection).toBe(true);
  });
});
