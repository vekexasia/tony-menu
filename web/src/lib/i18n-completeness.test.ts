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

const referenceKeys = flatKeys(it_msgs as RawMessages);

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
});
