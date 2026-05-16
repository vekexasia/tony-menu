"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getContentDisplayText } from "@/lib/content-presentation";
import { useTranslations } from "@/lib/i18n";
import type { MenuCategory, MenuEntry } from "@/lib/types";
import { useRestaurantStore } from "@/stores/restaurantStore";
import { useSelectionStore, type SelectionLine } from "@/stores/selectionStore";

type ResolvedLine = {
  line: SelectionLine;
  entry: MenuEntry | null;
  category: MenuCategory | null;
  unavailable: boolean;
  displayName: string;
};

export function SelectionPageClient() {
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations();
  const { data, isLoading, error, loadRestaurant } = useRestaurantStore();
  const lines = useSelectionStore((state) => state.lines);
  const initializeSelection = useSelectionStore((state) => state.initialize);
  const increment = useSelectionStore((state) => state.increment);
  const decrement = useSelectionStore((state) => state.decrement);
  const clear = useSelectionStore((state) => state.clear);
  const formatMessage = (key: string, values: Record<string, string | number>) => {
    let value = t(key);
    for (const [name, replacement] of Object.entries(values)) {
      value = value.replace(`{${name}}`, String(replacement));
    }
    return value;
  };

  useEffect(() => {
    loadRestaurant();
  }, [loadRestaurant]);

  useEffect(() => {
    if (data?.id) initializeSelection(data.id);
  }, [data?.id, initializeSelection]);

  const resolvedLines = useMemo(() => {
    const entryById = new Map<string, { entry: MenuEntry; category: MenuCategory }>();
    for (const category of data?.categories ?? []) {
      for (const entry of category.entries) {
        entryById.set(entry.id, { entry, category });
      }
    }

    return lines.map((line): ResolvedLine => {
      const resolved = entryById.get(line.entryId);
      if (!resolved) {
        return { line, entry: null, category: null, unavailable: true, displayName: t("selection.unavailableItem") };
      }
      const unavailable = resolved.entry.hidden || resolved.entry.outOfStock;
      const name = getContentDisplayText({
        entity: resolved.entry,
        field: "name",
        locale,
        restaurantId: data?.id,
      });
      return {
        line,
        entry: resolved.entry,
        category: resolved.category,
        unavailable,
        displayName: name.primary,
      };
    });
  }, [data?.categories, data?.id, lines, locale, t]);

  const grouped = useMemo(() => {
    const groups: Array<{ key: string; title: string; lines: ResolvedLine[]; order: number }> = [];
    const byKey = new Map<string, { key: string; title: string; lines: ResolvedLine[]; order: number }>();

    for (const resolved of resolvedLines) {
      const key = resolved.category?.id ?? "unavailable";
      let group = byKey.get(key);
      if (!group) {
        const title = resolved.category
          ? getContentDisplayText({ entity: resolved.category, field: "name", locale, restaurantId: data?.id }).primary
          : t("selection.unavailableItems");
        group = { key, title, lines: [], order: resolved.category?.order ?? Number.MAX_SAFE_INTEGER };
        byKey.set(key, group);
        groups.push(group);
      }
      group.lines.push(resolved);
    }

    return groups.sort((a, b) => a.order - b.order);
  }, [data?.id, locale, resolvedLines, t]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button onClick={() => loadRestaurant({ force: true })} className="px-4 py-2 bg-primary text-white rounded-lg">
            {t("retry")}
          </button>
        </div>
      </main>
    );
  }

  if (data && data.features?.selection !== true) {
    return (
      <main className="min-h-screen bg-gray-100 px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <Link href={`/${locale}/menu`} className="inline-flex items-center text-sm text-gray-500 mb-4">
            {t("selection.backToMenu")}
          </Link>
          <section className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <h1 className="text-xl font-bold text-gray-800">{t("selection.disabledTitle")}</h1>
            <p className="text-sm text-gray-500 mt-2">{t("selection.disabledDescription")}</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <Link href={`/${locale}/menu`} className="inline-flex items-center text-sm text-gray-500 mb-4">
          {t("selection.backToMenu")}
        </Link>

        <section className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <h1 className="text-2xl font-bold text-gray-800">{t("selection.title")}</h1>
          <p className="text-sm text-gray-500 mt-2">{t("selection.description")}</p>
        </section>

        {lines.length === 0 ? (
          <section className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-gray-600 font-medium">{t("selection.empty")}</p>
            <Link href={`/${locale}/menu`} className="inline-block mt-4 px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold">
              {t("selection.backToMenu")}
            </Link>
          </section>
        ) : (
          <>
            <div className="space-y-4">
              {grouped.map((group) => (
                <section key={group.key} className="bg-white rounded-2xl shadow-sm p-4">
                  <h2 className="text-primary font-bold text-sm uppercase tracking-wide mb-3">{group.title}</h2>
                  <div className="space-y-3">
                    {group.lines.map((resolved) => (
                      <div key={resolved.line.entryId} className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0">
                          {resolved.line.quantity}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-800">{resolved.displayName}</p>
                          {resolved.unavailable && <p className="text-xs text-red-500 font-medium">{t("selection.unavailable")}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => decrement(resolved.line.entryId)}
                            aria-label={formatMessage("selection.decreaseItem", { item: resolved.displayName })}
                            className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 text-xl font-semibold"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            onClick={() => increment(resolved.line.entryId)}
                            aria-label={formatMessage("selection.increaseItem", { item: resolved.displayName })}
                            className="w-9 h-9 rounded-full bg-primary text-white text-xl font-semibold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                if (confirm(t("selection.clearConfirm"))) clear();
              }}
              className="w-full mt-6 py-3 rounded-full bg-white border border-red-200 text-red-600 font-semibold"
            >
              {t("selection.clear")}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
