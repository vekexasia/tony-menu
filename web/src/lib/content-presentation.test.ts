import { describe, expect, it } from 'vitest';
import {
  getLocalizedContentValue,
  getSearchableContentTexts,
} from './content-presentation';

describe('content presentation', () => {
  const entity = {
    name: 'Baccalà mantecato',
    title: 'Menu',
    description: 'Ricetta classica',
    i18n: {
      en: {
        name: 'Creamed cod',
        title: 'Menu',
        description: 'Classic recipe',
      },
      vec: {
        name: 'Bacalà mantecà',
        title: 'Menù',
        desc: 'Riceta classica',
      },
    },
  };

  describe('getLocalizedContentValue', () => {
    it('returns locale translation when present', () => {
      expect(getLocalizedContentValue(entity, 'name', 'en')).toBe('Creamed cod');
    });

    it('supports desc/description aliases', () => {
      expect(getLocalizedContentValue(entity, 'description', 'vec')).toBe('Riceta classica');
      expect(getLocalizedContentValue(entity, 'description', 'en')).toBe('Classic recipe');
    });

    it('supports title translations', () => {
      expect(getLocalizedContentValue(entity, 'title', 'vec')).toBe('Menù');
    });

    it('falls back to base content when translation is missing', () => {
      expect(getLocalizedContentValue(entity, 'name', 'de')).toBe('Baccalà mantecato');
    });
  });


  describe('getSearchableContentTexts', () => {
    it('includes both Venetian and Italian names for Venetian UI search', () => {
      expect(
        getSearchableContentTexts({
          entity,
          field: 'name',
          locale: 'vec',
        })
      ).toEqual(['Baccalà mantecato', 'Bacalà mantecà']);
    });

    it('keeps Italian search on Italian names only', () => {
      expect(
        getSearchableContentTexts({
          entity,
          field: 'name',
          locale: 'it',
        })
      ).toEqual(['Baccalà mantecato']);
    });
  });
});
