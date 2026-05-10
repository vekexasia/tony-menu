import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { ChatInput } from './ChatInput';
import { I18nProvider } from '@/lib/i18n';
import { useChatStore } from '@/stores/chatStore';

class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];

  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: { resultIndex: number; results: Array<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }

  emitFinalTranscript(text: string) {
    this.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: text } }],
    });
  }
}

function renderInput(onSend = vi.fn(), locale = 'it') {
  render(
    <I18nProvider locale={locale}>
      <ChatInput locale={locale} onSend={onSend} onCancel={vi.fn()} />
    </I18nProvider>,
  );
  return { onSend };
}

function setNavigatorLanguage(language: string) {
  Object.defineProperty(window.navigator, 'language', {
    value: language,
    configurable: true,
  });
}

beforeEach(() => {
  useChatStore.setState({ isStreaming: false });
  window.localStorage.clear();
  setNavigatorLanguage('it-IT');
  FakeSpeechRecognition.instances = [];
  vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition);
  vi.stubGlobal('webkitSpeechRecognition', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ChatInput voice dictation', () => {
  it('starts browser speech recognition with the browser language by default', async () => {
    setNavigatorLanguage('it-IT');
    renderInput(vi.fn(), 'en');

    await userEvent.click(screen.getByLabelText('Voice dictation'));

    const recognition = FakeSpeechRecognition.instances[0];
    expect(recognition.lang).toBe('it-IT');
    expect(recognition.interimResults).toBe(true);
    expect(recognition.start).toHaveBeenCalledTimes(1);
  });

  it('writes the final transcript into the input without sending it automatically', async () => {
    const { onSend } = renderInput();
    await userEvent.click(screen.getByLabelText('Dettatura vocale'));

    act(() => {
      FakeSpeechRecognition.instances[0].emitFinalTranscript('Vorrei un antipasto');
    });

    expect(screen.getByPlaceholderText('Chiedi a Tony del menu...')).toHaveValue('Vorrei un antipasto');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('lets the diner change and persist the dictation language from the flag picker', async () => {
    renderInput();

    await userEvent.click(screen.getByLabelText('Lingua dettatura'));
    const picker = screen.getByRole('listbox', { name: 'Lingua dettatura' });
    await userEvent.click(within(picker).getByRole('option', { name: /DE/ }));
    await userEvent.click(screen.getByLabelText('Dettatura vocale'));

    expect(FakeSpeechRecognition.instances[0].lang).toBe('de-DE');
    expect(window.localStorage.getItem('risto-chat-speech-language')).toBe('de-DE');
  });

  it('shows a sound wave while dictation is active', async () => {
    renderInput();

    await userEvent.click(screen.getByLabelText('Dettatura vocale'));

    expect(screen.getByLabelText('Registrazione in corso')).toBeInTheDocument();
  });

  it('does not render microphone controls when Web Speech recognition is unavailable', () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);

    renderInput();

    expect(screen.queryByLabelText('Dettatura vocale')).not.toBeInTheDocument();
  });
});
