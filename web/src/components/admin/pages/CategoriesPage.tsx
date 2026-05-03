"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, createCategory, deleteCategory, updateCategory, reorderCategories, translateText } from "@/lib/api";
import { useRestaurantStore, useCategories } from "@/stores/restaurantStore";
import { SortableList } from "@/components/admin/SortableList";
import { TranslationTabs } from "@/components/admin/TranslationTabs";
import { locales } from "@/lib/i18n-config";
import { useTranslations } from "@/lib/i18n";

interface I18nData {
  [locale: string]: { name?: string };
}

interface Category {
  id: string;
  name: string;
  order: number;
  entryCount: number;
  entriesWithMissingTranslations: number;
  i18n?: I18nData;
}

const STANDARD_TRANSLATION_LOCALES = ["it", "en", "de", "fr", "es", "nl", "ru", "pt"];
const TRANSLATE_THROTTLE_MS = 2200;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type CategoryFilter = "all" | "visible" | "featured" | "incomplete";

export default function CategoriesPage() {
  const t = useTranslations("admin");
  const { isLoading, error: storeError, loadRestaurant } = useRestaurantStore();
  const storeCategories = useCategories();
  const { data } = useRestaurantStore();

  const disabledCodes = (data?.features?.disabledLocales ?? []) as string[];
  const customCodes = ((data?.features?.customLocales ?? []) as { code: string }[]).map((c) => c.code);
  const primaryLocale = data?.features?.primaryLocale ?? "it";
  const dishTranslationLocales = Array.from(
    new Set(
      [...STANDARD_TRANSLATION_LOCALES, ...customCodes].filter(
        (c) => c !== primaryLocale && !disabledCodes.includes(c),
      ),
    ),
  );

  const categories: Category[] = storeCategories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    order: cat.order,
    entryCount: cat.entries.length,
    entriesWithMissingTranslations: cat.entries.filter((e) =>
      dishTranslationLocales.some((locale) => {
        const translated = e.i18n?.[locale];
        const missingName = !!e.name?.trim() && !translated?.name?.trim();
        const missingDesc = !!e.description?.trim() && !translated?.desc?.trim();
        return missingName || missingDesc;
      })
    ).length,
    i18n: cat.i18n || {},
  }));

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>("all");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");
  const [editI18n, setEditI18n] = useState<I18nData>({});
  const [activeTab, setActiveTab] = useState(primaryLocale);
  const [saving, setSaving] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [bulkTranslating, setBulkTranslating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
    success: number;
    failed: number;
    current: string;
    status?: string;
  } | null>(null);

  const configuredLocales = Array.from(new Set([
    ...(locales as readonly string[]).filter((l) => l !== primaryLocale && !disabledCodes.includes(l)),
    ...customCodes.filter((l) => l !== primaryLocale && !disabledCodes.includes(l)),
  ]));

  useEffect(() => {
    loadRestaurant();
  }, [loadRestaurant]);

  const loading = isLoading || !data;
  const error = storeError;

  const filteredCategories = categories.filter((c) => {
    if (query && !c.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (activeFilter === "incomplete") {
      const titleMissing = configuredLocales.some((l) => !c.i18n?.[l]?.name);
      if (!titleMissing && c.entriesWithMissingTranslations === 0) return false;
    }
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredCategories.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredCategories.map((c) => c.id)));
    }
  };

  const openEditModal = (category: Category, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setEditingCategory(category);
    setEditName(category.name);
    setEditI18n(category.i18n || {});
    setActiveTab(primaryLocale);
    setSaveError(null);
  };

  const openCreateModal = () => {
    setEditingCategory({ id: "", name: "", order: categories.length, entryCount: 0, entriesWithMissingTranslations: 0, i18n: {} });
    setEditName("");
    setEditI18n({});
    setActiveTab(primaryLocale);
    setSaveError(null);
  };

  const handleSaveCategory = async () => {
    if (!editingCategory) return;
    setSaving(true);
    setSaveError(null);
    const isNew = editingCategory.id === "";
    try {
      if (isNew) {
        await createCategory({ name: editName });
      } else {
        await updateCategory(editingCategory.id, { name: editName, i18n: editI18n });
      }
      useRestaurantStore.getState().reset();
      await loadRestaurant();
      setEditingCategory(null);
    } catch (err) {
      console.error("Error saving category:", err);
      setSaveError(t("categories.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (category: Category, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    const message = category.entryCount > 0
      ? t("categories.confirmDeleteWithEntries").replace("{name}", category.name).replace("{count}", String(category.entryCount))
      : t("categories.confirmDelete").replace("{name}", category.name);
    if (!window.confirm(message)) return;

    setDeletingCategoryId(category.id);
    try {
      await deleteCategory(category.id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(category.id);
        return next;
      });
      useRestaurantStore.getState().reset();
      await loadRestaurant();
    } catch (err) {
      console.error("Error deleting category:", err);
      window.alert(t("categories.deleteFailed"));
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const handleBulkTranslateCategoryNames = async (overwrite = false) => {
    const targetLocales = Array.from(
      new Set(
        [
          ...STANDARD_TRANSLATION_LOCALES,
          ...customCodes,
        ].filter((c) => c !== primaryLocale && !disabledCodes.includes(c))
      )
    );

    type WorkItem = { category: Category; locale: string; sourceText: string };
    const workItems: WorkItem[] = [];
    for (const cat of categories) {
      if (!cat.name.trim()) continue;
      for (const locale of targetLocales) {
        const existing = cat.i18n?.[locale]?.name;
        if (!existing || overwrite) {
          workItems.push({ category: cat, locale, sourceText: cat.name });
        }
      }
    }

    if (workItems.length === 0) {
      setBulkProgress({ done: 0, total: 0, success: 0, failed: 0, current: t("categories.bulk.allComplete") });
      setTimeout(() => setBulkProgress(null), 3000);
      return;
    }

    setBulkTranslating(true);
    setBulkProgress({ done: 0, total: workItems.length, success: 0, failed: 0, current: t("categories.bulk.preparing") });

    const i18nByCategory: Record<string, I18nData> = {};
    for (const cat of categories) {
      i18nByCategory[cat.id] = JSON.parse(JSON.stringify(cat.i18n || {}));
    }

    let done = 0;
    let success = 0;
    let failed = 0;
    for (const item of workItems) {
      const current = `${item.category.name} → ${item.locale.toUpperCase()}`;
      setBulkProgress({ done, total: workItems.length, success, failed, current });
      try {
        const { translatedText } = await translateText(item.sourceText, item.locale, "name");
        if (translatedText) {
          if (!i18nByCategory[item.category.id][item.locale]) {
            i18nByCategory[item.category.id][item.locale] = {};
          }
          i18nByCategory[item.category.id][item.locale].name = translatedText;
          success++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
        if (err instanceof ApiError && err.status === 429) {
          setBulkProgress({ done, total: workItems.length, success, failed, current, status: t("categories.bulk.autoPause") });
          await sleep(60_000);
        }
      }
      done++;
      const hasMore = done < workItems.length;
      setBulkProgress({ done, total: workItems.length, success, failed, current, status: hasMore ? t("categories.bulk.translationInProgress") : undefined });
      if (hasMore) await sleep(TRANSLATE_THROTTLE_MS);
    }

    for (const cat of categories) {
      const updated = i18nByCategory[cat.id] as Record<string, Record<string, string>>;
      const original = (cat.i18n || {}) as Record<string, Record<string, string>>;
      if (JSON.stringify(updated) === JSON.stringify(original)) continue;
      try {
        await updateCategory(cat.id, { i18n: updated });
      } catch (err) {
        failed++;
        console.error("Bulk translate save error:", err);
      }
    }

    useRestaurantStore.getState().reset();
    await loadRestaurant();

    setBulkTranslating(false);
    setBulkProgress((prev) => prev ? { ...prev, status: undefined, current: t("categories.bulk.completed") } : null);
    setTimeout(() => setBulkProgress(null), 4000);
  };

  const handleReorder = async (reordered: Category[]) => {
    try {
      await reorderCategories(
        reordered.map((cat, index) => ({ id: cat.id, order: index }))
      );
      useRestaurantStore.getState().reset();
      await loadRestaurant();
    } catch (err) {
      console.error("Error reordering categories:", err);
    }
  };

  // ── Right rail data ─────────────────────────────────────────────
  const topCategories = [...categories]
    .sort((a, b) => b.entryCount - a.entryCount)
    .slice(0, 5);

  const totalEntries = categories.reduce((s, c) => s + c.entryCount, 0);
  const entriesWithMissing = categories.reduce((s, c) => s + c.entriesWithMissingTranslations, 0);
  const completeness =
    totalEntries > 0
      ? Math.round(((totalEntries - entriesWithMissing) / totalEntries) * 100)
      : 100;
  const missingTranslations = entriesWithMissing;

  const needsPhotos = categories.filter(
    (c) => c.entryCount > 0
  ).slice(-1)[0];

  // ── Loading / error states ──────────────────────────────────────
  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#9A9590", fontSize: 13 }}>{t("categories.loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, padding: "20px 24px" }}>
        <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", color: "#DC2626", fontSize: 13 }}>
          {error}
        </div>
      </div>
    );
  }

  const allChecked = selected.size === filteredCategories.length && filteredCategories.length > 0;
  const filters: { value: CategoryFilter; label: string }[] = [
    { value: "all", label: t("categories.filter.all") },
    { value: "visible", label: t("categories.filter.visible") },
    { value: "featured", label: t("categories.filter.featured") },
    { value: "incomplete", label: t("categories.filter.incomplete") },
  ];

  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0, overflow: "hidden" }}>

      {/* ── Main content ── */}
      <main className="adm-scroll" style={{ flex: 1, minWidth: 0, padding: "20px 24px", overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 0 }}>

        {/* Page header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--adm-accent-deep)", textTransform: "uppercase", letterSpacing: 0.6, display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
              <span>{t("layout.nav.menu")}</span>
              <span style={{ opacity: 0.4 }}>›</span>
              <span style={{ color: "#888" }}>{t("categories.breadcrumb")}</span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1F1A14", margin: 0, marginBottom: 5 }}>
              {t("categories.title")}
            </h1>
            <div style={{ fontSize: 12, color: "#888", display: "flex", gap: 6, alignItems: "center" }}>
              <span>{t("categories.countCategories").replace("{count}", String(filteredCategories.length))}</span>
              <span style={{ color: "#D4CFC9" }}>·</span>
              <span>{t("categories.countItemsTotal").replace("{count}", String(filteredCategories.reduce((s, c) => s + c.entryCount, 0)))}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={openCreateModal}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--adm-accent)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              <i className="fa-solid fa-plus" style={{ fontSize: 11 }} /> {t("categories.newCategory")}
            </button>
          </div>
        </div>

        {/* Filters bar */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
            <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: 12, top: 11, color: "#9A9590", fontSize: 12, pointerEvents: "none" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("categories.searchPlaceholder")}
              className="adm-input"
              style={{ width: "100%", height: 36, borderRadius: 6, border: "1px solid #E7E5E4", padding: "0 44px 0 36px", fontSize: 13, background: "#fff", fontFamily: "inherit", color: "#424242", boxSizing: "border-box" }}
            />
            <kbd style={{ position: "absolute", right: 10, top: 8, fontSize: 10, color: "#9A9590", background: "#F0EEEA", border: "1px solid #E7E5E4", borderRadius: 3, padding: "1px 5px", fontFamily: "inherit" }}>⌘K</kbd>
          </div>
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              style={{
                height: 28,
                padding: "0 12px",
                borderRadius: 14,
                border: "1px solid #E7E5E4",
                background: activeFilter === f.value ? "#1F1A14" : "#fff",
                color: activeFilter === f.value ? "#fff" : "#666",
                borderColor: activeFilter === f.value ? "#1F1A14" : "#E7E5E4",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Bulk translate */}
        <div style={{ background: "#fff", border: "1px solid #E7E5E4", borderRadius: 8, marginBottom: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ width: 28, height: 28, borderRadius: 6, background: "#EFF6FF", color: "#1D4ED8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <i className="fa-solid fa-language" style={{ fontSize: 13 }} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1F1A14" }}>{t("categories.bulk.title")}</div>
                <div style={{ fontSize: 11.5, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {bulkTranslating
                    ? bulkProgress?.current ?? t("categories.bulk.translationInProgress")
                    : t("categories.bulk.fillOrUpdate")}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {bulkProgress && bulkProgress.total > 0 && (
                <span style={{ background: "#EFF6FF", color: "#1D4ED8", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
                  {bulkProgress.done}/{bulkProgress.total}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleBulkTranslateCategoryNames(false)}
                disabled={bulkTranslating}
                style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, background: "#2563EB", color: "#fff", border: "none", borderRadius: 999, cursor: bulkTranslating ? "not-allowed" : "pointer", opacity: bulkTranslating ? 0.5 : 1 }}
              >
                {t("categories.bulk.missing")}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t("categories.bulk.retranslateConfirm"))) {
                    handleBulkTranslateCategoryNames(true);
                  }
                }}
                disabled={bulkTranslating}
                style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, background: "#F0EEEA", color: "#424242", border: "none", borderRadius: 999, cursor: bulkTranslating ? "not-allowed" : "pointer", opacity: bulkTranslating ? 0.5 : 1 }}
              >
                {t("categories.bulk.retranslate")}
              </button>
            </div>
          </div>
          {bulkProgress && bulkProgress.total > 0 && (
            <div style={{ background: "#FBFAF9", borderTop: "1px solid #F0EEEA", padding: "8px 14px" }}>
              <div style={{ height: 6, background: "#E7E5E4", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    background: "linear-gradient(to right, #2563EB, #34D399)",
                    width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%`,
                    transition: "width .3s",
                  }}
                />
              </div>
              {bulkProgress.status && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#666" }}>{bulkProgress.status}</div>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div style={{ background: "#fff", border: "1px solid #E7E5E4", borderRadius: 8, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#FBFAF9", borderBottom: "1px solid #E7E5E4", fontSize: 10.5, fontWeight: 700, color: "#9A9590", textTransform: "uppercase", letterSpacing: 0.5 }}>
            <div style={{ width: 24 }}>
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                style={{ margin: 0, cursor: "pointer" }}
              />
            </div>
            <div style={{ width: 16 }} />
            <div style={{ flex: 2, minWidth: 0 }}>{t("categories.table.category")}</div>
            <div style={{ width: 70, textAlign: "right" }}>{t("categories.table.items")}</div>
            <div style={{ width: 28 }} />
            <div style={{ width: 92 }} />
          </div>

          {/* Table body — sortable rows */}
          <div>
            {filteredCategories.length === 0 ? (
              <div style={{ padding: "32px 14px", textAlign: "center", color: "#9A9590", fontSize: 13 }}>
                {t("categories.table.empty")}
              </div>
            ) : (
              <SortableList
                items={filteredCategories}
                onReorder={handleReorder}
                renderItem={(category, _idx, dragHandleProps) => (
                  <div
                    className="adm-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      borderBottom: "1px solid #F0EEEA",
                      cursor: "pointer",
                      background: selected.has(category.id) ? "var(--adm-accent-light)" : undefined,
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{ width: 24 }}>
                      <input
                        type="checkbox"
                        checked={selected.has(category.id)}
                        onChange={() => toggleSelect(category.id)}
                        style={{ margin: 0, cursor: "pointer" }}
                      />
                    </div>

                    {/* Drag grip */}
                    <div
                      ref={dragHandleProps.ref}
                      {...dragHandleProps.listeners}
                      {...dragHandleProps.attributes}
                      style={{ width: 16, color: "#C8C3BC", cursor: "grab", flexShrink: 0 }}
                    >
                      <i className="fa-solid fa-grip-vertical" style={{ fontSize: 11 }} />
                    </div>

                    {/* Name (whole area is a link to entries) */}
                    <Link
                      href={`/admin?s=entries&category=${category.id}`}
                      style={{ flex: 2, minWidth: 0, textDecoration: "none", color: "inherit" }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1F1A14", wordBreak: "break-word", lineHeight: 1.3 }}>
                        {category.name}
                      </div>
                    </Link>

                    {/* Entry count (clickable too) */}
                    <Link
                      href={`/admin?s=entries&category=${category.id}`}
                      style={{ width: 70, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#424242", textDecoration: "none" }}
                    >
                      {category.entryCount}
                    </Link>

                    {/* Translation status icon */}
                    <div style={{ width: 28, display: "flex", justifyContent: "center" }}>
                      {(() => {
                        const missingTitleLocales = configuredLocales.filter((l) => !category.i18n?.[l]?.name);
                        const dishMissing = category.entriesWithMissingTranslations;
                        if (missingTitleLocales.length === 0 && dishMissing === 0) return null;
                        const lines: string[] = [];
                        if (missingTitleLocales.length > 0) {
                          lines.push(t("categories.row.titleMissing").replace("{locales}", missingTitleLocales.map((l) => l.toUpperCase()).join(", ")));
                        }
                        if (dishMissing > 0) {
                          lines.push((dishMissing === 1 ? t("categories.row.itemMissing") : t("categories.row.itemsMissing")).replace("{count}", String(dishMissing)));
                        }
                        return (
                          <i
                            className="fa-solid fa-triangle-exclamation"
                            title={lines.join("\n")}
                            style={{ color: "#B8860B", fontSize: 14, cursor: "help" }}
                          />
                        );
                      })()}
                    </div>

                    {/* Row actions */}
                    <div style={{ width: 92, display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button
                        onClick={(e) => openEditModal(category, e)}
                        title={t("categories.row.actionEdit")}
                        style={{ width: 28, height: 28, border: "none", background: "transparent", borderRadius: 4, color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <i className="fa-solid fa-pen" style={{ fontSize: 11 }} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteCategory(category, e)}
                        disabled={deletingCategoryId === category.id}
                        title={t("categories.row.actionDelete")}
                        style={{ width: 28, height: 28, border: "none", background: "transparent", borderRadius: 4, color: deletingCategoryId === category.id ? "#C8C3BC" : "#DC2626", cursor: deletingCategoryId === category.id ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <i className={deletingCategoryId === category.id ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-trash"} style={{ fontSize: 11 }} />
                      </button>
                      <Link
                        href={`/admin?s=entries&category=${category.id}`}
                        title={t("categories.row.actionViewItems")}
                        style={{ width: 28, height: 28, border: "none", background: "transparent", borderRadius: 4, color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
                      >
                        <i className="fa-solid fa-chevron-right" style={{ fontSize: 11 }} />
                      </Link>
                    </div>
                  </div>
                )}
              />
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{ position: "sticky", bottom: 16, marginTop: 16, background: "#1F1A14", color: "#fff", borderRadius: 8, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 10px 30px rgba(0,0,0,.2)" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{t("categories.bulk.selected").replace("{count}", String(selected.size))}</span>
            <div style={{ flex: 1 }} />
            <button style={{ background: "transparent", border: "none", color: "#fff", fontSize: 12, fontWeight: 500, padding: "6px 10px", borderRadius: 5, cursor: "pointer", display: "inline-flex", gap: 5, alignItems: "center" }}>
              <i className="fa-solid fa-language" /> {t("categories.bulk.translate")}
            </button>
            <button style={{ background: "transparent", border: "none", color: "#fff", fontSize: 12, fontWeight: 500, padding: "6px 10px", borderRadius: 5, cursor: "pointer", display: "inline-flex", gap: 5, alignItems: "center" }}>
              <i className="fa-solid fa-copy" /> {t("categories.bulk.duplicate")}
            </button>
            <div style={{ width: 1, background: "rgba(255,255,255,.15)", alignSelf: "stretch" }} />
            <button
              onClick={() => setSelected(new Set())}
              style={{ background: "transparent", border: "none", color: "rgba(255,255,255,.5)", fontSize: 12, padding: "6px 10px", borderRadius: 5, cursor: "pointer" }}
            >
              {t("common.cancel")}
            </button>
          </div>
        )}
      </main>

      {/* ── Right rail ── */}
      <aside className="adm-rail adm-scroll" style={{ width: 280, background: "#fff", borderLeft: "1px solid #E7E5E4", padding: 16, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0, overflowY: "auto" }}>

        {/* Completeness card */}
        <div style={{ background: "#FBFAF9", border: "1px solid #E7E5E4", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9A9590", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>{t("categories.rail.menuCompleteness")}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: "#1F1A14", letterSpacing: -0.5 }}>{completeness}%</span>
            <span style={{ fontSize: 12, color: "#888" }}>{t("categories.rail.translations")}</span>
          </div>
          <div style={{ height: 6, background: "#E7E5E4", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ height: "100%", background: completeness >= 80 ? "#1F8E5A" : completeness >= 50 ? "#B8860B" : "var(--adm-accent)", borderRadius: 3, width: `${completeness}%`, transition: "width .3s" }} />
          </div>
          {missingTranslations > 0 && (
            <div style={{ fontSize: 11, color: "#888" }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ color: "#B8860B", marginRight: 4 }} />
              {(missingTranslations === 1 ? t("categories.rail.itemMissing") : t("categories.rail.itemsMissing")).replace("{count}", String(missingTranslations))}
            </div>
          )}
        </div>

        {/* Top categories */}
        <div style={{ background: "#FBFAF9", border: "1px solid #E7E5E4", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9A9590", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>{t("categories.rail.topCategories")}</div>
          {topCategories.map((cat, i) => (
            <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < topCategories.length - 1 ? "1px dashed #E7E5E4" : "none" }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", border: "1px solid #E7E5E4", fontSize: 10.5, fontWeight: 700, color: "#888", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#424242", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.name}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#424242", fontVariantNumeric: "tabular-nums" }}>{cat.entryCount}</span>
            </div>
          ))}
        </div>

        {/* Suggestion card */}
        {needsPhotos && missingTranslations > 0 && (
          <div style={{ background: "var(--adm-accent-light)", border: "1px solid #E6CFB9", borderRadius: 8, padding: 14 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <i className="fa-solid fa-lightbulb" style={{ color: "var(--adm-accent-deep)", marginTop: 2, fontSize: 14 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--adm-accent-deep)" }}>{t("categories.rail.tip")}</div>
                <div style={{ fontSize: 11.5, color: "#6B4A2B", marginTop: 4, lineHeight: 1.45 }}>
                  {missingTranslations === 1
                    ? t("categories.rail.tipOne")
                    : t("categories.rail.tipMany").replace("{count}", String(missingTranslations))}{" "}
                  {t("categories.rail.tipSuffix")}
                </div>
                <button
                  onClick={() => setActiveFilter("incomplete")}
                  style={{ marginTop: 8, background: "transparent", border: "none", color: "var(--adm-accent-deep)", fontSize: 11.5, fontWeight: 700, padding: 0, cursor: "pointer" }}
                >
                  {t("categories.rail.filterIncomplete")}
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── Edit side panel ── */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end" style={{ background: "rgba(0,0,0,.5)" }} onClick={() => setEditingCategory(null)}>
          <div className="bg-white w-full md:w-[420px] md:h-full rounded-t-3xl md:rounded-none max-h-[90vh] md:max-h-none overflow-auto shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>

            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #E7E5E4" }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1F1A14", margin: 0 }}>
                  {editingCategory.id === "" ? t("categories.modal.newTitle") : t("categories.modal.editTitle")}
                </h3>
                {editingCategory.id !== "" && (
                  <div style={{ fontSize: 11.5, color: "#888", marginTop: 2 }}>{editingCategory.name}</div>
                )}
              </div>
              <button
                onClick={() => setEditingCategory(null)}
                style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "#F0EEEA", color: "#666", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <i className="fa-solid fa-xmark" style={{ fontSize: 13 }} />
              </button>
            </div>

            {/* Modal content */}
            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
              <TranslationTabs
                activeTab={activeTab}
                onTabChange={setActiveTab}
                primaryLocale={primaryLocale}
                enabledLocales={data?.features?.enabledLocales}
                disabledLocales={data?.features?.disabledLocales}
                customLocales={data?.features?.customLocales}
                fields={[{ key: "name", label: t("categories.modal.fieldName"), sourceValue: editName }]}
                i18n={editI18n as Record<string, Record<string, string>>}
                onI18nChange={(updated) => setEditI18n(updated as I18nData)}
              >
                <div>
                  <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 }}>
                    {t("categories.modal.nameLabel")} <span style={{ color: "var(--adm-accent)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="adm-input"
                    style={{ width: "100%", height: 38, border: "1px solid #E7E5E4", borderRadius: 6, padding: "0 12px", fontSize: 14, fontFamily: "inherit", color: "#1F1A14", fontWeight: 600, boxSizing: "border-box" }}
                    autoFocus
                  />
                </div>
              </TranslationTabs>

              {saveError && (
                <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 6, padding: "8px 12px", color: "#DC2626", fontSize: 12.5 }}>
                  {saveError}
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setEditingCategory(null)}
                  style={{ flex: 1, height: 40, border: "1px solid #E7E5E4", borderRadius: 7, background: "#fff", color: "#424242", fontWeight: 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleSaveCategory}
                  disabled={saving || !editName.trim()}
                  style={{ flex: 2, height: 40, border: "none", borderRadius: 7, background: "var(--adm-accent)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: saving ? "wait" : "pointer", fontFamily: "inherit", opacity: (saving || !editName.trim()) ? 0.6 : 1 }}
                >
                  {saving ? t("common.saving") : editingCategory.id === "" ? t("categories.modal.creating") : t("categories.modal.savingChanges")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
