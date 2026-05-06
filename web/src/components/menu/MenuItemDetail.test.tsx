import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MenuItemDetail } from './MenuItemDetail';
import { useRestaurantStore } from '@/stores/restaurantStore';
import { useSelectionStore } from '@/stores/selectionStore';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/hooks/useBackButtonClose', () => ({
  useBackButtonClose: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt as string} />;
  },
}));

const item = {
  id: 'entry-bruschetta',
  path: 'entries/entry-bruschetta',
  categoryPath: 'categories/cat-antipasti',
  name: 'Bruschetta',
  description: 'Pane tostato',
  price: 7.5,
  order: 0,
  outOfStock: false,
  containsFrozenIngredient: false,
  menuIds: ['menu-food'],
  hidden: false,
  allergens: [],
} as never;

function resetStores() {
  localStorage.clear();
  useRestaurantStore.setState({ data: { id: 'restaurant-1' } } as never);
  useSelectionStore.setState({ restaurantId: null, updatedAt: 0, lines: [] });
  useSelectionStore.getState().initialize('restaurant-1');
}

describe('MenuItemDetail selection controls', () => {
  beforeEach(() => {
    resetStores();
  });

  it('hides selection controls when menu selection is disabled', () => {
    render(<MenuItemDetail item={item} onClose={vi.fn()} locale="it" selectionEnabled={false} />);

    expect(screen.queryByRole('button', { name: 'Add to selection' })).not.toBeInTheDocument();
  });

  it('adds an available item and keeps the detail modal open with quantity controls', () => {
    render(<MenuItemDetail item={item} onClose={vi.fn()} locale="it" selectionEnabled />);

    fireEvent.click(screen.getByRole('button', { name: 'Add to selection' }));

    expect(screen.getByText('Bruschetta')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(useSelectionStore.getState().quantityFor('entry-bruschetta')).toBe(1);
  });

  it('removes the selected item when decrementing quantity one', () => {
    render(<MenuItemDetail item={item} onClose={vi.fn()} locale="it" selectionEnabled />);

    fireEvent.click(screen.getByRole('button', { name: 'Add to selection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));

    expect(useSelectionStore.getState().quantityFor('entry-bruschetta')).toBe(0);
    expect(screen.getByRole('button', { name: 'Add to selection' })).toBeInTheDocument();
  });

  it('hides selection controls for out of stock items', () => {
    render(<MenuItemDetail item={{ ...item, outOfStock: true } as never} onClose={vi.fn()} locale="it" selectionEnabled />);

    expect(screen.queryByRole('button', { name: 'Add to selection' })).not.toBeInTheDocument();
  });
});
