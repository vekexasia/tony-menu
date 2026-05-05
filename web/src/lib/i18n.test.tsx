import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { I18nProvider, useTranslations, useLocale } from './i18n';
import { defaultLocale } from './i18n-config';

// Helper: wrap children in I18nProvider
function Wrapper({ locale, children }: { locale: string; children: React.ReactNode }) {
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}

// Helper component to call a hook and expose its result
function HookReporter<T>({ hook, onResult }: { hook: () => T; onResult: (r: T) => void }) {
  onResult(hook());
  return null;
}

describe('I18nProvider + useTranslations', () => {
  it('returns a translation for a top-level key in Italian', () => {
    let tFn!: (key: string) => string;
    render(
      <Wrapper locale="it">
        <HookReporter hook={useTranslations} onResult={(t) => { tFn = t; }} />
      </Wrapper>
    );
    // 'search' key exists in all locales
    expect(typeof tFn('search')).toBe('string');
    expect(tFn('search').length).toBeGreaterThan(0);
  });

  it('returns the key itself for missing top-level keys', () => {
    let tFn!: (key: string) => string;
    render(
      <Wrapper locale="it">
        <HookReporter hook={useTranslations} onResult={(t) => { tFn = t; }} />
      </Wrapper>
    );
    expect(tFn('__nonexistent_key__')).toBe('__nonexistent_key__');
  });

  it('falls back to default locale for unknown locale', () => {
    let tFn!: (key: string) => string;
    render(
      <Wrapper locale="zz">
        <HookReporter hook={useTranslations} onResult={(t) => { tFn = t; }} />
      </Wrapper>
    );
    // Should not throw; key lookup works
    expect(typeof tFn('search')).toBe('string');
  });

  it('useTranslations with namespace returns namespaced key', () => {
    let tFn!: (key: string) => string;
    render(
      <Wrapper locale="it">
        <HookReporter hook={() => useTranslations('chat')} onResult={(t) => { tFn = t; }} />
      </Wrapper>
    );
    // 'title' is a known key in chat namespace
    expect(typeof tFn('title')).toBe('string');
    expect(tFn('title').length).toBeGreaterThan(0);
  });

  it('useTranslations with namespace returns key for missing namespace key', () => {
    let tFn!: (key: string) => string;
    render(
      <Wrapper locale="it">
        <HookReporter hook={() => useTranslations('chat')} onResult={(t) => { tFn = t; }} />
      </Wrapper>
    );
    expect(tFn('__missing__')).toBe('__missing__');
  });

  it('useTranslations with non-existent namespace returns key', () => {
    let tFn!: (key: string) => string;
    render(
      <Wrapper locale="it">
        <HookReporter hook={() => useTranslations('__no_such_ns__')} onResult={(t) => { tFn = t; }} />
      </Wrapper>
    );
    expect(tFn('someKey')).toBe('someKey');
  });

  it('loads Venetian messages when locale is vec', () => {
    let tFn!: (key: string) => string;
    render(
      <Wrapper locale="vec">
        <HookReporter hook={useTranslations} onResult={(t) => { tFn = t; }} />
      </Wrapper>
    );
    expect(tFn('wineAndBeers')).toBe('VINI E BIRE');
  });

  it('loads Hungarian messages when locale is hu', () => {
    let tFn!: (key: string) => string;
    render(
      <Wrapper locale="hu">
        <HookReporter hook={useTranslations} onResult={(t) => { tFn = t; }} />
      </Wrapper>
    );
    expect(tFn('wineAndBeers')).toBe('BOROK ÉS SÖRÖK');
  });

  it('useLocale returns the current locale', () => {
    let locale!: string;
    render(
      <Wrapper locale="de">
        <HookReporter hook={useLocale} onResult={(l) => { locale = l; }} />
      </Wrapper>
    );
    expect(locale).toBe('de');
  });

  it('useLocale returns default locale outside provider', () => {
    // useLocale catches missing context and returns defaultLocale
    let locale!: string;
    render(<HookReporter hook={useLocale} onResult={(l) => { locale = l; }} />);
    expect(locale).toBe(defaultLocale);
  });

  it('useTranslations throws when used outside provider', () => {
    const Boom = () => { useTranslations(); return null; };
    expect(() => render(<Boom />)).toThrow('useTranslations must be used within I18nProvider');
  });
});
