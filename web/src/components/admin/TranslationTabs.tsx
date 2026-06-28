"use client";

import { useState } from "react";
import { locales, type Locale } from "@/lib/i18n-config";
import { translateText } from "@/lib/api";
import { Flag } from "@/components/ui/Flag";
import { LOCALE_LABELS } from "@/lib/locale-flags";
import { useTranslations } from "@/lib/i18n";



const STANDARD_LOCALES: Locale[] = (locales as readonly string[]).filter(
  (l): l is Locale => l in LOCALE_LABELS
);

const labelForLocale = (
  code: string,
  customLocales?: { code: string; name: string }[] | null,
): string =>
  LOCALE_LABELS[code]
    ?? customLocales?.find((c) => c.code === code)?.name
    ?? code;

type I18nData = Record<string, Record<string, string>>;

export type TranslationField = {
  key: string;
  label: string;
  multiline?: boolean;
  sourceValue: string;
};

interface TranslationTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Fields to show in non-primary tabs (name, desc, etc.) */
  fields: TranslationField[];
  /** Current i18n map: { [locale]: { [fieldKey]: value } } */
  i18n: I18nData;
  onI18nChange: (updated: I18nData) => void;
  /** Content to render inside the primary-locale tab */
  children: React.ReactNode;
  /** Primary/source locale for menu items. Defaults to "it". */
  primaryLocale?: string;
  /** Enabled non-primary locales for public visibility. null/undefined = all enabled. */
  enabledLocales?: string[] | null;
  /** Disabled non-primary locales — completely hidden from admin and frontend. */
  disabledLocales?: string[] | null;
  /** Admin-defined custom locales (e.g. [{code:"vec", name:"Veneto"}]) */
  customLocales?: { code: string; name: string; flagUrl?: string | null }[] | null;
}

async function callTranslateApi(
  sourceText: string,
  targetLocale: string,
  field: string
): Promise<string> {
  const { translatedText } = await translateText(sourceText, targetLocale, field);
  return translatedText;
}

