import { create } from 'zustand';

interface UIState {
  // State
  visibleCategory: string | null;
  searchQuery: string;

  // Actions
  setVisibleCategory: (categoryId: string | null) => void;
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;
  reset: () => void;
}

const initialState = {
  visibleCategory: null,
  searchQuery: '',
};

export const useUIStore = create<UIState>((set) => ({
  ...initialState,

  setVisibleCategory: (categoryId: string | null) => {
    set({ visibleCategory: categoryId });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  clearSearch: () => {
    set({ searchQuery: '' });
  },

  reset: () => {
    set(initialState);
  },
}));

