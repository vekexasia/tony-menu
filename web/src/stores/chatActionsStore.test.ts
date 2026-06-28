import { describe, it, expect, beforeEach } from 'vitest';
import { useChatActionsStore } from './chatActionsStore';

describe('chatActionsStore', () => {
  beforeEach(() => {
    // Reset store
    useChatActionsStore.setState({
      scrollToCategoryId: null,
      openItemDetail: null,
      filterCriteria: null,
    });
  });

  it('requestScrollToCategory sets scrollToCategoryId', () => {
    useChatActionsStore.getState().requestScrollToCategory('cat-123');

    expect(useChatActionsStore.getState().scrollToCategoryId).toBe('cat-123');
  });

  it('setFilterCriteria sets filterCriteria', () => {
    useChatActionsStore.getState().setFilterCriteria({
      excludeAllergens: ['Glutine', 'Latte-e-Derivati'],
      searchQuery: undefined,
    });

    expect(useChatActionsStore.getState().filterCriteria).toEqual({
      excludeAllergens: ['Glutine', 'Latte-e-Derivati'],
      searchQuery: undefined,
    });
  });

  it('consumeScrollRequest clears scrollToCategoryId', () => {
    useChatActionsStore.getState().requestScrollToCategory('cat-1');
    expect(useChatActionsStore.getState().scrollToCategoryId).toBe('cat-1');

    useChatActionsStore.getState().consumeScrollRequest();
    expect(useChatActionsStore.getState().scrollToCategoryId).toBeNull();
  });

  it('clearFilter clears filterCriteria', () => {
    useChatActionsStore.getState().setFilterCriteria({ excludeAllergens: ['Glutine'] });
    useChatActionsStore.getState().clearFilter();
    expect(useChatActionsStore.getState().filterCriteria).toBeNull();
  });
});
