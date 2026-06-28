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

  it('keeps the catalog ordering feature flag', async () => {
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
        features: { aiChat: false, ordering: { enabled: true, mode: 'summary' } },
      },
      menus: [],
      categories: [],
      variants: [],
      extras: [],
      labels: [],
      generatedAt: new Date().toISOString(),
    });

    await useRestaurantStore.getState().loadRestaurant({ force: true });

    expect(useRestaurantStore.getState().data?.features?.ordering?.enabled).toBe(true);
  });

  const baseRestaurant = (openingSchedule: unknown) => ({
    id: 'singleton',
    slug: 'singleton',
    name: 'Test Restaurant',
    payoff: null,
    theme: null,
    info: null,
    socials: null,
    openingSchedule,
    features: null,
  });

  const loadWith = async (openingSchedule: unknown) => {
    getCatalogMock.mockResolvedValue({
      restaurant: baseRestaurant(openingSchedule),
      menus: [], categories: [], variants: [], extras: [], labels: [],
      generatedAt: new Date().toISOString(),
    });
    await useRestaurantStore.getState().loadRestaurant({ force: true });
    return useRestaurantStore.getState().data?.openingSchedule;
  };

  it('parses the object-keyed opening schedule ("schedule.0" .. "schedule.6")', async () => {
    const sched = await loadWith({
      open: true,
      'schedule.0': [{ start: '09:00', end: '12:00' }],
      'schedule.5': [{ start: '18:00', end: '23:00' }],
    });
    expect(sched?.schedule).toHaveLength(7);
    expect(sched?.schedule[0]).toEqual([{ start: '09:00', end: '12:00' }]);
    expect(sched?.schedule[5]).toEqual([{ start: '18:00', end: '23:00' }]);
    expect(sched?.schedule[1]).toEqual([]);
  });

  it('parses the array-form opening schedule (schedule: [[...], ...])', async () => {
    const sched = await loadWith({
      open: true,
      schedule: [
        [{ start: '08:00', end: '11:00' }],
        [],
        [{ start: '19:00', end: '22:00' }],
      ],
    });
    expect(sched?.schedule).toHaveLength(7);
    expect(sched?.schedule[0]).toEqual([{ start: '08:00', end: '11:00' }]);
    expect(sched?.schedule[2]).toEqual([{ start: '19:00', end: '22:00' }]);
    expect(sched?.schedule[6]).toEqual([]);
  });

  it('leaves openingSchedule undefined when the API sends null', async () => {
    expect(await loadWith(null)).toBeUndefined();
  });
});
