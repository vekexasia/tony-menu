import { describe, expect, it } from 'vitest';
import { detectChatLocale, languageNameForLocale } from './locale';

describe('detectChatLocale', () => {
  it('detects German user text on an Italian menu page', () => {
    expect(detectChatLocale('Ich möchte etwas mit Fisch ohne Milch', 'it')).toBe('de');
  });

  it('uses n-gram detection beyond fixed German keywords', () => {
    expect(detectChatLocale('Haben Sie eine Empfehlung?', 'it')).toBe('de');
  });

  it('falls back to the page locale for short ambiguous food text', () => {
    expect(detectChatLocale('pizza', 'it')).toBe('it');
  });
});

describe('languageNameForLocale', () => {
  it('maps supported locales to prompt language names', () => {
    expect(languageNameForLocale('de')).toBe('German');
  });
});
