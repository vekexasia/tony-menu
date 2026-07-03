import { describe, it, expect } from 'vitest';

import it_msgs from '../../messages/it.json';
import en_msgs from '../../messages/en.json';
import de_msgs from '../../messages/de.json';
import fr_msgs from '../../messages/fr.json';
import es_msgs from '../../messages/es.json';
import nl_msgs from '../../messages/nl.json';
import ru_msgs from '../../messages/ru.json';
import pt_msgs from '../../messages/pt.json';
import hu_msgs from '../../messages/hu.json';
import vec_msgs from '../../messages/vec.json';

type RawMessages = Record<string, string | Record<string, string>>;

function flatKeys(messages: RawMessages): string[] {
  const result: string[] = [];
  for (const [key, val] of Object.entries(messages)) {
    if (typeof val === 'string') {
      result.push(key);
    } else {
      for (const subkey of Object.keys(val)) {
        result.push(`${key}.${subkey}`);
      }
    }
  }
  return result;
}

function flatEntries(messages: RawMessages): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(messages)) {
    if (typeof val === 'string') {
      result[key] = val;
    } else {
      for (const [subkey, subval] of Object.entries(val)) {
        result[`${key}.${subkey}`] = subval;
      }
    }
  }
  return result;
}

const locales: [string, RawMessages][] = [
  ['en', en_msgs as RawMessages],
  ['de', de_msgs as RawMessages],
  ['fr', fr_msgs as RawMessages],
  ['es', es_msgs as RawMessages],
  ['nl', nl_msgs as RawMessages],
  ['ru', ru_msgs as RawMessages],
  ['pt', pt_msgs as RawMessages],
  ['hu', hu_msgs as RawMessages],
  ['vec', vec_msgs as RawMessages],
];

const translatedLocales: [string, RawMessages][] = [
  ['it', it_msgs as RawMessages],
  ...locales.filter(([locale]) => locale !== 'en'),
];

const referenceKeys = flatKeys(it_msgs as RawMessages);
const englishAdminMessages = flatEntries(en_msgs as RawMessages);
const adminAllergenKeys = Object.keys(englishAdminMessages).filter((key) =>
  key.startsWith('admin.entries.allergen.'),
);

const allowedAdminSameAsEnglish = new Set([
  'admin.analytics.period.24h',
  'admin.analytics.period.30d',
  'admin.analytics.period.7d',
  'admin.analytics.trendTitle',
  'admin.categories.filter.incomplete',
  'admin.categories.modal.fieldName',
  'admin.categories.rail.tip',
  'admin.categories.table.items',
  ...adminAllergenKeys,
  'admin.entries.fieldDescLabel',
  'admin.entries.labelsSection',
  'admin.entries.modal.descField',
  'admin.entries.modal.imageLabel',
  'admin.entries.modal.menuLabel',
  'admin.entries.modal.nameField',
  'admin.entries.modal.unitPlaceholder',
  'admin.hours.breadcrumbMenu',
  'admin.hours.dayOpen',
  'admin.labels.colorLabel',
  'admin.labels.nameLabel',
  'admin.labels.title',
  'admin.layout.nav.analytics',
  'admin.layout.nav.menu',
  'admin.layout.section.analytics',
  'admin.layout.section.chatAi',
  'admin.layout.section.items',
  'admin.layout.section.menus',
  'admin.menus.codeLabel',
  'admin.menus.entryMany',
  'admin.menus.entryOne',
  'admin.menus.icon.burger',
  'admin.menus.icon.cocktail',
  'admin.menus.icon.dessert',
  'admin.menus.icon.lunch',
  'admin.menus.icon.pizza',
  'admin.settings.cards.chatAgent',
  'admin.settings.cards.palette',
  'admin.settings.cards.socialMedia',
  'admin.settings.field.facebookUrl',
  'admin.settings.field.instagramUrl',
  'admin.settings.field.payoff',
  'admin.settings.field.region',
  'admin.settings.languages.codePlaceholder',
  'admin.settings.languages.namePlaceholder',
  'admin.settings.languages.standard',
  'admin.settings.languages.state.live',
  'admin.settings.publishing.menuPublic',
  'admin.settings.section.chatAi',
  'admin.translationTabs.autoLabel',
]);

describe('i18n completeness (IT is source of truth)', () => {
  for (const [locale, msgs] of locales) {
    it(`${locale}.json contains every key present in it.json`, () => {
      const present = new Set(flatKeys(msgs));
      const missing = referenceKeys.filter((k) => !present.has(k));
      expect(missing, `${locale}.json is missing keys:\n${missing.join('\n')}`).toEqual([]);
    });

    it(`${locale}.json has no keys absent from it.json`, () => {
      const refSet = new Set(referenceKeys);
      const extra = flatKeys(msgs).filter((k) => !refSet.has(k));
      expect(extra, `${locale}.json has extra keys not in it.json:\n${extra.join('\n')}`).toEqual([]);
    });
  }

  for (const [locale, msgs] of translatedLocales) {
    it(`${locale}.json does not copy English admin labels`, () => {
      const current = flatEntries(msgs);
      const copied = Object.entries(englishAdminMessages)
        .filter(([key]) => key.startsWith('admin.'))
        .filter(([key, value]) => current[key] === value && !allowedAdminSameAsEnglish.has(key))
        .map(([key]) => key);

      expect(copied, `${locale}.json has admin labels still copied from English:\n${copied.join('\n')}`).toEqual([]);
    });
  }
});
