"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogPanel } from "@headlessui/react";
import { getLocalizedContentValue } from "@/lib/content-presentation";
import { ApiError, createOrderIntent, submitOrder } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import type { MenuCategory, MenuEntry } from "@/lib/types";
import { useRestaurantStore } from "@/stores/restaurantStore";
import { useSelectionStore, type SelectionLine } from "@/stores/selectionStore";
import { formatMessage as fmt } from "@/lib/utils";

type ResolvedLine = {
  line: SelectionLine;
  entry: MenuEntry | null;
  category: MenuCategory | null;
  unavailable: boolean;
  displayName: string;
};

// Reuse a created intent when the cart is unchanged and it still has comfortable
// life left, so a diner toying with the QR button does not burn the 10/min per-IP
// public rate limit with a fresh POST on every open.
const INTENT_REUSE_MIN_MS = 2 * 60 * 1000;

function lineFingerprint(resolved: ResolvedLine[]): string {
  return JSON.stringify(
    resolved
      .map((r) => ({ entryId: r.line.entryId, quantity: r.line.quantity }))
      .sort((a, b) => a.entryId.localeCompare(b.entryId)),
  );
}

/**
 * The shared selection UI: grouped lines with +/- controls, send/QR buttons,
 * clear-confirm, error banners, and the waiter-QR dialog. Rendered both in the
 * /selection page (with page chrome) and as a modal over the menu. `onClose`,
 * when provided (modal context), turns "back to menu" actions into a dismiss.
 */
