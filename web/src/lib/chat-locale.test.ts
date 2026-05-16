import { describe, expect, it } from 'vitest';

import { detectChatLocale } from './chat-locale';

describe('detectChatLocale', () => {
  it('detects Italian from a diner message', () => {
    expect(detectChatLocale('Vorrei un antipasto senza formaggio', 'en')).toBe('it');
  });

  it('detects German from a diner message', () => {
    expect(detectChatLocale('Ich möchte ein vegetarisches Gericht ohne Milch', 'en')).toBe('de');
  });

  it('uses n-gram detection beyond fixed German keywords', () => {
    expect(detectChatLocale('Haben Sie eine Empfehlung?', 'it')).toBe('de');
  });

  it('keeps the fallback locale for ambiguous messages', () => {
    expect(detectChatLocale('menu', 'en')).toBe('en');
  });
});
