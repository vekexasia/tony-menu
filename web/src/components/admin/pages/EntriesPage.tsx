"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { updateEntry, reorderEntries, deleteEntry, translateText } from "@/lib/api";
import { runBulkTranslate } from "@/lib/bulk-translate";
import { sanitizeI18nData } from "@/lib/i18n-admin";
import { useLabels, useRestaurantStore } from "@/stores/restaurantStore";
import { ConfirmDeleteModal } from "@/components/admin/ConfirmDeleteModal";
import { SortableList, DragHandle } from "@/components/admin/SortableList";
import { useTranslations } from "@/lib/i18n";
import { LABEL_COLOR_STYLES, resolveLabel } from "@/lib/label-colors";
import { useAdminLocale } from "@/app/admin/AdminI18nProvider";

const STANDARD_TRANSLATION_LOCALES = ["it", "en", "de", "fr", "es", "nl", "ru", "pt", "hu"];
const TRANSLATE_THROTTLE_MS = 2200; // Gentle pacing: ~27 requests/min, below backend's 30/min limit.

interface I18nData {
  [locale: string]: {
    name?: string | null;
    desc?: string | null;
  };
}

interface MenuEntry {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  desc?: string;
  price: number;
  order: number;
  outOfStock: boolean;
  frozen: boolean;
  image?: string;
  allergens: string[];
  priceUnit?: string;
  i18n?: I18nData;
  menuIds: string[];
  labelIds: string[];
  hidden: boolean;
}

interface Category {
  id: string;
  name: string;
}

// Render rich text with HTML tags
function RichText({ html, className }: { html: string; className?: string }) {
  // Only allow safe tags: b, i, u
  const sanitizedHtml = html
    .replace(/<(?!\/?(?:b|i|u)>)[^>]*>/gi, "")
    .replace(/</g, "&lt;")
    .replace(/&lt;(\/?)b&gt;/gi, "<$1b>")
    .replace(/&lt;(\/?)i&gt;/gi, "<$1i>")
    .replace(/&lt;(\/?)u&gt;/gi, "<$1u>");

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}

