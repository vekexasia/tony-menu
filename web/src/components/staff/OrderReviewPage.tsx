"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError, consumeOrderIntent, fetchFloor, fetchOrderIntent, getCatalog, openTableSession } from "@/lib/api";
import type { CatalogResponse, FloorTable, OrderIntentReviewResponse } from "@menu/schemas";
import { getLocalizedContentValue } from "@/lib/content-presentation";
import { useLocale, useTranslations } from "@/lib/i18n";

type EditLine = { entryId: string; quantity: number };
type EntryInfo = { name: string; price: number | null; unavailable: boolean };

/**
 * Waiter review page (#19): opened by scanning the diner's QR
 * (/order-review/?token=...). Loads the intent, shows lines resolved against
 * the CURRENT menu, lets the waiter edit (qty, remove, add from catalog), then
 * submits through the shared order path with the edited lines as override (#15).
 */
export default function OrderReviewPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const t = useTranslations("admin");
  const locale = useLocale();

  const [intent, setIntent] = useState<OrderIntentReviewResponse | null>(null);
  const [loadError, setLoadError] = useState<"notFound" | "generic" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<"expired" | "consumed" | "stale" | "generic" | null>(null);
  const [dailyNumber, setDailyNumber] = useState<number | null>(null);
  const [submittedSessionId, setSubmittedSessionId] = useState<string | null>(null);
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [lines, setLines] = useState<EditLine[] | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    setLoadError(null);
    fetchOrderIntent(token)
      .then((res) => {
        setIntent(res);
        // Seed the editable lines once from the intent snapshot.
        setLines((prev) => prev ?? res.lines.map((l) => ({ entryId: l.entryId, quantity: l.quantity })));
      })
      .catch((err) => setLoadError(err instanceof ApiError && err.status === 404 ? "notFound" : "generic"));
  }, [token]);

  useEffect(load, [load]);

  useEffect(() => {
    fetchFloor().then((res) => setTables(res.tables)).catch(() => setTables([]));
    getCatalog().then(setCatalog).catch(() => setCatalog(null));
  }, []);

  // Resolve each line's name/price/availability from the current catalog, falling
  // back to the intent's resolved snapshot for entries no longer in the catalog.
  const entryInfo = useMemo(() => {
    const info = new Map<string, EntryInfo>();
    for (const cat of catalog?.categories ?? []) {
      for (const entry of cat.entries) {
        info.set(entry.id, {
          name: getLocalizedContentValue({ name: entry.name, i18n: entry.i18n ?? undefined }, "name", locale),
          // NOTE: unit seam — the public catalog serves euros (catalog.ts divides by 100),
          // the orders domain uses integer cents. This is the only crossing point; normalize here.
          price: Math.round(entry.price * 100),
          unavailable: entry.hidden || entry.outOfStock,
        });
      }
    }
    for (const line of intent?.lines ?? []) {
      if (!info.has(line.entryId)) {
        info.set(line.entryId, { name: line.name ?? line.entryId, price: line.price, unavailable: line.unavailable });
      }
    }
    return info;
  }, [catalog, intent, locale]);

  const infoFor = (entryId: string): EntryInfo =>
    entryInfo.get(entryId) ?? { name: entryId, price: null, unavailable: true };

  const setQuantity = (entryId: string, delta: number) => {
    setLines((prev) =>
      (prev ?? [])
        .map((l) => (l.entryId === entryId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const removeLine = (entryId: string) => {
    setLines((prev) => (prev ?? []).filter((l) => l.entryId !== entryId));
  };

  const addEntry = (entryId: string) => {
    setLines((prev) => {
      const list = prev ?? [];
      if (list.some((l) => l.entryId === entryId)) {
        return list.map((l) => (l.entryId === entryId ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...list, { entryId, quantity: 1 }];
    });
    setSearch("");
  };

  // Flat catalog list for the picker: available entries not already in the order.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const inOrder = new Set((lines ?? []).map((l) => l.entryId));
    const out: { id: string; name: string; price: number }[] = [];
    for (const cat of catalog?.categories ?? []) {
      for (const entry of cat.entries) {
        if (entry.hidden || entry.outOfStock || inOrder.has(entry.id)) continue;
        const name = getLocalizedContentValue({ name: entry.name, i18n: entry.i18n ?? undefined }, "name", locale);
        if (name.toLowerCase().includes(q)) out.push({ id: entry.id, name, price: Math.round(entry.price * 100) });
      }
    }
    return out.slice(0, 8);
  }, [search, catalog, lines, locale]);

  async function handleSubmit() {
    if (!token || submitting || !lines || lines.length === 0) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      let tableSessionId: string | undefined;
      const table = tables.find((tb) => tb.id === selectedTableId);
      if (table) {
        tableSessionId = table.sessionId ?? (await openTableSession(table.id)).sessionId;
      }
      const result = await consumeOrderIntent(token, { tableSessionId, lines });
      setDailyNumber(result.dailyNumber);
      setSubmittedSessionId(tableSessionId ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { error?: string } | undefined;
        if (body?.error === "expired" || body?.error === "consumed") setSubmitError(body.error);
        else setSubmitError("stale");
        // Availability/state may have changed since load — refresh the view.
        load();
      } else {
        setSubmitError("generic");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) return <Message title={t("orderReview.invalidLinkTitle")} text={t("orderReview.invalidLinkText")} />;
  if (loadError === "notFound") return <Message title={t("orderReview.notFoundTitle")} text={t("orderReview.notFoundText")} />;
  if (loadError === "generic") return <Message title={t("orderReview.loadFailedTitle")} text={t("orderReview.loadFailedText")} />;
  if (!intent || !lines) return <div className="p-6 text-sm text-gray-500">{t("orderReview.loading")}</div>;

  if (dailyNumber !== null) {
    return (
      <main className="p-6 max-w-2xl">
        <section className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">{t("orderReview.submitted")}</h1>
          <p className="text-5xl font-bold text-primary mt-6" data-testid="order-daily-number">#{dailyNumber}</p>
          <div className="mt-8 flex flex-col gap-3">
            <Link
              href="/staff"
              className="w-full py-3 rounded-full bg-primary text-white font-semibold"
              data-testid="review-go-floor"
            >
              {t("orderReview.goToFloor")}
            </Link>
            {submittedSessionId && (
              <Link
                href={`/staff/table/${submittedSessionId}`}
                className="w-full py-3 rounded-full bg-white border border-primary text-primary font-semibold"
                data-testid="review-go-table"
              >
                {t("orderReview.goToTable")}
              </Link>
            )}
          </div>
        </section>
      </main>
    );
  }

  const status = intent.status;
  const hasUnavailable = lines.some((l) => infoFor(l.entryId).unavailable);
  const total = lines.reduce((sum, l) => {
    const price = infoFor(l.entryId).price ?? 0;
    return sum + price * l.quantity;
  }, 0);

  return (
    <main className="p-6 max-w-2xl w-full">
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-wide text-primary">{t("orderReview.eyebrow")}</div>
        <h1 className="text-2xl font-bold text-gray-900">{t("orderReview.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("orderReview.subtitle")}</p>
      </div>

      {status === "expired" && <Banner text={t("orderReview.expired")} />}
      {status === "consumed" && <Banner text={t("orderReview.consumed")} />}
      {submitError === "expired" && <Banner text={t("orderReview.expired")} />}
      {submitError === "consumed" && <Banner text={t("orderReview.consumed")} />}
      {submitError === "stale" && <Banner text={t("orderReview.stale")} />}
      {submitError === "generic" && <Banner text={t("orderReview.submitFailed")} />}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {lines.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">{t("orderReview.emptyOrder")}</p>
        ) : (
          <div className="space-y-3">
            {lines.map((line) => {
              const info = infoFor(line.entryId);
              const editable = status === "pending";
              return (
                <div key={line.entryId} className="flex items-center gap-3" data-testid={`review-line-${line.entryId}`}>
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0">
                    {line.quantity}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold ${info.unavailable ? "text-gray-400 line-through" : "text-gray-800"}`}>
                      {info.name}
                    </p>
                    {info.unavailable && <p className="text-xs text-red-500 font-medium">{t("orderReview.unavailable")}</p>}
                  </div>
                  {info.price !== null && (
                    <div className="text-sm font-semibold text-gray-600 flex-shrink-0">
                      {((info.price * line.quantity) / 100).toFixed(2)} &euro;
                    </div>
                  )}
                  {editable && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!info.unavailable && (
                        <>
                          <button
                            type="button"
                            onClick={() => setQuantity(line.entryId, -1)}
                            aria-label={t("orderReview.decrease")}
                            className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 text-lg font-semibold"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuantity(line.entryId, 1)}
                            aria-label={t("orderReview.increase")}
                            className="w-8 h-8 rounded-full bg-primary text-white text-lg font-semibold"
                          >
                            +
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => removeLine(line.entryId)}
                        aria-label={t("orderReview.remove")}
                        className="w-8 h-8 rounded-full bg-red-50 text-red-600 text-lg font-semibold"
                        data-testid={`review-remove-${line.entryId}`}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-between border-t border-gray-100 mt-4 pt-3 text-sm font-bold text-gray-800">
          <span>{t("orderReview.total")}</span>
          <span>{(total / 100).toFixed(2)} &euro;</span>
        </div>
      </section>

      {status === "pending" && (
        <>
          <div className="mt-4">
            <label className="block text-sm font-semibold text-gray-700">
              {t("orderReview.addItem")}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("orderReview.addItemPlaceholder")}
                className="mt-2 w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800"
                data-testid="review-add-search"
              />
            </label>
            {searchResults.length > 0 && (
              <ul className="mt-2 rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
                {searchResults.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => addEntry(r.id)}
                      data-testid={`review-add-${r.id}`}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="font-medium text-gray-800">{r.name}</span>
                      <span className="text-gray-500">{(r.price / 100).toFixed(2)} &euro;</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="block mt-6 text-sm font-semibold text-gray-700">
            {t("orderReview.tableLabel")}
            <select
              value={selectedTableId}
              onChange={(e) => setSelectedTableId(e.target.value)}
              className="mt-2 w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800"
            >
              <option value="">{t("orderReview.noTable")}</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}{table.sessionId ? " · open" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || hasUnavailable || lines.length === 0}
            className="w-full mt-6 py-3 rounded-full bg-primary text-white font-semibold disabled:opacity-50"
          >
            {submitting ? t("orderReview.submitting") : t("orderReview.submit")}
          </button>
          {hasUnavailable && (
            <p className="mt-2 text-xs text-red-500 text-center font-medium">
              {t("orderReview.removeUnavailable")}
            </p>
          )}
        </>
      )}
    </main>
  );
}

function Banner({ text }: { text: string }) {
  return (
    <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">
      {text}
    </div>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <main className="p-6 max-w-2xl">
      <section className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center" role="alert">
        <h1 className="text-xl font-bold text-red-700">{title}</h1>
        <p className="text-sm text-red-600 mt-2">{text}</p>
      </section>
    </main>
  );
}
