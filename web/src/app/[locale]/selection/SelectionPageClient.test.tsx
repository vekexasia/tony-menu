import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRestaurantStore } from '@/stores/restaurantStore';
import { SELECTION_STORAGE_KEY, useSelectionStore } from '@/stores/selectionStore';
import { SelectionPageClient } from './SelectionPageClient';

const loadRestaurantMock = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'it' }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => (key: string) => key,
}));

const menuData = {
  id: 'demo-restaurant',
  name: 'Trattoria Demo',
  features: { aiChat: true, ordering: { enabled: true, mode: 'summary' } },
  menus: [{ id: 'menu-food', code: 'food', title: 'Food', published: true, sortOrder: 0 }],
  categories: [
    {
      id: 'cat-antipasti',
      name: 'Antipasti',
      order: 0,
      entries: [
        { id: 'entry-bruschetta', name: 'Bruschetta', description: 'Pane', price: 7.5, order: 0, allergens: [], menuIds: ['menu-food'], hidden: false, outOfStock: false },
      ],
    },
    {
      id: 'cat-primi',
      name: 'Primi',
      order: 1,
      entries: [
        { id: 'entry-pasta', name: 'Pasta', description: 'Pasta', price: 12, order: 0, allergens: [], menuIds: ['menu-food'], hidden: false, outOfStock: false },
        { id: 'entry-sold-out', name: 'Sold out dish', description: 'Nope', price: 9, order: 1, allergens: [], menuIds: ['menu-food'], hidden: false, outOfStock: true },
      ],
    },
  ],
} as never;

function storeSelection(lines: Array<{ entryId: string; quantity: number; addedAt: number }>) {
  localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({
    version: 1,
    restaurantId: 'demo-restaurant',
    updatedAt: Date.now(),
    lines,
  }));
}

function resetStores() {
  localStorage.clear();
  vi.restoreAllMocks();
  loadRestaurantMock.mockReset();
  useSelectionStore.setState({ restaurantId: null, updatedAt: 0, lines: [] });
  useRestaurantStore.setState({
    data: menuData,
    isLoading: false,
    error: null,
    loadRestaurant: loadRestaurantMock,
  } as never);
}

describe('SelectionPageClient', () => {
  beforeEach(() => {
    resetStores();
  });

  it('groups selected lines by category without rendering prices', async () => {
    storeSelection([
      { entryId: 'entry-pasta', quantity: 2, addedAt: 1 },
      { entryId: 'entry-bruschetta', quantity: 1, addedAt: 2 },
    ]);

    render(<SelectionPageClient />);

    expect(await screen.findByText('Antipasti')).toBeInTheDocument();
    expect(screen.getByText('Primi')).toBeInTheDocument();
    expect(screen.getByText('Bruschetta')).toBeInTheDocument();
    expect(screen.getByText('Pasta')).toBeInTheDocument();
    expect(screen.queryByText(/€|7,50|12/)).not.toBeInTheDocument();
  });

  it('marks missing and out-of-stock entries unavailable', async () => {
    storeSelection([
      { entryId: 'entry-missing', quantity: 1, addedAt: 1 },
      { entryId: 'entry-sold-out', quantity: 1, addedAt: 2 },
    ]);

    render(<SelectionPageClient />);

    expect(await screen.findByText('selection.unavailableItem')).toBeInTheDocument();
    expect(screen.getByText('Sold out dish')).toBeInTheDocument();
    expect(screen.getAllByText('selection.unavailable')).toHaveLength(2);
  });

  it('updates quantities and removes at one', async () => {
    storeSelection([{ entryId: 'entry-bruschetta', quantity: 1, addedAt: 1 }]);

    render(<SelectionPageClient />);

    expect(await screen.findByText('Bruschetta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'selection.increaseItem' }));
    expect(useSelectionStore.getState().quantityFor('entry-bruschetta')).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'selection.decreaseItem' }));
    fireEvent.click(screen.getByRole('button', { name: 'selection.decreaseItem' }));
    expect(useSelectionStore.getState().quantityFor('entry-bruschetta')).toBe(0);
  });

  it('clears all lines after confirmation', async () => {
    storeSelection([{ entryId: 'entry-bruschetta', quantity: 1, addedAt: 1 }]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<SelectionPageClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'selection.clear' }));

    expect(useSelectionStore.getState().lines).toEqual([]);
    expect(screen.getByText('selection.empty')).toBeInTheDocument();
  });

  it('does not show stored lines when ordering is disabled', async () => {
    storeSelection([{ entryId: 'entry-bruschetta', quantity: 1, addedAt: 1 }]);
    useRestaurantStore.setState({
      data: { ...(menuData as Record<string, unknown>), features: { aiChat: true, ordering: { enabled: false, mode: 'summary' } } },
      isLoading: false,
    } as never);

    render(<SelectionPageClient />);

    expect(await screen.findByText('selection.disabledTitle')).toBeInTheDocument();
    expect(screen.queryByText('Bruschetta')).not.toBeInTheDocument();
  });
});