export default function EntriesPage() {
  const t = useTranslations("admin");
  const searchParams = useSearchParams();
  const router = useRouter();
  const categoryId = searchParams.get("category");

  const [category, setCategory] = useState<Category | null>(null);
  const [entries, setEntries] = useState<MenuEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Reorder mode state
  const [reorderMode, setReorderMode] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  /** Menu filter: "ALL" = no filter, "NONE" = entries with no menu memberships, otherwise a menu id. */
  const [menuFilter, setMenuFilter] = useState<string>("ALL");
  // Delete confirmation state (used by the inline trash button on each row)
  const [deleteConfirm, setDeleteConfirm] = useState<MenuEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk translate state
  const [bulkTranslating, setBulkTranslating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
    success: number;
    failed: number;
    current?: string;
    status?: string;
  } | null>(null);

  // Load all categories for the move dropdown (also loads entries when API is enabled)
  const { loadRestaurant, categoriesCache, isLoading: storeLoading, data: restaurantData, error: storeError } = useRestaurantStore();
  const primaryLocale = restaurantData?.features?.primaryLocale ?? "it";
  const allLabels = useLabels();
  const { locale: adminLocale } = useAdminLocale();

  useEffect(() => {
    loadRestaurant();
  }, [loadRestaurant]);

  // Load entries from the D1-backed store once it has data.
  useEffect(() => {
    if (storeLoading) return;
    if (!restaurantData) {
      if (storeError) {
        setError(storeError);
        setLoading(false);
      }
      return;
    } // store hasn't loaded yet — wait

    if (categoryId) {
      const catPath = `menuEntries/${categoryId}`;
      const cachedCat = categoriesCache.get(catPath);

      if (!cachedCat) {
        setError("entries.categoryNotFound");
        setLoading(false);
        return;
      }

      setError(null);
      setCategory({ id: cachedCat.id, name: cachedCat.name });

      const loadedEntries: MenuEntry[] = cachedCat.entries.map((e) => ({
        id: e.id,
        categoryId: cachedCat.id,
        categoryName: cachedCat.name,
        name: e.name,
        desc: e.description || "",
        price: e.price,
        order: e.order,
        outOfStock: e.outOfStock,
        frozen: e.containsFrozenIngredient,
        image: e.image,
        allergens: (e.allergens || []) as string[],
        priceUnit: e.priceUnit,
        i18n: (e.i18n || {}) as I18nData,
        menuIds: e.menuIds,
        labelIds: (e.labelIds || []) as string[],
        hidden: e.hidden,
      }));

      setEntries(loadedEntries);
      setLoading(false);
      return;
    }

    setError(null);
    setCategory(null);

    const loadedEntries: MenuEntry[] = restaurantData.categories
      .flatMap((cat) =>
        [...cat.entries]
          .sort((a, b) => a.order - b.order)
          .map((e) => ({
            id: e.id,
            categoryId: cat.id,
            categoryName: cat.name,
            name: e.name,
            desc: e.description || "",
            price: e.price,
            order: e.order,
            outOfStock: e.outOfStock,
            frozen: e.containsFrozenIngredient,
            image: e.image,
            allergens: (e.allergens || []) as string[],
            priceUnit: e.priceUnit,
            i18n: (e.i18n || {}) as I18nData,
            menuIds: e.menuIds,
            labelIds: (e.labelIds || []) as string[],
            hidden: e.hidden,
          }))
      );

    setEntries(loadedEntries);
    setLoading(false);
  }, [categoryId, categoriesCache, storeLoading, restaurantData, storeError]);

  useEffect(() => {
    if (!categoryId) setReorderMode(false);
  }, [categoryId]);

  const formatPrice = (price: number, priceUnit?: string) => {
    const formatted = `€ ${price.toFixed(2).replace(".", ",")}`;
    return priceUnit ? `${formatted}/${priceUnit}` : formatted;
  };

  const disabledTranslationLocales = (restaurantData?.features?.disabledLocales ?? []) as string[];
  const customTranslationLocales = ((restaurantData?.features?.customLocales ?? []) as { code: string }[]).map((c) => c.code);
  const adminTranslationLocales = Array.from(
    new Set([
      ...STANDARD_TRANSLATION_LOCALES,
      ...customTranslationLocales,
    ].filter((code) => code !== primaryLocale && !disabledTranslationLocales.includes(code)))
  );

  const allMenus = restaurantData?.menus ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const hiddenEntriesCount = entries.filter((e) => e.hidden || e.menuIds.length === 0).length;
  const filteredByMenu = menuFilter === "ALL"
    ? entries
    : menuFilter === "NONE"
      ? entries.filter((e) => e.menuIds.length === 0)
      : entries.filter((e) => e.menuIds.includes(menuFilter));
  const filteredBySearch = normalizedQuery
    ? filteredByMenu.filter((e) => e.name.toLowerCase().includes(normalizedQuery))
    : filteredByMenu;
  const visibleEntries = (showHidden || reorderMode)
    ? filteredBySearch
    : filteredBySearch.filter((e) => !e.hidden && e.menuIds.length > 0);

  const missingTranslationLocales = (entry: MenuEntry) =>
    adminTranslationLocales.filter((locale) => {
      const translated = entry.i18n?.[locale];
      const missingName = entry.name.trim() && !translated?.name?.trim();
      const missingDesc = entry.desc?.trim() && !translated?.desc?.trim();
      return missingName || missingDesc;
    });


  const describeWorkItem = (item: { entry: MenuEntry; locale: string; field: "name" | "desc" }) =>
    `${item.entry.name} → ${item.locale.toUpperCase()} (${item.field === "name" ? t("entries.fieldNameLabel") : t("entries.fieldDescLabel")})`;

  // Navigation helpers — the dish form lives at /admin/items/edit
  const openEntry = (entryId: string, entryCategoryId: string) => {
    const params = new URLSearchParams({ entry: entryId, category: entryCategoryId });
    router.push(`/admin/items/edit?${params.toString()}`);
  };

  const openNewEntry = () => {
    if (!categoryId) return;
    const params = new URLSearchParams({ entry: "new", category: categoryId });
    router.push(`/admin/items/edit?${params.toString()}`);
  };

  // Move entry up or down
  const handleReorder = async (reordered: MenuEntry[]) => {
    // Optimistic local update
    setEntries(reordered.map((entry, i) => ({ ...entry, order: i })));

    try {
      await reorderEntries(
        reordered.map((entry, index) => ({ id: entry.id, order: index }))
      );
    } catch (err) {
      console.error("Error reordering entries:", err);
    }
  };

  // Delete entry
  const handleDeleteEntry = async () => {
    if (!deleteConfirm || !categoryId) return;

    setDeleting(true);

    try {
      await deleteEntry(deleteConfirm.id);

      // Update local state
      setEntries((prev) => prev.filter((e) => e.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Error deleting entry:", err);
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Bulk-translate all entries in the current category.
   * @param overwrite When false (default), skips fields that already have a translation.
   */
  const handleBulkTranslate = async (overwrite = false) => {
    if (!categoryId) return;

    const disabledCodes = (restaurantData?.features?.disabledLocales ?? []) as string[];
    const customCodes = ((restaurantData?.features?.customLocales ?? []) as { code: string }[]).map((c) => c.code);
    const standardCodes = STANDARD_TRANSLATION_LOCALES.filter((l) => l !== primaryLocale && !disabledCodes.includes(l));
    const targetLocales = Array.from(new Set([...standardCodes, ...customCodes.filter((l) => l !== primaryLocale && !disabledCodes.includes(l))]));

    type WorkItem = {
      entry: MenuEntry;
      locale: string;
      field: "name" | "desc";
      sourceText: string;
    };

    const workItems: WorkItem[] = [];

    for (const entry of entries) {
      for (const locale of targetLocales) {
        if (entry.name.trim()) {
          const existing = entry.i18n?.[locale]?.["name"];
          if (!existing || overwrite) {
            workItems.push({ entry, locale, field: "name", sourceText: entry.name });
          }
        }
        if (entry.desc?.trim()) {
          const existing = entry.i18n?.[locale]?.["desc"];
          if (!existing || overwrite) {
            workItems.push({ entry, locale, field: "desc", sourceText: entry.desc });
          }
        }
      }
    }

    if (workItems.length === 0) {
      setBulkProgress({ done: 0, total: 0, success: 0, failed: 0, current: t("entries.bulk.allComplete") });
      setTimeout(() => setBulkProgress(null), 3000);
      return;
    }

    setBulkTranslating(true);
    setBulkProgress({ done: 0, total: workItems.length, success: 0, failed: 0, current: t("entries.bulk.preparing") });

    // Build mutable i18n maps per entry
    const i18nByEntry: Record<string, I18nData> = {};
    for (const entry of entries) {
      i18nByEntry[entry.id] = JSON.parse(JSON.stringify(entry.i18n || {}));
    }

    await runBulkTranslate(workItems, {
      translate: (item) => translateText(item.sourceText, item.locale, item.field).then((r) => r.translatedText),
      onSuccess: (item, translatedText) => {
        if (!i18nByEntry[item.entry.id][item.locale]) {
          i18nByEntry[item.entry.id][item.locale] = {};
        }
        i18nByEntry[item.entry.id][item.locale][item.field] = translatedText;
      },
      describe: describeWorkItem,
      onProgress: setBulkProgress,
      inProgressStatus: t("entries.bulk.translationInProgress"),
      autoPauseStatus: t("entries.bulk.autoPause"),
      throttleMs: TRANSLATE_THROTTLE_MS,
    });

    // Persist each entry that changed. Sanitize first because old imported data can contain null i18n fields.
    const savedI18nByEntry: Record<string, Record<string, Record<string, string>>> = {};
    for (const entry of entries) {
      const updatedI18n = sanitizeI18nData(i18nByEntry[entry.id]);
      const originalI18n = sanitizeI18nData(entry.i18n);
      if (JSON.stringify(updatedI18n) === JSON.stringify(originalI18n)) continue;
      try {
        await updateEntry(entry.id, { i18n: updatedI18n });
        savedI18nByEntry[entry.id] = updatedI18n;
      } catch (err) {
        console.error("Bulk translate save error:", err);
      }
    }

    // Update local state only for entries that were successfully persisted.
    setEntries((prev) =>
      prev.map((e) => savedI18nByEntry[e.id] ? { ...e, i18n: savedI18nByEntry[e.id] } : e)
    );

    setBulkTranslating(false);
    setBulkProgress((prev) => prev ? { ...prev, status: undefined, current: t("entries.bulk.completed") } : null);
    setTimeout(() => setBulkProgress(null), 5000);
  };

  if (loading) {
    return (
      <div className="p-4 flex justify-center">
        <div className="text-gray-500">{t("entries.loadingEntries")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {t(error)}
        </div>
        <Link
          href={`/admin/categories`}
          className="mt-4 inline-block text-primary hover:underline"
        >
          {t("entries.backToCategories")}
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4" style={{ flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden' }}>
      {/* Header with back button */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/admin/categories`}
            className="p-2 hover:bg-gray-100 rounded-lg shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5 text-gray-600"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
          </Link>
          <h2 className="text-lg font-bold text-primary tracking-wider truncate">
            {(category?.name ?? t("entries.allItemsTitle")).toUpperCase()}
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {allMenus.length > 0 && !reorderMode && (
            <select
              value={menuFilter}
              onChange={(e) => setMenuFilter(e.target.value)}
              className="px-2 py-2 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 border-0"
              title={t("entries.filterByMenu")}
            >
              <option value="ALL">{t("entries.allMenus")}</option>
              {allMenus.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
              <option value="NONE">{t("entries.noMenu")}</option>
            </select>
          )}
          {hiddenEntriesCount > 0 && !reorderMode && (
            <button
              onClick={() => setShowHidden((v) => !v)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                showHidden ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              title={showHidden ? t("entries.hideHidden") : t("entries.showHidden")}
            >
              <i className={`fa-solid ${showHidden ? "fa-eye" : "fa-eye-slash"}`} style={{ fontSize: 11 }} />
              {showHidden ? t("entries.hideHiddenShort") : t("entries.showHiddenShort").replace("{count}", String(hiddenEntriesCount))}
            </button>
          )}
          {categoryId && (
            <button
              onClick={() => setReorderMode(!reorderMode)}
              className={`p-2 rounded-lg transition-colors ${
                reorderMode ? "bg-primary text-white" : "hover:bg-gray-100 text-gray-600"
              }`}
              title={reorderMode ? t("entries.endReorder") : t("entries.reorder")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>
          )}
          {categoryId && (
            <button
              onClick={openNewEntry}
              className="p-2 bg-primary text-white rounded-lg hover:bg-primary/90"
              title={t("entries.addEntry")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("entries.searchPlaceholder")}
          className="w-full h-10 rounded-lg border border-gray-200 bg-white pl-9 pr-9 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title={t("entries.clearSearch")}
          >
            <i className="fa-solid fa-xmark text-xs" />
          </button>
        )}
      </div>

      {/* Bulk translate bar */}
      {!reorderMode && entries.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="adm-pill-accent inline-flex h-8 w-8 items-center justify-center rounded-full">
                  ✨
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{t("entries.bulk.title")}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {bulkTranslating
                      ? bulkProgress?.current ?? t("entries.bulk.translationInProgress")
                      : t("entries.bulk.fillOrUpdate")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {bulkProgress && bulkProgress.total > 0 && (
                <span className="adm-pill-accent rounded-full px-2.5 py-1 text-xs font-semibold">
                  {bulkProgress.done}/{bulkProgress.total}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleBulkTranslate(false)}
                disabled={bulkTranslating}
                className="px-3 py-2 text-xs font-semibold bg-primary text-white rounded-full hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t("entries.bulk.missing")}
              </button>
              <button
                type="button"
                // ponytail NOTE: retranslate is a bulk-action confirm, not a delete; ConfirmDeleteModal doesn't fit. Upgrade to a generic confirm modal if more of these appear.
                onClick={() => {
                  if (window.confirm(t("entries.bulk.retranslateConfirm"))) {
                    handleBulkTranslate(true);
                  }
                }}
                disabled={bulkTranslating}
                className="px-3 py-2 text-xs font-semibold bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t("entries.bulk.retranslate")}
              </button>
            </div>
          </div>

          {bulkProgress && (
            <div className="border-t border-gray-100 bg-gray-50/70 px-3 py-2 space-y-2">
              {bulkProgress.total > 0 && (
                <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all"
                    style={{ width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%` }}
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {bulkProgress.total > 0 && (
                  <span className="font-semibold text-gray-700">
                    {Math.round((bulkProgress.done / bulkProgress.total) * 100)}%
                  </span>
                )}
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                  {t("entries.bulk.completedCount").replace("{count}", String(bulkProgress.success))}
                </span>
                {bulkProgress.failed > 0 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                    {t("entries.bulk.failedCount").replace("{count}", String(bulkProgress.failed))}
                  </span>
                )}
                {bulkProgress.status && (
                  <span className="text-gray-500">{bulkProgress.status}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Entries list */}
      {reorderMode ? (
        <SortableList
          items={visibleEntries}
          onReorder={handleReorder}
          className="space-y-3"
          renderItem={(entry, _index, dragHandleProps) => (
            <div
              className={`bg-white rounded-xl p-4 shadow-sm flex gap-4 ${
                entry.outOfStock ? "opacity-50" : ""
              } transition-shadow`}
            >
              <div className="flex flex-col justify-center gap-1">
                <DragHandle
                  ref={dragHandleProps.ref}
                  listeners={dragHandleProps.listeners}
                  attributes={dragHandleProps.attributes}
                />
                <button
                  onClick={() => setDeleteConfirm(entry)}
                  className="p-1 hover:bg-red-100 rounded text-red-500"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 flex gap-4">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-800">{entry.name}</h4>
                  {entry.desc && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                      <RichText html={entry.desc} />
                    </p>
                  )}
                  <p className="text-primary font-medium mt-2">
                    {formatPrice(entry.price, entry.priceUnit)}
                  </p>
                </div>
                {entry.image && (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200">
                    <Image
                      src={entry.image}
                      alt={entry.name}
                      fill
                      className="object-cover"
                      sizes="80px"
                      unoptimized
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        />
      ) : (
        <div className="space-y-3">
          {visibleEntries.map((entry) => {
            const missingLocales = missingTranslationLocales(entry);
            const entryLabels = entry.labelIds.length
              ? allLabels.filter((label) => entry.labelIds.includes(label.id)).map((label) => resolveLabel(label, adminLocale))
              : [];
            return (
            <div
              key={entry.id}
              className={`bg-white rounded-xl p-4 shadow-sm flex gap-4 ${
                entry.outOfStock ? "opacity-50" : ""
              } cursor-pointer hover:shadow-md transition-shadow`}
              onClick={() => openEntry(entry.id, entry.categoryId)}
            >
              <div className="flex-1 flex gap-4">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-800">{entry.name}</h4>
                  {entryLabels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {entryLabels.map((label) => {
                        const cs = LABEL_COLOR_STYLES[label.color] ?? LABEL_COLOR_STYLES.primary;
                        return (
                          <span
                            key={label.id}
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: cs.background, color: cs.color }}
                          >
                            {label.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {!categoryId && (
                    <p className="text-xs text-gray-400 mt-0.5">{entry.categoryName}</p>
                  )}
                  {entry.desc && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                      <RichText html={entry.desc} />
                    </p>
                  )}
                  <p className="text-primary font-medium mt-2">
                    {formatPrice(entry.price, entry.priceUnit)}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {entry.hidden && (
                      <span className="text-xs text-orange-500 font-medium">{t("entries.tag.hidden")}</span>
                    )}
                    {entry.menuIds.length === 0 && (
                      <span className="text-xs text-amber-600 font-medium">{t("entries.tag.noMenu")}</span>
                    )}
                    {allMenus.length > 1 && entry.menuIds.length > 0 && entry.menuIds.length < allMenus.length && (
                      <span className="text-xs text-gray-500 font-medium">
                        {allMenus.filter((m) => entry.menuIds.includes(m.id)).map((m) => m.title).join(" · ")}
                      </span>
                    )}
                    {entry.outOfStock && (
                      <span className="text-xs text-red-500 font-medium">{t("entries.tag.outOfStock")}</span>
                    )}
                    {entry.frozen && !entry.outOfStock && (
                      <span className="text-xs font-medium" style={{ color: 'var(--adm-accent)' }}>{t("entries.tag.frozen")}</span>
                    )}
                  </div>
                  {missingLocales.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[11px] font-medium text-amber-700">{t("entries.missingLabel")}</span>
                      {missingLocales.map((locale) => (
                        <span
                          key={locale}
                          className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5"
                        >
                          {locale}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {entry.image && (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200">
                    <Image
                      src={entry.image}
                      alt={entry.name}
                      fill
                      className="object-cover"
                      sizes="80px"
                      unoptimized
                    />
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {visibleEntries.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          {entries.length === 0 ? t("entries.entryEmpty") : t("entries.noResults")}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <ConfirmDeleteModal
          name={deleteConfirm.name}
          deleting={deleting}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={handleDeleteEntry}
          t={t}
        />
      )}
    </div>
  );
}
