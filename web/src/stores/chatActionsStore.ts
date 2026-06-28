import { create } from 'zustand';

interface ChatActionsState {
  scrollToCategoryId: string | null;
  openItemDetail: { itemId: string } | null;
  filterCriteria: { excludeAllergens?: string[]; searchQuery?: string } | null;

  requestScrollToCategory: (categoryId: string) => void;
  consumeScrollRequest: () => void;
  requestOpenItemDetail: (itemId: string) => void;
  consumeOpenItemDetailRequest: () => void;
  setFilterCriteria: (criteria: { excludeAllergens?: string[]; searchQuery?: string } | null) => void;
  clearFilter: () => void;
}

export const useChatActionsStore = create<ChatActionsState>((set) => ({
  scrollToCategoryId: null,
  openItemDetail: null,
  filterCriteria: null,

  requestScrollToCategory: (categoryId) => set({ scrollToCategoryId: categoryId }),
  consumeScrollRequest: () => set({ scrollToCategoryId: null }),
  requestOpenItemDetail: (itemId) => set({ openItemDetail: { itemId } }),
  consumeOpenItemDetailRequest: () => set({ openItemDetail: null }),
  setFilterCriteria: (criteria) => set({ filterCriteria: criteria }),
  clearFilter: () => set({ filterCriteria: null }),
}));

// Selectors
export const useScrollToCategoryId = () => useChatActionsStore(s => s.scrollToCategoryId);
export const useOpenItemDetail = () => useChatActionsStore(s => s.openItemDetail);
export const useChatFilterCriteria = () => useChatActionsStore(s => s.filterCriteria);