export function SelectionContent({ onClose }: { onClose?: () => void }) {
  const params = useParams();
  const locale = params.locale as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  // Staff-context ordering (#15): when a waiter opens the menu from a table, the
  // submit binds to that table session and returns to it.
  const staffSession = searchParams.get("staffSession");
  const t = useTranslations();
  const { data } = useRestaurantStore();
  const [sending, setSending] = useState(false);
  const [sentNumber, setSentNumber] = useState<number | null>(null);
  const [intentUrl, setIntentUrl] = useState<string | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [submitError, setSubmitError] = useState<"stale" | "generic" | "intent" | "rateLimit" | "checkOpen" | null>(null);
  const [staleEntryIds, setStaleEntryIds] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  // One idempotency key per submit attempt session: retries after a network
  // failure reuse it, a successful send resets it.
  const idempotencyKeyRef = useRef<string | null>(null);
  // Cached intent so reopening the QR with an unchanged cart skips the POST.
  const intentCacheRef = useRef<{ url: string; expiresAt: number; fingerprint: string } | null>(null);
  const lines = useSelectionStore((state) => state.lines);
  const initializeSelection = useSelectionStore((state) => state.initialize);
  const increment = useSelectionStore((state) => state.increment);
  const decrement = useSelectionStore((state) => state.decrement);
  const clear = useSelectionStore((state) => state.clear);
  const formatMessage = (key: string, values: Record<string, string | number>) => fmt(t, key, values);

  const ordering = data?.features?.ordering;
  // In staff context the waiter always sends directly to the kitchen for the
  // table, regardless of the diner-facing submitMode.
  const canSend = !!staffSession || (ordering?.enabled === true && ordering.mode === "send" && ordering.submitMode !== "waiter");
  const canWaiterQr = !staffSession && ordering?.enabled === true && ordering.mode === "send" && ordering.submitMode !== "diner" && ordering.submitMode !== undefined;

  // "Back to menu" is a Link in page context, a dismiss in modal context.
  function backAction(className: string): ReactNode {
    return onClose ? (
      <button type="button" onClick={onClose} className={className}>
        {t("selection.backToMenu")}
      </button>
    ) : (
      <Link href={`/${locale}/menu`} className={className}>
        {t("selection.backToMenu")}
      </Link>
    );
  }

  async function handleShowQr(resolved: ResolvedLine[]) {
    if (creatingIntent) return;
    setSubmitError(null);
    const fingerprint = lineFingerprint(resolved);
    const cached = intentCacheRef.current;
    if (cached && cached.fingerprint === fingerprint && cached.expiresAt - Date.now() > INTENT_REUSE_MIN_MS) {
      setIntentUrl(cached.url);
      return;
    }
    setCreatingIntent(true);
    try {
      const result = await createOrderIntent({
        lines: resolved.map((r) => ({ entryId: r.line.entryId, quantity: r.line.quantity })),
      });
      // The QR encodes a LINK to the admin review page — small and scannable,
      // no cart payload. The selection is kept: the waiter submits it later.
      const url = `${window.location.origin}/order-review/?token=${result.token}`;
      intentCacheRef.current = { url, expiresAt: result.expiresAt, fingerprint };
      setIntentUrl(url);
    } catch (err) {
      setSubmitError(err instanceof ApiError && err.status === 429 ? "rateLimit" : "intent");
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
        ...(staffSession ? { tableSessionId: staffSession } : {}),
      });
      idempotencyKeyRef.current = null;
      clear();
      if (staffSession) {
        // Append-only: back to the table, where the new order shows in the session.
        router.push(`/staff/table/${staffSession}`);
        return;
      }
      setSentNumber(result.dailyNumber);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Server-side stale list is authoritative; the local catalog may lag.
        idempotencyKeyRef.current = null;
        const body = err.body as { error?: string; staleEntryIds?: string[] } | undefined;
        if (body?.error === "check_open") {
          setSubmitError("checkOpen");
        } else {
          setStaleEntryIds(body?.staleEntryIds ?? []);
          setSubmitError("stale");
        }
      } else {
        setSubmitError("generic");
      }
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (data?.id) initializeSelection(data.id);
  }, [data?.id, initializeSelection]);
  useEffect(() => {
    if (lines.length === 0) setConfirmClear(false);
  }, [lines.length]);

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

  const hasUnavailable = resolvedLines.some((r) => r.unavailable);

  if (data && data.features?.ordering?.enabled !== true) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-8 text-center">
        <h1 className="text-xl font-bold text-gray-800">{t("selection.disabledTitle")}</h1>
        <p className="text-sm text-gray-500 mt-2">{t("selection.disabledDescription")}</p>
      </section>
    );
  }

  if (sentNumber !== null) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-8 text-center">
        <h1 className="text-xl font-bold text-gray-800">{t("selection.sentTitle")}</h1>
        <p className="text-sm text-gray-500 mt-2">{t("selection.sentDescription")}</p>
        <p className="text-5xl font-bold text-primary mt-6" data-testid="order-daily-number">#{sentNumber}</p>
        {backAction("inline-block mt-8 px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold")}
      </section>
    );
  }

  return (
    <>
      <section className="bg-white rounded-2xl shadow-sm p-5 mb-4">
        <h1 className="text-2xl font-bold text-gray-800">{t("selection.title")}</h1>
        <p className="text-sm text-gray-500 mt-2">{t("selection.description")}</p>
      </section>

      {lines.length === 0 ? (
        <section className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <p className="text-gray-600 font-medium">{t("selection.empty")}</p>
          {backAction("inline-block mt-4 px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold")}
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
              {submitError === "checkOpen" && (
                <div className="mt-6 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">
                  {t("selection.checkOpenError")}
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
              {submitError === "rateLimit" && (
                <div className="mt-6 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">
                  {t("selection.qrRateLimit")}
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

          {confirmClear ? (
            <div className={`w-full ${canSend || canWaiterQr ? "mt-3" : "mt-6"} rounded-2xl border border-red-200 bg-red-50 p-4`}>
              <p className="text-sm text-red-700 font-medium">{t("selection.clearConfirm")}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => { clear(); setConfirmClear(false); }}
                  className="flex-1 py-2.5 rounded-full bg-red-600 text-white font-semibold"
                >
                  {t("selection.clear")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="flex-1 py-2.5 rounded-full bg-white border border-gray-200 text-gray-700 font-semibold"
                >
                  {t("selection.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className={`w-full ${canSend || canWaiterQr ? "mt-3" : "mt-6"} py-3 rounded-full bg-white border border-red-200 text-red-600 font-semibold`}
            >
              {t("selection.clear")}
            </button>
          )}
        </>
      )}

      <Dialog as="div" className="relative z-[60]" open={intentUrl !== null} onClose={() => setIntentUrl(null)}>
        <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl">
            <h1 className="text-xl font-bold text-gray-800">{t("selection.qrTitle")}</h1>
            <p className="text-sm text-gray-500 mt-2">{t("selection.qrDescription")}</p>
            <div className="flex justify-center mt-6" data-testid="waiter-qr">
              {intentUrl && <QRCodeSVG value={intentUrl} size={220} marginSize={2} />}
            </div>
            <p className="text-xs text-gray-400 mt-4">{t("selection.qrExpires")}</p>
            <button
              type="button"
              onClick={() => setIntentUrl(null)}
              className="inline-block mt-6 px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold"
            >
              {t("selection.qrBack")}
            </button>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
