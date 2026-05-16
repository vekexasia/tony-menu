import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatPanel } from './ChatPanel';
import { I18nProvider } from '@/lib/i18n';
import { useChatStore } from '@/stores/chatStore';

const sendMessage = vi.fn();

vi.mock('@/hooks/useStreamingChat', () => ({
  useStreamingChat: () => ({ sendMessage, cancel: vi.fn() }),
}));

const chatMessagesLocales: string[] = [];

vi.mock('./ChatMessages', () => ({
  ChatMessages: ({ locale }: { locale: string }) => {
    chatMessagesLocales.push(locale);
    return <div data-testid="chat-messages" />;
  },
}));

vi.mock('@/components/menu/MenuItemDetail', () => ({
  MenuItemDetail: () => null,
}));

function renderPanel(locale = 'en') {
  render(
    <I18nProvider locale={locale}>
      <ChatPanel locale={locale} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  sendMessage.mockClear();
  useChatStore.setState({ panelState: 'open', messages: [], isStreaming: false, unreadCount: 0 });
  vi.stubGlobal('SpeechRecognition', undefined);
  vi.stubGlobal('webkitSpeechRecognition', undefined);
  chatMessagesLocales.length = 0;
});

describe('ChatPanel runtime UI locale', () => {
  it('switches chat chrome to Italian after an Italian diner message on an English page', async () => {
    renderPanel('en');

    expect(screen.getByPlaceholderText('Ask Tony about the menu...')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Ask Tony about the menu...'), 'Vorrei un antipasto senza formaggio{enter}');

    expect(sendMessage).toHaveBeenCalledWith('Vorrei un antipasto senza formaggio');
    expect(screen.getByPlaceholderText('Chiedi a Tony del menu...')).toBeInTheDocument();
    expect(screen.getByText('Abbinamento vino')).toBeInTheDocument();
  });

  it('keeps the page locale for ambiguous messages', async () => {
    renderPanel('en');

    await userEvent.type(screen.getByPlaceholderText('Ask Tony about the menu...'), 'menu{enter}');

    expect(screen.getByPlaceholderText('Ask Tony about the menu...')).toBeInTheDocument();
  });

  it('uses the detected chat locale for item cards after a German diner message', async () => {
    renderPanel('it');

    await userEvent.type(screen.getByPlaceholderText('Chiedi a Tony del menu...'), 'Ich möchte Fisch ohne Milch{enter}');

    expect(chatMessagesLocales.at(-1)).toBe('de');
  });
});
