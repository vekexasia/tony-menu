import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSelectionStore, SELECTION_STORAGE_KEY } from './selectionStore';

const NOW = 1_770_000_000_000;

function resetSelectionStore() {
  localStorage.clear();
  useSelectionStore.setState({ restaurantId: null, updatedAt: 0, lines: [] });
}

describe('selection store', () => {
  beforeEach(() => {
    resetSelectionStore();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds and increments entry quantities for the active restaurant', () => {
    useSelectionStore.getState().initialize('restaurant-1');

    useSelectionStore.getState().add('entry-1');
    useSelectionStore.getState().add('entry-1');

    expect(useSelectionStore.getState().lines).toEqual([
      { entryId: 'entry-1', quantity: 2, addedAt: NOW },
    ]);
    expect(useSelectionStore.getState().count()).toBe(2);
  });

  it('removes the line when decrementing quantity one', () => {
    useSelectionStore.getState().initialize('restaurant-1');
    useSelectionStore.getState().add('entry-1');

    useSelectionStore.getState().decrement('entry-1');

    expect(useSelectionStore.getState().lines).toEqual([]);
    expect(localStorage.getItem(SELECTION_STORAGE_KEY)).toContain('"lines":[]');
  });

  it('clears stale selections after twelve hours', () => {
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({
      version: 1,
      restaurantId: 'restaurant-1',
      updatedAt: NOW - 12 * 60 * 60 * 1000 - 1,
      lines: [{ entryId: 'entry-1', quantity: 1, addedAt: NOW - 1 }],
    }));

    useSelectionStore.getState().initialize('restaurant-1');

    expect(useSelectionStore.getState().lines).toEqual([]);
  });

  it('clears selections from another restaurant', () => {
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({
      version: 1,
      restaurantId: 'restaurant-1',
      updatedAt: NOW,
      lines: [{ entryId: 'entry-1', quantity: 1, addedAt: NOW }],
    }));

    useSelectionStore.getState().initialize('restaurant-2');

    expect(useSelectionStore.getState().restaurantId).toBe('restaurant-2');
    expect(useSelectionStore.getState().lines).toEqual([]);
  });

  it('clears all lines for the active restaurant', () => {
    useSelectionStore.getState().initialize('restaurant-1');
    useSelectionStore.getState().add('entry-1');
    useSelectionStore.getState().add('entry-2');

    useSelectionStore.getState().clear();

    expect(useSelectionStore.getState().lines).toEqual([]);
    expect(useSelectionStore.getState().restaurantId).toBe('restaurant-1');
  });
});
