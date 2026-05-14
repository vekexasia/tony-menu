'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useIsChatStreaming } from '@/stores/chatStore';
import { useTranslations } from '@/lib/i18n';
import { Flag } from '@/components/ui/Flag';
import { createPortal } from 'react-dom';

type SpeechRecognitionResultListLike = Array<{ isFinal: boolean; 0: { transcript: string } }>;

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: SpeechRecognitionResultListLike }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

interface ChatInputProps {
  locale: string;
  onSend: (message: string) => void;
  onCancel: () => void;
  voiceEnabled?: boolean;
}

const SPEECH_LANGUAGE_STORAGE_KEY = 'risto-chat-speech-language';

const SPEECH_LANGUAGE_OPTIONS = [
  { value: 'it-IT', label: 'IT', flag: 'it' },
  { value: 'en-US', label: 'EN', flag: 'en' },
  { value: 'de-DE', label: 'DE', flag: 'de' },
  { value: 'fr-FR', label: 'FR', flag: 'fr' },
  { value: 'es-ES', label: 'ES', flag: 'es' },
  { value: 'nl-NL', label: 'NL', flag: 'nl' },
  { value: 'pt-PT', label: 'PT', flag: 'pt' },
  { value: 'hu-HU', label: 'HU', flag: 'hu' },
  { value: 'ru-RU', label: 'RU', flag: 'ru' },
] as const;

const SPEECH_LANGUAGE_VALUES = new Set<string>(SPEECH_LANGUAGE_OPTIONS.map(option => option.value));

const SPEECH_LOCALES: Record<string, string> = {
  it: 'it-IT',
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  nl: 'nl-NL',
  ru: 'ru-RU',
  pt: 'pt-PT',
  hu: 'hu-HU',
  vec: 'it-IT',
};

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function normalizeSpeechLanguage(language: string | undefined, fallback: string): string {
  if (!language) return fallback;
  const exact = SPEECH_LANGUAGE_OPTIONS.find(option => option.value.toLowerCase() === language.toLowerCase());
  if (exact) return exact.value;

  const base = language.split('-')[0].toLowerCase();
  const byBase = SPEECH_LANGUAGE_OPTIONS.find(option => option.value.toLowerCase().startsWith(`${base}-`));
  return byBase?.value ?? fallback;
}

function getInitialSpeechLanguage(locale: string): string {
  const localeFallback = SPEECH_LOCALES[locale] ?? locale;
  if (typeof window === 'undefined') return localeFallback;

  const stored = window.localStorage.getItem(SPEECH_LANGUAGE_STORAGE_KEY);
  if (stored && SPEECH_LANGUAGE_VALUES.has(stored)) return stored;

  return normalizeSpeechLanguage(window.navigator.language, localeFallback);
}

