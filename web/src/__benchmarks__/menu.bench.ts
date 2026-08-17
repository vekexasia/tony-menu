import { bench, describe } from 'vitest';
import { detectChatLocale } from '@/lib/chat-locale';
import { getLocalizedContentValue, getSearchableContentTexts } from '@/lib/content-presentation';
import { locales } from '@/lib/i18n-config';
import { resolveLabel } from '@/lib/label-colors';
import { resolveInitialLocale } from '@/lib/locale-detection';
import { isMenuAvailableNow, type MenuSchedule } from '@/lib/menu-schedule';
import { isMenuEntryVisibleOnMenu } from '@/lib/types';
import { cn, formatPrice, sanitizeRichText } from '@/lib/utils';
import { makeMenuCategories, makeMenuEntries } from './fixtures';

const entries = makeMenuEntries();
const categories = makeMenuCategories();

describe('menu search', () => {
  // Typing in the search box re-filters every dish on every keystroke, in the
  // active locale plus the base language.
  bench('filter 300 entries by localized name and description', () => {
    const needle = 'plate number 12';
    entries.filter((entry) =>
      getSearchableContentTexts({ entity: entry, field: 'name', locale: 'de' })
        .concat(getSearchableContentTexts({ entity: entry, field: 'description', locale: 'de' }))
        .some((text) => text.toLowerCase().includes(needle)),
    );
  });

  bench('resolve localized names for 12 categories + 300 entries', () => {
    for (const category of categories) {
      getLocalizedContentValue(category, 'name', 'fr');
      for (const entry of category.entries) {
        getLocalizedContentValue(entry, 'name', 'fr');
        getLocalizedContentValue(entry, 'description', 'fr');
      }
    }
  });

  bench('resolve label translations for 300 entries', () => {
    for (let i = 0; i < 300; i++) {
      resolveLabel(
        {
          id: `label-${i % 8}`,
          name: `Label ${i % 8}`,
          color: 'primary',
          sortOrder: i % 8,
          i18n: { de: { name: `Etikett ${i % 8}` } },
        },
        'de',
      );
    }
  });
});

describe('menu visibility', () => {
  const schedules: MenuSchedule[] = [
    { availableFrom: '11:00', availableTo: '15:00', availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    { availableFrom: '22:00', availableTo: '02:00', availableDays: ['fri', 'sat'] },
    { availableFrom: null, availableTo: null, availableDays: null },
  ];
  const now = new Date('2024-06-14T12:30:00Z');

  bench('isMenuAvailableNow across day, overnight and always-on windows', () => {
    for (const schedule of schedules) {
      isMenuAvailableNow(schedule, now);
    }
  });

  bench('isMenuEntryVisibleOnMenu for 300 entries', () => {
    entries.filter((entry) => isMenuEntryVisibleOnMenu(entry, 'menu-1'));
  });
});

describe('rendering helpers', () => {
  const longDescription = entries[0].description!.repeat(8) + ' <b>chef</b> & <i>seasonal</i> <u>pick</u>';

  bench('formatPrice for 300 entries', () => {
    for (const entry of entries) {
      formatPrice(entry.price, entry.priceUnit);
    }
  });

  bench('sanitizeRichText on a long description', () => {
    sanitizeRichText(longDescription);
  });

  // cn() runs on essentially every component render.
  bench('cn - tailwind class merging with conflicts', () => {
    cn(
      'px-4 py-2 text-sm rounded-lg',
      'px-6 bg-white/80',
      false && 'hidden',
      'text-base font-medium',
      'ring-1 ring-black/5 shadow-sm',
    );
  });
});

describe('locale resolution', () => {
  bench('resolveInitialLocale from Accept-Language style list', () => {
    resolveInitialLocale({
      stored: null,
      preferredLanguages: ['de-AT', 'de', 'en-GB', 'en'],
      locales,
      defaultLocale: 'it',
    });
  });

  // tinyld language detection runs on every message a diner sends to the AI
  // waiter, and it is by far the heaviest pure-JS routine in the app.
  const italian = 'Buonasera, vorrei ordinare due porzioni di tagliatelle al ragu e una bottiglia di acqua naturale.';
  const german = 'Guten Abend, ich moechte bitte zwei Portionen Tagliatelle mit Ragout und eine Flasche Wasser bestellen.';

  bench('detectChatLocale - italian message', () => {
    detectChatLocale(italian, 'en');
  });

  bench('detectChatLocale - german message', () => {
    detectChatLocale(german, 'en');
  });

  bench('detectChatLocale - too short to detect (fallback path)', () => {
    detectChatLocale('ok', 'it');
  });
});
