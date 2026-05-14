'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { I18nProvider, useTranslations } from '@/lib/i18n';
import { useChatStore, useChatPanelState, useChatUnread } from '@/stores/chatStore';
import { useStreamingChat } from '@/hooks/useStreamingChat';
import { detectChatLocale } from '@/lib/chat-locale';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { MenuItemDetail } from '@/components/menu/MenuItemDetail';
import type { MenuEntry } from '@/lib/types';

interface ChatPanelProps {
  locale: string;
  voiceEnabled?: boolean;
}

interface ChatPanelChromeProps extends ChatPanelProps {
  onSend: (message: string) => void;
  onCancel: () => void;
}

export function ChatPanel({ locale, voiceEnabled = false }: ChatPanelProps) {
  const { sendMessage, cancel } = useStreamingChat(locale);
  const [chatUiLocale, setChatUiLocale] = useState(locale);

  const handleSend = useCallback((message: string) => {
    setChatUiLocale(detectChatLocale(message, locale));
    sendMessage(message);
  }, [locale, sendMessage]);

  return (
    <I18nProvider locale={chatUiLocale}>
      <ChatPanelChrome locale={locale} voiceEnabled={voiceEnabled} onSend={handleSend} onCancel={cancel} />
    </I18nProvider>
  );
}

function ChatPanelChrome({ locale, voiceEnabled = false, onSend, onCancel }: ChatPanelChromeProps) {
  const t = useTranslations('chat');
  const panelState = useChatPanelState();
  const unreadCount = useChatUnread();
  const { openPanel, closePanel, minimizePanel } = useChatStore();
  const [detailItem, setDetailItem] = useState<MenuEntry | null>(null);
  const messages = useChatStore(s => s.messages);
  const isStreaming = useChatStore(s => s.isStreaming);

  const showChips = messages.length === 0 && !isStreaming;

  const CHIPS = [
    { key: 'whatIsLocal', labelKey: 'chipWhatIsLocal' },
    { key: 'winePairing', labelKey: 'chipWinePairing' },
    { key: 'vegetarian', labelKey: 'chipVegetarian' },
    { key: 'noDairy', labelKey: 'chipNoDairy' },
    { key: 'quickLunch', labelKey: 'chipQuickLunch' },
    { key: 'bestForKids', labelKey: 'chipBestForKids' },
  ] as const;

  const handleChipTap = useCallback((labelKey: string) => {
    const label = t(labelKey as Parameters<typeof t>[0]);
    onSend(label);
  }, [onSend, t]);

  const handleChoiceSelect = useCallback((messageId: string, selection: string) => {
    const store = useChatStore.getState();
    if (store.isStreaming) {
      onCancel();
      store.finishStream();
    }
    store.markChoicesAnswered(messageId);
    onSend(selection);
  }, [onSend, onCancel]);

  const handleToggle = useCallback(() => {
    if (panelState === 'open') {
      closePanel();
    } else {
      openPanel();
    }
  }, [panelState, openPanel, closePanel]);

  const isOpen = panelState === 'open';

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            onClick={handleToggle}
            className="fixed bottom-4 right-4 z-[45] w-14 h-14 rounded-full bg-primary text-white shadow-lg hover:shadow-xl hover:opacity-90 transition-all flex items-center justify-center"
            aria-label="Open chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.09.768 4.04 2.078 5.557a10.68 10.68 0 01-1.078 2.04c-.476.752-.512 1.381-.082 1.752.392.339.971.364 1.636.295z" clipRule="evenodd" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/30 z-[45]"
              onClick={closePanel}
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[45] md:left-auto md:right-4 md:bottom-4 md:w-[400px] md:rounded-2xl md:max-h-[600px] max-h-[80vh] bg-gray-50 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 bg-primary text-white rounded-t-2xl md:rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.09.768 4.04 2.078 5.557a10.68 10.68 0 01-1.078 2.04c-.476.752-.512 1.381-.082 1.752.392.339.971.364 1.636.295z" clipRule="evenodd" />
                  </svg>
                  <span className="font-semibold text-sm">Tony</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={minimizePanel} className="p-1.5 hover:bg-white/20 rounded-full transition-colors" aria-label="Minimize">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                    </svg>
                  </button>
                  <button onClick={closePanel} className="p-1.5 hover:bg-white/20 rounded-full transition-colors" aria-label="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <ChatMessages locale={locale} onItemClick={setDetailItem} onChoiceSelect={handleChoiceSelect} />

              {showChips && (
                <div className="px-3 pb-2 flex flex-wrap gap-2" data-testid="intent-chips">
                  {CHIPS.map(({ key, labelKey }) => (
                    <button
                      key={key}
                      onClick={() => handleChipTap(labelKey)}
                      className="px-3 py-1.5 text-xs rounded-full bg-white border border-primary/30 text-primary hover:bg-primary/10 transition-colors font-medium shadow-sm"
                      data-testid={`chip-${key}`}
                    >
                      {t(labelKey as Parameters<typeof t>[0])}
                    </button>
                  ))}
                </div>
              )}

              <ChatInput locale={locale} onSend={onSend} onCancel={onCancel} voiceEnabled={voiceEnabled} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <MenuItemDetail
        item={detailItem}
        onClose={() => setDetailItem(null)}
        locale={locale}
        hidePrice
      />
    </>
  );
}
