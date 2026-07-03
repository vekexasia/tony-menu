"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { getLocalizedContentValue } from "@/lib/content-presentation";
import { ApiError, createOrderIntent, submitOrder } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import type { MenuCategory, MenuEntry } from "@/lib/types";
import { useRestaurantStore } from "@/stores/restaurantStore";
import { useSelectionStore, type SelectionLine } from "@/stores/selectionStore";
import { LoadingScreen, ErrorScreen } from "@/components/ui/StatusScreen";
import { formatMessage as fmt } from "@/lib/utils";

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
  const [sending, setSending] = useState(false);
  const [sentNumber, setSentNumber] = useState<number | null>(null);
  const [intentUrl, setIntentUrl] = useState<string | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [submitError, setSubmitError] = useState<"stale" | "generic" | "intent" | null>(null);
  const [staleEntryIds, setStaleEntryIds] = useState<string[]>([]);
  // One idempotency key per submit attempt session: retries after a network
  // failure reuse it, a successful send resets it.
  const idempotencyKeyRef = useRef<string | null>(null);
  const lines = useSelectionStore((state) => state.lines);
  const initializeSelection = useSelectionStore((state) => state.initialize);
  const increment = useSelectionStore((state) => state.increment);
  const decrement = useSelectionStore((state) => state.decrement);
  const clear = useSelectionStore((state) => state.clear);
  const formatMessage = (key: string, values: Record<string, string | number>) => fmt(t, key, values);

  const ordering = data?.features?.ordering;
  const canSend = ordering?.enabled === true && ordering.mode === "send" && ordering.submitMode !== "waiter";
  const canWaiterQr = ordering?.enabled === true && ordering.mode === "send" && ordering.submitMode !== "diner" && ordering.submitMode !== undefined;

  async function handleShowQr(resolved: ResolvedLine[]) {
    if (creatingIntent) return;
    setSubmitError(null);
    setCreatingIntent(true);
    try {
      const result = await createOrderIntent({
        lines: resolved.map((r) => ({ entryId: r.line.entryId, quantity: r.line.quantity })),
      });
      // The QR encodes a LINK to the admin review page — small and scannable,
      // no cart payload. The selection is kept: the waiter submits it later.
      setIntentUrl(`${window.location.origin}/admin/order-review/?token=${result.token}`);
    } catch {
      setSubmitError("intent");
    } finally {
      setCreatingIntent(false);
    }
  }

  async function handleSend(resolved: ResolvedLine[]) {
    if (sending) return;
    setSubmitError(null);
    setSending(true);
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
    try {
      const result = await submitOrder({
        idempotencyKey: idempotencyKeyRef.current,
        lines: resolved.map((r) => ({ entryId: r.line.entryId, quantity: r.line.quantity })),
      });
      idempotencyKeyRef.current = null;
      setSentNumber(result.dailyNumber);
      clear();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Server-side stale list is authoritative; the local catalog may lag.
        idempotencyKeyRef.current = null;
        const body = err.body as { staleEntryIds?: string[] } | undefined;
        setStaleEntryIds(body?.staleEntryIds ?? []);
        setSubmitError("stale");
      } else {
        setSubmitError("generic");
      }
    } finally {
      setSending(false);
    }
  }

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
      const name = getLocalizedContentValue(resolved.entry, "name", locale);
      return {
        line,
        entry: resolved.entry,
        category: resolved.category,
        unavailable,
        displayName: name,
      };
    });
  }, [data?.categories, lines, locale, t]);

  const grouped = useMemo(() => {
    const groups: Array<{ key: string; title: string; lines: ResolvedLine[]; order: number }> = [];
    const byKey = new Map<string, { key: string; title: string; lines: ResolvedLine[]; order: number }>();

    for (const resolved of resolvedLines) {
      const key = resolved.category?.id ?? "unavailable";
      let group = byKey.get(key);
      if (!group) {
        const title = resolved.category
          ? getLocalizedContentValue(resolved.category, "name", locale)
          : t("selection.unavailableItems");
        group = { key, title, lines: [], order: resolved.category?.order ?? Number.MAX_SAFE_INTEGER };
        byKey.set(key, group);
        groups.push(group);
      }
      group.lines.push(resolved);
    }

    return groups.sort((a, b) => a.order - b.order);
  }, [locale, resolvedLines, t]);

  if (isLoading) {
    return <LoadingScreen as="main" />;
  }

  if (error) {
    return <ErrorScreen as="main" message={error} retryLabel={t("retry")} onRetry={() => loadRestaurant({ force: true })} />;
  }

  const hasUnavailable = resolvedLines.some((r) => r.unavailable);

  if (data && data.features?.ordering?.enabled !== true) {
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

  if (intentUrl !== null) {
    return (
      <main className="min-h-screen bg-gray-100 px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <section className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <h1 className="text-xl font-bold text-gray-800">{t("selection.qrTitle")}</h1>
            <p className="text-sm text-gray-500 mt-2">{t("selection.qrDescription")}</p>
            <div className="flex justify-center mt-6" data-testid="waiter-qr">
              <QRCodeSVG value={intentUrl} size={220} marginSize={2} />
            </div>
            <p className="text-xs text-gray-400 mt-4">{t("selection.qrExpires")}</p>
            <button
              type="button"
              onClick={() => setIntentUrl(null)}
              className="inline-block mt-6 px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold"
            >
              {t("selection.qrBack")}
            </button>
          </section>
        </div>
      </main>
    );
  }

  if (sentNumber !== null) {
    return (
      <main className="min-h-screen bg-gray-100 px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <section className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <h1 className="text-xl font-bold text-gray-800">{t("selection.sentTitle")}</h1>
            <p className="text-sm text-gray-500 mt-2">{t("selection.sentDescription")}</p>
            <p className="text-5xl font-bold text-primary mt-6" data-testid="order-daily-number">#{sentNumber}</p>
            <Link href={`/${locale}/menu`} className="inline-block mt-8 px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold">
              {t("selection.backToMenu")}
            </Link>
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

            {canSend && (
              <>
                {submitError === "stale" && (
                  <div className="mt-6 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">
                    <p>{t("selection.staleError")}</p>
                    {staleEntryIds.length > 0 && (
                      <ul className="mt-2 list-disc list-inside font-medium">
                        {staleEntryIds.map((id) => {
                          // Deleted entries resolve to the generic "unavailable" label; show the id instead so every rejected line is identifiable.
                          const resolved = resolvedLines.find((r) => r.line.entryId === id);
                          return <li key={id}>{resolved?.entry ? resolved.displayName : id}</li>;
                        })}
                      </ul>
                    )}
                  </div>
                )}
                {submitError === "generic" && (
                  <div className="mt-6 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">
                    {t("selection.sendError")}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleSend(resolvedLines)}
                  disabled={sending || hasUnavailable}
                  className="w-full mt-6 py-3 rounded-full bg-primary text-white font-semibold disabled:opacity-50"
                >
                  {sending ? t("selection.sending") : t("selection.send")}
                </button>
                {hasUnavailable && (
                  <p className="mt-2 text-xs text-red-500 text-center font-medium">{t("selection.staleError")}</p>
                )}
              </>
            )}

            {canWaiterQr && (
              <>
                {submitError === "intent" && (
                  <div className="mt-6 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">
                    {t("selection.qrError")}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleShowQr(resolvedLines)}
                  disabled={creatingIntent || hasUnavailable}
                  className={`w-full ${canSend ? "mt-3" : "mt-6"} py-3 rounded-full bg-white border border-primary text-primary font-semibold disabled:opacity-50`}
                >
                  {creatingIntent ? t("selection.qrCreating") : t("selection.showQr")}
                </button>
                {!canSend && hasUnavailable && (
                  <p className="mt-2 text-xs text-red-500 text-center font-medium">{t("selection.staleError")}</p>
                )}
              </>
            )}

            <button
              type="button"
              // ponytail NOTE: this is a public-facing "clear selection" confirm, not an admin delete; ConfirmDeleteModal (admin-styled) doesn't fit here.
              onClick={() => {
                if (confirm(t("selection.clearConfirm"))) clear();
              }}
              className={`w-full ${canSend || canWaiterQr ? "mt-3" : "mt-6"} py-3 rounded-full bg-white border border-red-200 text-red-600 font-semibold`}
            >
              {t("selection.clear")}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
