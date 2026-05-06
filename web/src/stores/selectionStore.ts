import { create } from 'zustand';

export const SELECTION_STORAGE_KEY = 'tony-menu-selection-v1';
const VERSION = 1;
const EXPIRES_MS = 12 * 60 * 60 * 1000;

export interface SelectionLine {
  entryId: string;
  quantity: number;
  addedAt: number;
}

interface StoredSelection {
  version: number;
  restaurantId: string;
  updatedAt: number;
  lines: SelectionLine[];
}

interface SelectionState {
  restaurantId: string | null;
  updatedAt: number;
  lines: SelectionLine[];
  initialize: (restaurantId: string) => void;
  add: (entryId: string) => void;
  increment: (entryId: string) => void;
  decrement: (entryId: string) => void;
  remove: (entryId: string) => void;
  clear: () => void;
  quantityFor: (entryId: string) => number;
  count: () => number;
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function saveSelection(restaurantId: string | null, updatedAt: number, lines: SelectionLine[]) {
  if (!canUseStorage() || !restaurantId) return;
  const stored: StoredSelection = { version: VERSION, restaurantId, updatedAt, lines };
  localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(stored));
}

function emptyFor(restaurantId: string) {
  const updatedAt = Date.now();
  saveSelection(restaurantId, updatedAt, []);
  return { restaurantId, updatedAt, lines: [] };
}

function readStored(restaurantId: string): Pick<SelectionState, 'restaurantId' | 'updatedAt' | 'lines'> {
  if (!canUseStorage()) return { restaurantId, updatedAt: Date.now(), lines: [] };

  const raw = localStorage.getItem(SELECTION_STORAGE_KEY);
  if (!raw) return emptyFor(restaurantId);

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSelection>;
    if (parsed.version !== VERSION || parsed.restaurantId !== restaurantId) return emptyFor(restaurantId);
    if (!parsed.updatedAt || Date.now() - parsed.updatedAt > EXPIRES_MS) return emptyFor(restaurantId);
    const lines = Array.isArray(parsed.lines)
      ? parsed.lines
        .filter((line) => typeof line.entryId === 'string' && Number.isFinite(line.quantity) && line.quantity > 0)
        .map((line) => ({ entryId: line.entryId, quantity: Math.floor(line.quantity), addedAt: line.addedAt || parsed.updatedAt! }))
      : [];
    return { restaurantId, updatedAt: parsed.updatedAt, lines };
  } catch {
    return emptyFor(restaurantId);
  }
}

function mutateLines(
  state: Pick<SelectionState, 'restaurantId' | 'lines'>,
  mutate: (lines: SelectionLine[], now: number) => SelectionLine[],
) {
  if (!state.restaurantId) return state;
  const now = Date.now();
  const lines = mutate(state.lines, now);
  saveSelection(state.restaurantId, now, lines);
  return { updatedAt: now, lines };
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  restaurantId: null,
  updatedAt: 0,
  lines: [],

  initialize: (restaurantId) => set(readStored(restaurantId)),

  add: (entryId) => set((state) => mutateLines(state, (lines, now) => {
    const existing = lines.find((line) => line.entryId === entryId);
    if (existing) return lines.map((line) => line.entryId === entryId ? { ...line, quantity: line.quantity + 1 } : line);
    return [...lines, { entryId, quantity: 1, addedAt: now }];
  })),

  increment: (entryId) => get().add(entryId),

  decrement: (entryId) => set((state) => mutateLines(state, (lines) => lines.flatMap((line) => {
    if (line.entryId !== entryId) return [line];
    if (line.quantity <= 1) return [];
    return [{ ...line, quantity: line.quantity - 1 }];
  }))),

  remove: (entryId) => set((state) => mutateLines(state, (lines) => lines.filter((line) => line.entryId !== entryId))),

  clear: () => set((state) => mutateLines(state, () => [])),

  quantityFor: (entryId) => get().lines.find((line) => line.entryId === entryId)?.quantity ?? 0,

  count: () => get().lines.reduce((sum, line) => sum + line.quantity, 0),
}));
