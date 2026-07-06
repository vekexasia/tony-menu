import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRestaurantStore } from '@/stores/restaurantStore';
import { SELECTION_STORAGE_KEY, useSelectionStore } from '@/stores/selectionStore';
import { ApiError } from '@/lib/api';
import { SelectionPageClient } from './SelectionPageClient';

const loadRestaurantMock = vi.fn();
const submitOrderMock = vi.fn();
const createOrderIntentMock = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    submitOrder: (...args: unknown[]) => submitOrderMock(...args),
    createOrderIntent: (...args: unknown[]) => createOrderIntentMock(...args),
  };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'it' }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
  submitOrderMock.mockReset();
  createOrderIntentMock.mockReset();
  useSelectionStore.setState({ restaurantId: null, updatedAt: 0, lines: [] });
  useRestaurantStore.setState({
    data: menuData,
    isLoading: false,
    error: null,
    loadRestaurant: loadRestaurantMock,
  } as never);
}

function setSendMode(submitMode: 'diner' | 'waiter' | 'both') {
  useRestaurantStore.setState({
    data: {
      ...(menuData as Record<string, unknown>),
      features: { aiChat: true, ordering: { enabled: true, mode: 'send', submitMode } },
    },
    isLoading: false,
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

    render(<SelectionPageClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'selection.clear' }));
    fireEvent.click(screen.getByRole('button', { name: 'selection.clear' }));

    expect(useSelectionStore.getState().lines).toEqual([]);
    expect(screen.getByText('selection.empty')).toBeInTheDocument();
  });

  it('shows no send button in summary mode', async () => {
    storeSelection([{ entryId: 'entry-bruschetta', quantity: 1, addedAt: 1 }]);

    render(<SelectionPageClient />);

    expect(await screen.findByText('Bruschetta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'selection.send' })).not.toBeInTheDocument();
  });

  it('shows no send button when submitMode is waiter-only', async () => {
    storeSelection([{ entryId: 'entry-bruschetta', quantity: 1, addedAt: 1 }]);
    setSendMode('waiter');

    render(<SelectionPageClient />);

    expect(await screen.findByText('Bruschetta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'selection.send' })).not.toBeInTheDocument();
  });

  it('sends the order and shows the daily number on success', async () => {
    storeSelection([{ entryId: 'entry-bruschetta', quantity: 2, addedAt: 1 }]);
    setSendMode('diner');
    submitOrderMock.mockResolvedValue({ ok: true, orderId: 'o-1', dailyNumber: 7 });

    render(<SelectionPageClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'selection.send' }));

    expect(await screen.findByText('selection.sentTitle')).toBeInTheDocument();
    expect(screen.getByTestId('order-daily-number')).toHaveTextContent('#7');
    expect(useSelectionStore.getState().lines).toEqual([]);
    expect(submitOrderMock).toHaveBeenCalledWith({
      idempotencyKey: expect.any(String),
      lines: [{ entryId: 'entry-bruschetta', quantity: 2 }],
    });
  });

  it('lists stale items by name when the server rejects with 409', async () => {
    storeSelection([
      { entryId: 'entry-bruschetta', quantity: 1, addedAt: 1 },
      { entryId: 'entry-pasta', quantity: 1, addedAt: 2 },
    ]);
    setSendMode('diner');
    // 'entry-ghost' simulates a stale id the cached catalog can't resolve — it must fall back to the raw id.
    submitOrderMock.mockRejectedValue(new ApiError(409, 'stale_items', { error: 'stale_items', staleEntryIds: ['entry-pasta', 'entry-ghost'] }));

    render(<SelectionPageClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'selection.send' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('selection.staleError');
    expect(alert).toHaveTextContent('Pasta');
    expect(alert).toHaveTextContent('entry-ghost');
    expect(alert).not.toHaveTextContent('Bruschetta');
    // Selection is untouched — never silently dropped.
    expect(useSelectionStore.getState().lines).toHaveLength(2);
  });

  it('reuses the idempotency key across retries of a failed send', async () => {
    storeSelection([{ entryId: 'entry-bruschetta', quantity: 1, addedAt: 1 }]);
    setSendMode('diner');
    submitOrderMock.mockRejectedValueOnce(new Error('network'));
    submitOrderMock.mockResolvedValueOnce({ ok: true, orderId: 'o-1', dailyNumber: 3 });

    render(<SelectionPageClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'selection.send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('selection.sendError');
    fireEvent.click(screen.getByRole('button', { name: 'selection.send' }));

    await waitFor(() => expect(submitOrderMock).toHaveBeenCalledTimes(2));
    expect(submitOrderMock.mock.calls[0][0].idempotencyKey).toBe(submitOrderMock.mock.calls[1][0].idempotencyKey);
  });

  it('disables send while the selection contains unavailable items', async () => {
    storeSelection([{ entryId: 'entry-sold-out', quantity: 1, addedAt: 1 }]);
    setSendMode('diner');

    render(<SelectionPageClient />);

    expect(await screen.findByRole('button', { name: 'selection.send' })).toBeDisabled();
    expect(submitOrderMock).not.toHaveBeenCalled();
  });

  it('shows the waiter QR button in waiter mode and renders a QR linking to the review page', async () => {
    storeSelection([{ entryId: 'entry-bruschetta', quantity: 2, addedAt: 1 }]);
    setSendMode('waiter');
    createOrderIntentMock.mockResolvedValue({ ok: true, token: 'tok-123', expiresAt: Date.now() + 1_800_000 });

    render(<SelectionPageClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'selection.showQr' }));

    expect(await screen.findByTestId('waiter-qr')).toBeInTheDocument();
    expect(createOrderIntentMock).toHaveBeenCalledWith({ lines: [{ entryId: 'entry-bruschetta', quantity: 2 }] });
    // Selection stays intact — the waiter submits it, not the diner.
    expect(useSelectionStore.getState().lines).toHaveLength(1);
  });

  it('reuses a cached intent when reopening the QR with an unchanged cart', async () => {
    storeSelection([{ entryId: 'entry-bruschetta', quantity: 2, addedAt: 1 }]);
    setSendMode('waiter');
    createOrderIntentMock.mockResolvedValue({ ok: true, token: 'tok-123', expiresAt: Date.now() + 1_800_000 });

    render(<SelectionPageClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'selection.showQr' }));
    expect(await screen.findByTestId('waiter-qr')).toBeInTheDocument();
    // Close the QR dialog and wait for it to unmount.
    fireEvent.click(screen.getByRole('button', { name: 'selection.qrBack' }));
    await waitFor(() => expect(screen.queryByTestId('waiter-qr')).not.toBeInTheDocument());
    // Reopen with the same cart — no second POST.
    fireEvent.click(screen.getByRole('button', { name: 'selection.showQr' }));
    expect(await screen.findByTestId('waiter-qr')).toBeInTheDocument();

    expect(createOrderIntentMock).toHaveBeenCalledTimes(1);
  });

  it('shows a rate-limit error when intent creation is throttled (429)', async () => {
    storeSelection([{ entryId: 'entry-bruschetta', quantity: 1, addedAt: 1 }]);
    setSendMode('waiter');
    createOrderIntentMock.mockRejectedValue(new ApiError(429, 'rate_limited'));

    render(<SelectionPageClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'selection.showQr' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('selection.qrRateLimit');
  });

  it('shows both send and QR buttons when submitMode is both', async () => {
    storeSelection([{ entryId: 'entry-bruschetta', quantity: 1, addedAt: 1 }]);
    setSendMode('both');

    render(<SelectionPageClient />);

    expect(await screen.findByRole('button', { name: 'selection.send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'selection.showQr' })).toBeInTheDocument();
  });

  it('shows no QR button in diner-only mode and surfaces intent creation failure', async () => {
    storeSelection([{ entryId: 'entry-bruschetta', quantity: 1, addedAt: 1 }]);
    setSendMode('diner');

    const { unmount } = render(<SelectionPageClient />);
    expect(await screen.findByText('Bruschetta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'selection.showQr' })).not.toBeInTheDocument();
    unmount();

    setSendMode('waiter');
    createOrderIntentMock.mockRejectedValue(new Error('network'));
    render(<SelectionPageClient />);
    fireEvent.click(await screen.findByRole('button', { name: 'selection.showQr' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('selection.qrError');
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
