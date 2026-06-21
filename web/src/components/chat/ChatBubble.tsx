'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import type { ChatMessage } from '@/lib/chat-types';
import { useRestaurantStore } from '@/stores/restaurantStore';
import type { MenuEntry } from '@/lib/types';
import { getContentDisplayText, getLocalizedContentValue } from '@/lib/content-presentation';
import { useTranslations } from '@/lib/i18n';
import { LABEL_COLOR_STYLES, resolveLabel } from '@/lib/label-colors';

interface ChatBubbleProps {
  message: ChatMessage;
  locale: string;
  isStreaming?: boolean;
  onItemClick: (item: MenuEntry) => void;
  onChoiceSelect?: (selection: string) => void;
}

// Simple markdown to HTML: **bold**, *italic*, newlines
function renderMarkdown(text: string): string {
  return text
    // Strip leaked [id:xxx] and [category:xxx] references.
    // NOTE: do NOT use \s* prefix — eating surrounding whitespace merges adjacent words
    // when the model inserts [id:xxx] inline (e.g. "deliziose [id:op]zioni" → "deliziosezioni").
    .replace(/\[id:[^\]]+\]/g, '')
    .replace(/\[category:[^\]]+\]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}

function getLocalized(
  item: { name?: string; description?: string; desc?: string; i18n?: Record<string, Record<string, string>> },
  field: 'name' | 'description',
  locale: string
): string {
  return getLocalizedContentValue(item, field, locale);
}

function ItemCard({ itemId, locale, onClick }: { itemId: string; locale: string; onClick: (item: MenuEntry) => void }) {
  const data = useRestaurantStore(s => s.data);
  if (!data) return null;

  let entry: MenuEntry | undefined;
  for (const cat of data.categories) {
    entry = cat.entries.find(e => e.id === itemId);
    if (entry) break;
  }
  if (!entry) return null;

  const name = getContentDisplayText({
    entity: entry,
    field: 'name',
    locale,
    restaurantId: data.id,
  });
  const desc = getLocalized({ description: entry.description, i18n: entry.i18n }, 'description', locale) || entry.description;
  const labels = entry.labelIds?.length
    ? (data.labels ?? []).filter(label => entry.labelIds!.includes(label.id)).map(label => resolveLabel(label, locale))
    : [];

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(entry!); }}
      className="w-full flex gap-3 bg-gray-50 rounded-xl p-2.5 text-left hover:bg-gray-100 transition-colors border border-gray-100"
    >
      {entry.image && (
        <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200">
          <Image
            src={entry.image}
            alt={name.primary}
            fill
            className="object-cover"
            sizes="56px"
            unoptimized
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 text-xs leading-tight flex items-start justify-between gap-1">
          <span>
            <span className="block">{name.primary}</span>
            {name.secondary && (
              <span className="mt-0.5 block text-[10px] font-medium text-gray-500">
                {name.secondary}
              </span>
            )}
          </span>
          {entry.internalCode && (
            <span className="font-mono text-[10px] font-normal text-gray-400 shrink-0">{entry.internalCode}</span>
          )}
        </p>
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {labels.map(label => {
              const style = LABEL_COLOR_STYLES[label.color] ?? LABEL_COLOR_STYLES.primary;
              return (
                <span
                  key={label.id}
                  className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                  style={style}
                >
                  {label.name}
                </span>
              );
            })}
          </div>
        )}
        {desc && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{desc}</p>}
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0 self-center">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  );
}

function ChoiceButtons({
  choices,
  answered,
  onSelect,
}: {
  choices: ChatMessage['choices'];
  answered?: boolean;
  onSelect: (selection: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const isMulti = choices?.mode === 'multi';

  const t = useTranslations('chat');
  const handleClick = useCallback((option: string) => {
    if (answered) return;
    if (!isMulti) {
      onSelect(option);
      return;
    }
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });
  }, [isMulti, answered, onSelect]);

  const handleConfirm = useCallback(() => {
    if (selected.size === 0) return;
    onSelect(Array.from(selected).join(', '));
  }, [selected, onSelect]);

  if (!choices || choices.options.length === 0) return null;

  return (
    <div className="mt-2.5">
      {choices.prompt && (
        <p className="text-xs text-gray-500 mb-1.5">{choices.prompt}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {choices.options.map(option => {
          const isSelected = selected.has(option);
          const isAnswered = answered;
          return (
            <button
              key={option}
              onClick={() => handleClick(option)}
              disabled={!!isAnswered}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                isAnswered
                  ? isSelected
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-gray-50 border-gray-200 text-gray-400'
                  : isSelected
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-primary hover:text-primary active:scale-95'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      {isMulti && !answered && selected.size > 0 && (
        <button
          onClick={handleConfirm}
          className="mt-2 px-4 py-1.5 rounded-full text-xs font-medium bg-primary text-white hover:opacity-90 active:scale-95 transition-all"
        >
          {t('confirmSelection')} ({selected.size})
        </button>
      )}
    </div>
  );
}

function ItemCardSkeleton() {
  return (
    <div className="w-full flex gap-3 bg-gray-50 rounded-xl p-2.5 animate-pulse">
      <div className="w-14 h-14 rounded-lg bg-gray-200 flex-shrink-0" />
      <div className="flex-1 space-y-1.5 py-1">
        <div className="h-3 bg-gray-200 rounded w-2/3" />
        <div className="h-2.5 bg-gray-200 rounded w-full" />
        <div className="h-2.5 bg-gray-200 rounded w-1/4" />
      </div>
    </div>
  );
}

function ChoiceSkeleton() {
  return (
    <div className="mt-2.5 space-y-1.5 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-1/2 mb-1.5" />
      <div className="flex flex-wrap gap-1.5">
        <div className="h-7 bg-gray-200 rounded-full w-16" />
        <div className="h-7 bg-gray-200 rounded-full w-20" />
        <div className="h-7 bg-gray-200 rounded-full w-14" />
      </div>
    </div>
  );
}

export function ChatBubble({ message, locale, isStreaming, onItemClick, onChoiceSelect }: ChatBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary text-white rounded-br-md'
            : 'bg-white text-gray-800 rounded-bl-md shadow-sm'
        }`}
      >
        {message.content ? (
          isUser ? (
            message.content
          ) : (
            <span dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
          )
        ) : isStreaming && !message.choices && !(message.showItemIds?.length) ? (
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        ) : null}

        {/* Inline item cards — skeleton while streaming, real cards after */}
        {message.showItemIds && message.showItemIds.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {isStreaming ? (
              message.showItemIds.slice(0, 3).map((_, i) => (
                <ItemCardSkeleton key={i} />
              ))
            ) : (
              message.showItemIds.map(id => (
                <ItemCard key={id} itemId={id} locale={locale} onClick={onItemClick} />
              ))
            )}
          </div>
        )}

        {/* Choice buttons — skeleton while streaming, real buttons after */}
        {message.choices && onChoiceSelect && (
          isStreaming ? (
            <ChoiceSkeleton />
          ) : (
            <ChoiceButtons
              choices={message.choices}
              answered={message.choicesAnswered}
              onSelect={onChoiceSelect}
            />
          )
        )}
      </div>
    </div>
  );
}
