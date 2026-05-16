import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Mocks must come before the component import ─────────────────────

const loadRestaurantMock = vi.fn();
const chatPanelMock = vi.fn(() => <div data-testid="chat-panel" />);

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'it' }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/api', () => ({
  recordView: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt, ...rest } = props;
    delete rest.fill;
    delete rest.priority;
    delete rest.sizes;
    delete rest.unoptimized;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt as string} {...rest} />;
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/chat/ChatPanel', () => ({ ChatPanel: () => chatPanelMock() }));
vi.mock('@/components/menu/MenuItemDetail', () => ({ MenuItemDetail: () => null }));
vi.mock('@/components/menu/RestaurantInfoModal', () => ({ RestaurantInfoModal: () => null }));
vi.mock('@/components/menu/PromotionPopup', () => ({ PromotionPopup: () => null }));

import { useRestaurantStore } from '@/stores/restaurantStore';
import type { RestaurantData } from '@/lib/types';
import { useChatActionsStore } from '@/stores/chatActionsStore';
import { useSelectionStore, SELECTION_STORAGE_KEY } from '@/stores/selectionStore';
import MenuPageClient from './MenuPageClient';

function resetStores() {
  useRestaurantStore.setState({
    data: null,
    isLoading: false,
    error: null,
    loadRestaurant: loadRestaurantMock,
  } as never);
  useChatActionsStore.setState({
    scrollToCategoryId: null,
    chatFilterCriteria: null,
  } as never);
  useSelectionStore.setState({ restaurantId: null, updatedAt: 0, lines: [] });
  localStorage.clear();
}

beforeEach(() => {
  loadRestaurantMock.mockReset();
  chatPanelMock.mockClear();
  resetStores();
});

const menuData = {
  id: 'demo-restaurant',
  name: 'Trattoria Demo',
  features: { aiChat: true, selection: false },
  menus: [
    { id: 'menu-food', code: 'food', title: 'Food', published: true, sortOrder: 0 },
  ],
  categories: [
    {
      id: 'cat-antipasti',
      name: 'Antipasti',
      order: 0,
      entries: [
        {
          id: 'entry-bruschetta',
          name: 'Bruschetta',
          description: 'Pane tostato',
          price: 7.5,
          order: 0,
          allergens: [],
          menuIds: ['menu-food'],
          hidden: false,
        },
      ],
    },
  ],
} as unknown as RestaurantData;

describe('MenuPageClient', () => {
  it('renders the loading spinner when isLoading is true', () => {
    useRestaurantStore.setState({ isLoading: true } as never);
    const { container } = render(<MenuPageClient />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders the error state with a retry button when error is set', () => {
    useRestaurantStore.setState({ error: 'Network down', isLoading: false } as never);
    render(<MenuPageClient />);
    expect(screen.getByText('Network down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('clicking retry calls loadRestaurant with the restaurant id from params', () => {
    useRestaurantStore.setState({ error: 'Failed', isLoading: false } as never);
    render(<MenuPageClient />);

    // The loadRestaurant mock is called once on mount; clear to isolate click
    loadRestaurantMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(loadRestaurantMock).toHaveBeenCalled();
  });

  it('returns null (empty render) when data is null and not loading and no error', () => {
    const { container } = render(<MenuPageClient />);
    // First child is an empty fragment — the spinner wrapper only renders on isLoading
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
    expect(container.textContent).toBe('');
  });

  it('calls loadRestaurant on mount with the slug from useParams', () => {
    render(<MenuPageClient />);
    expect(loadRestaurantMock).toHaveBeenCalled();
  });

  it('does not render Tony when ai chat is enabled but no chat worker URL is configured', () => {
    const previous = process.env.NEXT_PUBLIC_CHAT_WORKER_URL;
    delete process.env.NEXT_PUBLIC_CHAT_WORKER_URL;
    useRestaurantStore.setState({ data: menuData, isLoading: false } as never);

    render(<MenuPageClient />);

    expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument();
    expect(chatPanelMock).not.toHaveBeenCalled();
    if (previous === undefined) delete process.env.NEXT_PUBLIC_CHAT_WORKER_URL;
    else process.env.NEXT_PUBLIC_CHAT_WORKER_URL = previous;
  });

  it('renders Tony only when a chat worker URL is configured', () => {
    const previous = process.env.NEXT_PUBLIC_CHAT_WORKER_URL;
    process.env.NEXT_PUBLIC_CHAT_WORKER_URL = 'https://chat.example.com';
    useRestaurantStore.setState({ data: menuData, isLoading: false } as never);

    render(<MenuPageClient />);

    expect(screen.getAllByTestId('chat-panel')).toHaveLength(1);
    if (previous === undefined) delete process.env.NEXT_PUBLIC_CHAT_WORKER_URL;
    else process.env.NEXT_PUBLIC_CHAT_WORKER_URL = previous;
  });

  it('renders a localized TonyMenu GitHub credit at the end of the menu', () => {
    useRestaurantStore.setState({ data: menuData, isLoading: false } as never);

    render(<MenuPageClient />);

    const credit = screen.getByRole('link', { name: 'poweredByTonyMenu' });
    expect(credit).toHaveAttribute('href', 'https://github.com/vekexasia/tony-menu');
    expect(credit).toHaveAttribute('target', '_blank');
    expect(credit).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('hides the selection header link when menu selection is disabled', () => {
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({
      version: 1,
      restaurantId: 'demo-restaurant',
      updatedAt: Date.now(),
      lines: [{ entryId: 'entry-bruschetta', quantity: 1, addedAt: Date.now() }],
    }));
    useRestaurantStore.setState({ data: menuData, isLoading: false } as never);

    render(<MenuPageClient />);

    expect(screen.queryByRole('link', { name: /selection.link/i })).not.toBeInTheDocument();
  });

  it('shows the selection header link when enabled and count is greater than zero', async () => {
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({
      version: 1,
      restaurantId: 'demo-restaurant',
      updatedAt: Date.now(),
      lines: [{ entryId: 'entry-bruschetta', quantity: 2, addedAt: Date.now() }],
    }));
    useRestaurantStore.setState({ data: { ...menuData, features: { aiChat: true, selection: true } } as unknown as RestaurantData, isLoading: false });

    render(<MenuPageClient />);

    const selectionLink = await screen.findByRole('link', { name: /selection.link/i });
    expect(selectionLink).toHaveAttribute('href', '/it/selection');
  });
});
