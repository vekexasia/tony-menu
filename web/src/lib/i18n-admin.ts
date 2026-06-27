export type AdminI18nData = {
  [locale: string]: { name?: string | null; desc?: string | null } | undefined;
};

/**
 * Strip null/empty/whitespace-only fields from an admin i18n map before saving.
 * Old imported data can carry null name/desc fields; the API expects clean strings.
 */
export function sanitizeI18nData(
  i18n?: AdminI18nData | null,
): Record<string, Record<string, string>> {
  const sanitized: Record<string, Record<string, string>> = {};
  for (const [locale, fields] of Object.entries(i18n || {})) {
    const localeData: Record<string, string> = {};
    if (typeof fields?.name === "string" && fields.name.trim()) localeData.name = fields.name;
    if (typeof fields?.desc === "string" && fields.desc.trim()) localeData.desc = fields.desc;
    if (Object.keys(localeData).length > 0) sanitized[locale] = localeData;
  }
  return sanitized;
}