export function TranslationTabs({
  activeTab,
  onTabChange,
  fields,
  i18n,
  onI18nChange,
  children,
  primaryLocale = "it",
  enabledLocales,
  disabledLocales,
  customLocales,
}: TranslationTabsProps) {
  const t = useTranslations("admin");
  // Filter out disabled locales and the primary locale — they are not shown as translation tabs.
  const disabledSet = new Set(disabledLocales ?? []);
  const allLocales: { code: string; label: string; customFlagUrl?: string | null }[] = [
    ...STANDARD_LOCALES.filter((l) => l !== primaryLocale).map((l) => ({ code: l, label: LOCALE_LABELS[l] })),
    ...(customLocales ?? []).filter((cl) => cl.code !== primaryLocale).map((cl) => ({ code: cl.code, label: cl.name, customFlagUrl: cl.flagUrl ?? null })),
  ].filter((l) => !disabledSet.has(l.code));
  const primaryLabel = labelForLocale(primaryLocale, customLocales);
  const [translating, setTranslating] = useState<Record<string, boolean>>({});
  const [translateError, setTranslateError] = useState<string | null>(null);

  const getValue = (locale: string, fieldKey: string) =>
    i18n?.[locale]?.[fieldKey] || "";

  const setValue = (locale: string, fieldKey: string, value: string) => {
    const updated: I18nData = { ...i18n };
    if (value.trim()) {
      updated[locale] = { ...updated[locale], [fieldKey]: value };
    } else {
      const localeData = { ...(updated[locale] || {}) };
      delete localeData[fieldKey];
      if (Object.keys(localeData).length === 0) {
        delete updated[locale];
      } else {
        updated[locale] = localeData;
      }
    }
    onI18nChange(updated);
  };

  const translateField = async (locale: string, field: TranslationField) => {
    if (!field.sourceValue.trim()) return;
    const stateKey = `${locale}.${field.key}`;
    setTranslateError(null);
    setTranslating((t) => ({ ...t, [stateKey]: true }));
    try {
      const translated = await callTranslateApi(field.sourceValue, locale, field.key);
      setValue(locale, field.key, translated);
    } catch {
      setTranslateError(t("translationTabs.translateFailed"));
    } finally {
      setTranslating((t) => ({ ...t, [stateKey]: false }));
    }
  };

  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const translateBulkAcrossLocales = async (overwrite: boolean) => {
    type WorkItem = { locale: string; field: TranslationField };
    const workItems: WorkItem[] = [];
    for (const locale of allLocales.map((l) => l.code)) {
      for (const field of fields) {
        if (!field.sourceValue.trim()) continue;
        const existing = getValue(locale, field.key);
        if (existing && !overwrite) continue;
        workItems.push({ locale, field });
      }
    }
    if (workItems.length === 0) return;

    setBulkRunning(true);
    setTranslateError(null);
    setBulkProgress({ done: 0, total: workItems.length });

    const results: Record<string, Record<string, string>> = {};
    let done = 0;
    let failed = 0;
    for (const item of workItems) {
      try {
        const translated = await callTranslateApi(item.field.sourceValue, item.locale, item.field.key);
        if (!results[item.locale]) results[item.locale] = {};
        results[item.locale][item.field.key] = translated;
      } catch {
        failed++;
      }
      done++;
      setBulkProgress({ done, total: workItems.length });
    }
    if (failed > 0) {
      setTranslateError(t("translationTabs.bulkFailed").replace("{failed}", String(failed)).replace("{total}", String(workItems.length)));
    }

    if (Object.keys(results).length > 0) {
      const updated: I18nData = { ...i18n };
      for (const [locale, fieldsMap] of Object.entries(results)) {
        updated[locale] = { ...(updated[locale] || {}), ...fieldsMap };
      }
      onI18nChange(updated);
    }
    setBulkRunning(false);
    setTimeout(() => setBulkProgress(null), 2500);
  };

  const translateAllFields = async (locale: string) => {
    setTranslateError(null);
    // Collect all results before writing to avoid stale-closure overwrites.
    // If we called setValue after each await, each call would close over the
    // i18n from *this* render and the second write would erase the first.
    const results: Record<string, string> = {};
    for (const field of fields) {
      if (!field.sourceValue.trim()) continue;
      const stateKey = `${locale}.${field.key}`;
      setTranslating((t) => ({ ...t, [stateKey]: true }));
      try {
        results[field.key] = await callTranslateApi(field.sourceValue, locale, field.key);
      } catch {
        setTranslateError(t("translationTabs.translateFailed"));
      } finally {
        setTranslating((t) => ({ ...t, [stateKey]: false }));
      }
    }
    if (Object.keys(results).length > 0) {
      const updated: I18nData = { ...i18n };
      updated[locale] = { ...(updated[locale] || {}), ...results };
      onI18nChange(updated);
    }
  };

  /** True if every non-empty source field has a translation for this locale */
  const isLocaleComplete = (locale: string) =>
    fields
      .filter((f) => f.sourceValue.trim())
      .every((f) => getValue(locale, f.key).trim());

  const isTranslatingLocale = (locale: string) =>
    fields.some((f) => translating[`${locale}.${f.key}`]);

  return (
    <div>
      {/* Bulk translate actions */}
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => translateBulkAcrossLocales(false)}
          disabled={bulkRunning}
          className="text-xs px-3 py-1.5 bg-primary text-white rounded-full hover:opacity-90 disabled:opacity-50 transition-colors"
        >
          {t("translationTabs.missing")}
        </button>
        <button
          type="button"
          // ponytail NOTE: retranslate is a bulk-action confirm, not a delete; ConfirmDeleteModal doesn't fit. Upgrade to a generic confirm modal if more of these appear.
          onClick={() => {
            if (window.confirm(t("translationTabs.retranslateConfirm"))) {
              translateBulkAcrossLocales(true);
            }
          }}
          disabled={bulkRunning}
          className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          {t("translationTabs.retranslate")}
        </button>
        {bulkProgress && (
          <span className="text-xs text-gray-500">
            {bulkRunning
              ? t("translationTabs.translatingProgress").replace("{done}", String(bulkProgress.done)).replace("{total}", String(bulkProgress.total))
              : t("translationTabs.completedProgress").replace("{done}", String(bulkProgress.done)).replace("{total}", String(bulkProgress.total))}
          </span>
        )}
      </div>

      {translateError && (
        <div className="mb-2 px-3 py-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs">
          {translateError}
        </div>
      )}

      {/* Tab row */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {/* Primary locale */}
        <button
          type="button"
          onClick={() => onTabChange(primaryLocale)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === primaryLocale
              ? "bg-primary text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Flag code={primaryLocale} decorative />
          <span>{primaryLabel}</span>
        </button>

        {/* Non-primary locales */}
        {allLocales.map(({ code, label, customFlagUrl }) => {
          const complete = isLocaleComplete(code);
          const isActive = activeTab === code;
          const isPublic = enabledLocales == null || enabledLocales.includes(code);
          return (
            <button
              key={code}
              type="button"
              onClick={() => onTabChange(code)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-white"
                  : isPublic
                  ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  : "bg-gray-50 text-gray-400 hover:bg-gray-100 border border-dashed border-gray-300"
              }`}
            >
              <Flag code={code} customUrl={customFlagUrl} decorative />
              <span>{label}</span>
              {!isPublic && (
                <span className={`text-xs px-1 rounded-full leading-4 ${isActive ? "bg-gray-300 text-gray-700" : "bg-gray-100 text-gray-400"}`}>
                  {t("translationTabs.hidden")}
                </span>
              )}
              <span
                className={`text-xs px-1 rounded-full leading-4 ${
                  complete
                    ? isActive
                      ? "adm-pill-ok opacity-90"
                      : "adm-pill-ok"
                    : isActive
                    ? "bg-yellow-200 text-yellow-800"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {complete ? "✓" : "!"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Primary locale tab content */}
      {activeTab === primaryLocale && <>{children}</>}

      {/* Non-primary tab content */}
      {activeTab !== primaryLocale && (() => {
        const locale = activeTab;
        const localeInfo = allLocales.find((l) => l.code === locale) ?? { code: locale, label: locale };
        const isRunning = isTranslatingLocale(locale);

        return (
          <div className="space-y-3">
            {/* Translate-all button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => translateAllFields(locale)}
                disabled={isRunning}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 adm-pill-accent rounded-lg hover:opacity-80 disabled:opacity-50 transition-colors"
              >
                {isRunning ? t("translationTabs.translatingInProgress") : t("translationTabs.translateAllIn").replace("{label}", localeInfo.label)}
              </button>
            </div>

            {/* Per-field inputs */}
            {fields.map((field) => {
              const stateKey = `${locale}.${field.key}`;
              const isFieldTranslating = translating[stateKey];
              const currentValue = getValue(locale, field.key);

              return (
                <div key={field.key}>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-gray-500">
                      {field.label} ({localeInfo.label})
                    </label>
                    <button
                      type="button"
                      onClick={() => translateField(locale, field)}
                      disabled={isFieldTranslating || !field.sourceValue.trim()}
                      className="text-xs disabled:opacity-40" style={{ color: 'var(--adm-accent)' }}
                      title={t("translationTabs.autoTranslate")}
                    >
                      {isFieldTranslating ? "⏳" : t("translationTabs.autoLabel")}
                    </button>
                  </div>
                  {field.multiline ? (
                    <textarea
                      value={currentValue}
                      onChange={(e) => setValue(locale, field.key, e.target.value)}
                      placeholder={field.sourceValue || t("translationTabs.translationPlaceholder")}
                      rows={3}
                      className="w-full px-3 py-2 border rounded-lg text-sm resize-y"
                    />
                  ) : (
                    <input
                      type="text"
                      value={currentValue}
                      onChange={(e) => setValue(locale, field.key, e.target.value)}
                      placeholder={field.sourceValue}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