export function ChatInput({ locale, onSend, onCancel, voiceEnabled = true }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [speechLanguage, setSpeechLanguage] = useState(() => getInitialSpeechLanguage(locale));
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const isStreaming = useIsChatStreaming();
  const t = useTranslations('chat');
  const SpeechRecognition = useMemo(() => getSpeechRecognition(), []);
  const activeSpeechOption = SPEECH_LANGUAGE_OPTIONS.find(option => option.value === speechLanguage) ?? SPEECH_LANGUAGE_OPTIONS[0];
  const canUseSpeechRecognition = voiceEnabled && Boolean(SpeechRecognition);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setValue('');
  }, [value, isStreaming, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const startRecognition = useCallback((language: string) => {
    if (!canUseSpeechRecognition || !SpeechRecognition || isStreaming) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) transcript += result[0].transcript;
      }
      if (transcript.trim()) {
        setValue((current) => `${current}${current.trim() ? ' ' : ''}${transcript.trim()}`);
      }
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, [SpeechRecognition, canUseSpeechRecognition, isStreaming]);

  const handleVoiceToggle = useCallback(() => {
    if (!canUseSpeechRecognition || !SpeechRecognition || isStreaming) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    startRecognition(speechLanguage);
  }, [SpeechRecognition, canUseSpeechRecognition, isListening, isStreaming, speechLanguage, startRecognition]);

  useEffect(() => {
    if (isStreaming && isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
  }, [isStreaming, isListening]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const handleSpeechLanguageSelect = useCallback((nextLanguage: string) => {
    setSpeechLanguage(nextLanguage);
    window.localStorage.setItem(SPEECH_LANGUAGE_STORAGE_KEY, nextLanguage);
    setIsLanguagePickerOpen(false);
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
  }, [isListening]);

  useEffect(() => {
    if (!isLanguagePickerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!pickerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setIsLanguagePickerOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isLanguagePickerOpen]);

  return (
    <div className="border-t border-gray-200 p-3 flex gap-2 items-end bg-white">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('inputPlaceholder')}
        className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm outline-none focus:ring-2 focus:ring-primary/30"
        disabled={isStreaming}
      />
      {isStreaming ? (
        <button
          onClick={onCancel}
          className="p-2.5 rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors flex-shrink-0"
          aria-label="Stop"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
          </svg>
        </button>
      ) : (
        <>
          {canUseSpeechRecognition && (
            <div ref={pickerRef} className="relative flex-shrink-0">
              <div className="flex items-center rounded-full bg-gray-100 border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsLanguagePickerOpen((open) => !open)}
                  className="flex items-center gap-1.5 px-2.5 py-2 hover:bg-gray-200 transition-colors"
                  aria-label={t('voiceLanguage')}
                  aria-expanded={isLanguagePickerOpen}
                >
                  <Flag code={activeSpeechOption.flag} label={activeSpeechOption.label} className="h-4 w-6 rounded-sm object-cover ring-1 ring-black/10" />
                  <span className="text-[11px] font-bold text-gray-700 leading-none">{activeSpeechOption.label}</span>
                </button>
                <button
                  type="button"
                  onClick={handleVoiceToggle}
                  className={`p-2.5 rounded-full transition-colors ${isListening ? 'bg-red-100 text-red-600' : 'text-gray-600 hover:bg-gray-200'}`}
                  aria-label={t('voiceDictation')}
                  aria-pressed={isListening}
                >
                  {isListening ? (
                    <span className="flex h-5 w-5 items-center justify-center gap-0.5" aria-label={t('voiceListening')}>
                      <span className="h-2 w-1 animate-pulse rounded-full bg-current" />
                      <span className="h-4 w-1 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
                      <span className="h-5 w-1 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
                      <span className="h-3 w-1 animate-pulse rounded-full bg-current [animation-delay:360ms]" />
                    </span>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                      <path d="M8.25 4.5a3.75 3.75 0 117.5 0v7.5a3.75 3.75 0 11-7.5 0v-7.5z" />
                      <path d="M6 10.5a.75.75 0 01.75.75v.75a5.25 5.25 0 0010.5 0v-.75a.75.75 0 011.5 0v.75a6.75 6.75 0 01-6 6.708v1.542h2.25a.75.75 0 010 1.5H9a.75.75 0 010-1.5h2.25v-1.542a6.75 6.75 0 01-6-6.708v-.75A.75.75 0 016 10.5z" />
                    </svg>
                  )}
                </button>
              </div>
              {isLanguagePickerOpen && createPortal(
                <div ref={popoverRef} className="fixed bottom-20 right-4 z-[60] w-56 rounded-2xl border border-gray-200 bg-white p-2.5 shadow-2xl ring-1 ring-black/5 md:right-20" role="listbox" aria-label={t('voiceLanguage')}>
                  <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {t('voiceLanguage')}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SPEECH_LANGUAGE_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleSpeechLanguageSelect(option.value)}
                        className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-bold transition-all ${speechLanguage === option.value ? 'bg-primary/10 text-primary ring-1 ring-primary/20' : 'text-gray-600 hover:bg-gray-100'}`}
                        role="option"
                        aria-selected={speechLanguage === option.value}
                      >
                        <Flag code={option.flag} label={option.label} className="h-4.5 w-7 rounded-sm object-cover ring-1 ring-black/10" />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>,
                document.body,
              )}
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="p-2.5 rounded-full bg-primary text-white disabled:opacity-40 hover:opacity-90 transition-opacity flex-shrink-0"
            aria-label="Send"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
