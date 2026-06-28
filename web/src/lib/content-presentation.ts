import type { I18nMap } from './types';

export type LocalizedContentField = 'name' | 'description' | 'title';

export interface LocalizedContentEntity {
  name?: string;
  title?: string;
  description?: string;
  desc?: string;
  i18n?: I18nMap;
}

export function getLocalizedContentValue(
  entity: LocalizedContentEntity,
  field: LocalizedContentField,
  language?: string
): string {
  if (language) {
    const translatedValue = getTranslatedFieldValue(entity.i18n, language, field);
    if (translatedValue) {
      return translatedValue;
    }
  }

  return getBaseFieldValue(entity, field);
}

export function getSearchableContentTexts({
  entity,
  field = 'name',
  locale,
}: {
  entity: LocalizedContentEntity;
  field?: LocalizedContentField;
  locale?: string;
}): string[] {
  const values = [
    getBaseFieldValue(entity, field),
    getLocalizedContentValue(entity, field, locale),
  ];

  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  );
}

function getBaseFieldValue(
  entity: LocalizedContentEntity,
  field: LocalizedContentField
): string {
  if (field === 'name') {
    return entity.name?.trim() || '';
  }

  if (field === 'title') {
    return entity.title?.trim() || '';
  }

  return entity.description?.trim() || entity.desc?.trim() || '';
}

function getTranslatedFieldValue(
  i18n: I18nMap | undefined,
  language: string,
  field: LocalizedContentField
): string {
  const translation = i18n?.[language];
  if (!translation) {
    return '';
  }

  if (field === 'name') {
    return translation.name?.trim() || '';
  }

  if (field === 'title') {
    return translation.title?.trim() || '';
  }

  return translation.description?.trim() || translation.desc?.trim() || '';
}

