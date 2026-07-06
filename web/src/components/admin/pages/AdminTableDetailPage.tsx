"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchAdminTableDetail, createCheck, updateCheck, settleCheck, voidCheck, adminCloseSession,
  openAdminTableSession, createAdminSessionOrder, getAdminCatalog,
  ApiError, type AdminTableDetail, type CheckDTO, type CatalogResponse, type SubmitOrderLine,
} from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import type { CheckAdjustment, CheckDiscount, PaymentMethod } from "@menu/schemas";

const POLL_MS = 10_000;

const STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
  submitted: { bg: "#FEF3C7", fg: "#92400E" },
  ready: { bg: "#DBEAFE", fg: "#1E40AF" },
  served: { bg: "#D1FAE5", fg: "#065F46" },
  rejected: { bg: "#FEE2E2", fg: "#991B1B" },
};

function euros(cents: number): string {
  return `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

/**
 * Admin table page (#15 follow-up): the current session's orders + check (conto)
 * with discount/adjustments/settle/void, plus session history. Polls every 10s.
 */
export default function AdminTableDetailPage({ tableId }: { tableId: string }) {
  const t = useTranslations("admin");
  const [detail, setDetail] = useState<AdminTableDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confirming, setConfirming] = useState<"close" | "settle" | "void" | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orderModal, setOrderModal] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDetail(await fetchAdminTableDetail(tableId));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(err instanceof Error ? err.message : String(err));
    }
  }, [tableId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setConfirming(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openAddOrder = async () => {
    if (!detail?.currentSession) {
      await run(async () => {
        const opened = await openAdminTableSession(tableId);
        await refresh();
        if (opened.sessionId) setOrderModal(true);
      });
      return;
    }
    setOrderModal(true);
  };

  if (notFound) {
    return (
      <main className="p-6 max-w-3xl">
        <Link href="/admin/tables" className="text-sm text-gray-500">{t("tableDetail.back")}</Link>
        <p className="mt-4 text-sm text-gray-500">{t("tableDetail.notFound")}</p>
      </main>
    );
  }
  if (!detail) {
    return <main className="p-6 text-sm text-gray-500">{t("common.loading")}</main>;
  }

  const { table, currentSession, history } = detail;
  const heading = table.areaName ? `${table.areaName} · ${table.name}` : table.name;
  const check = currentSession?.check ?? null;

  return (
    <main className="p-6 max-w-3xl" style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
      <Link href="/admin/tables" className="text-sm text-gray-500">{t("tableDetail.back")}</Link>
      <div className="flex items-center gap-3 mt-2 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
        {!table.active && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">{t("tables.deactivate")}</span>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm" data-testid="detail-error">{error}</div>}

      {!currentSession ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4 print-hide" data-testid="table-free">
          <p className="text-sm text-gray-500 mb-3">{t("tableDetail.free")}</p>
          <button type="button" onClick={openAddOrder} disabled={busy || !table.active} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50">
            {t("tableDetail.startOrder")}
          </button>
        </section>
      ) : (
        <div className="grid gap-4 print-hide">
          <SessionCard
            session={currentSession}
            t={t}
            hasCheck={!!check}
            busy={busy}
            confirming={confirming}
            setConfirming={setConfirming}
            onCreateCheck={() => run(() => createCheck(currentSession.sessionId))}
            onAddOrder={openAddOrder}
            onClose={() => run(() => adminCloseSession(currentSession.sessionId))}
          />
        </div>
      )}

      {check && (
        <CheckCard
          check={check}
          t={t}
          busy={busy}
          confirming={confirming}
          setConfirming={setConfirming}
          onUpdate={(patch) => run(() => updateCheck(check.id, patch))}
          onSettle={(body) => run(() => settleCheck(check.id, body))}
          onVoid={() => run(() => voidCheck(check.id))}
        />
      )}

      {history.length > 0 && (
        <section className="mt-8 print-hide">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("tableDetail.history")}</h2>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.sessionId} className="rounded-xl border border-gray-200 bg-white p-4" data-testid={`history-${h.sessionId}`}>
                <button
                  type="button"
                  onClick={() => setExpandedHistory((prev) => (prev === h.sessionId ? null : h.sessionId))}
                  className="w-full flex items-center justify-between gap-3 text-left"
                >
                  <span className="text-sm text-gray-700">
                    {new Date(h.openedAt).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {h.closedAt ? ` – ${new Date(h.closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                  </span>
                  {h.check && (
                    <span className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${h.check.status === "settled" ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"}`}>
                        {t(`tableDetail.checkStatus.${h.check.status}`)}
                      </span>
                      {h.check.paymentMethod && <span data-testid={`history-payment-${h.sessionId}`} className="text-xs text-gray-500">{t(`tableDetail.paymentMethod.${h.check.paymentMethod}`)}</span>}
                      <span className="text-sm font-bold text-gray-900">{euros(h.check.total)}</span>
                    </span>
                  )}
                </button>
                {expandedHistory === h.sessionId && h.check && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <ReadOnlyLines check={h.check} t={t} />
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="mt-3 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold"
                    >
                      {t("tableDetail.reprint")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {orderModal && currentSession && !check && (
        <AdminAddOrderModal
          t={t}
          onClose={() => setOrderModal(false)}
          onSubmit={(lines) => run(async () => {
            await createAdminSessionOrder(currentSession.sessionId, lines);
            setOrderModal(false);
          })}
        />
      )}
    </main>
  );
}

type T = (key: string) => string;

function SessionCard({
  session, t, hasCheck, busy, confirming, setConfirming, onCreateCheck, onAddOrder, onClose,
}: {
  session: NonNullable<AdminTableDetail["currentSession"]>;
  t: T;
  hasCheck: boolean;
  busy: boolean;
  confirming: "close" | "settle" | "void" | null;
  setConfirming: (v: "close" | "settle" | "void" | null) => void;
  onCreateCheck: () => void;
  onAddOrder: () => void;
  onClose: () => void;
}) {
  const closable = !hasCheck && session.orders.every((o) => o.status === "served" || o.status === "rejected");
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{t("tableDetail.session")}</h2>
        <span className="text-sm font-bold text-gray-900" data-testid="provisional-total">{euros(session.provisionalTotal)}</span>
      </div>
      {session.orders.length === 0 ? (
        <p className="text-sm text-gray-500">{t("tableDetail.noOrders")}</p>
      ) : (
        <div className="space-y-3">
          {session.orders.map((order) => {
            const style = STATUS_STYLES[order.status];
            return (
              <div key={order.id} data-testid={`order-${order.dailyNumber}`} className="border-b border-gray-100 pb-2 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-base font-bold text-gray-900">#{order.dailyNumber}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: style.bg, color: style.fg }}>
                    {t(`kitchen.status.${order.status}`)}
                  </span>
                </div>
                <ul className="mt-1 text-sm text-gray-700 space-y-0.5">
                  {order.items.map((item) => (
                    <li key={item.id}>{item.quantity}× {item.name}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {!hasCheck ? (
          <button
            type="button"
            onClick={onAddOrder}
            disabled={busy}
            data-testid="add-order"
            className="px-3 py-1.5 rounded-lg border border-primary text-primary text-xs font-semibold disabled:opacity-50"
          >
            {t("tableDetail.addItems")}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2" data-testid="add-items-blocked">
            <span className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">{t("tableDetail.checkOpenAddItemsBlocked")}</span>
            <button type="button" onClick={() => setConfirming("settle")} data-testid="blocked-settle" className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold">{t("tableDetail.paid")}</button>
            <button type="button" onClick={() => setConfirming("void")} data-testid="blocked-void" className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-semibold">{t("tableDetail.void")}</button>
          </div>
        )}
        {!hasCheck && (
          <button
            type="button"
            onClick={onCreateCheck}
            disabled={busy}
            data-testid="create-check"
            className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50"
          >
            {t("tableDetail.createCheck")}
          </button>
        )}
        {confirming === "close" ? (
          <>
            <button type="button" onClick={onClose} disabled={busy} data-testid="close-confirm" className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-50">{t("common.delete")}</button>
            <button type="button" onClick={() => setConfirming(null)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold">{t("common.cancel")}</button>
          </>
        ) : (
          closable && (
            <button type="button" onClick={() => setConfirming("close")} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold">{t("tableDetail.closeTable")}</button>
          )
        )}
      </div>
    </section>
  );
}


function AdminAddOrderModal({ t, onClose, onSubmit }: { t: T; onClose: () => void; onSubmit: (lines: SubmitOrderLine[]) => void }) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    getAdminCatalog().then(setCatalog).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const entries = catalog?.categories
    .flatMap((category) => category.entries.map((entry) => ({ ...entry, categoryName: category.name, categorySortOrder: category.sortOrder })))
    .filter((entry) => !entry.hidden && !entry.outOfStock)
    .filter((entry) => {
      if (!normalizedQuery) return true;
      return entry.name.toLowerCase().includes(normalizedQuery) || entry.categoryName.toLowerCase().includes(normalizedQuery);
    })
    .sort((a, b) => a.categorySortOrder - b.categorySortOrder || a.sortOrder - b.sortOrder) ?? [];
  const lines = Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([entryId, quantity]) => ({ entryId, quantity }));
  const inc = (id: string, delta: number) => setCart((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + delta) }));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center print-hide" role="dialog" aria-modal="true">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{t("tableDetail.addItems")}</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-500">{t("common.close")}</button>
        </div>
        {error && <div className="m-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
        <div className="p-4 border-b border-gray-100">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("tableDetail.searchItems")}
            data-testid="admin-item-search"
            className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
            autoFocus
          />
        </div>
        <div className="p-4 overflow-y-auto space-y-2">
          {!catalog ? <p className="text-sm text-gray-500">{t("common.loading")}</p> : entries.length === 0 ? <p className="text-sm text-gray-500">{t("tableDetail.noAvailableItems")}</p> : entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-gray-200 p-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-gray-900">{entry.name}</div>
                <div className="text-sm text-gray-500">{entry.categoryName} · {euros(Math.round(entry.price * 100))}</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => inc(entry.id, -1)} className="w-8 h-8 rounded-full border border-gray-200">−</button>
                <span data-testid={`admin-item-qty-${entry.id}`} className="w-6 text-center text-sm font-semibold">{cart[entry.id] ?? 0}</span>
                <button type="button" data-testid={`admin-item-plus-${entry.id}`} onClick={() => inc(entry.id, 1)} className="w-8 h-8 rounded-full bg-primary text-white">+</button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-semibold">{t("common.cancel")}</button>
          <button type="button" disabled={lines.length === 0} onClick={() => onSubmit(lines)} data-testid="submit-admin-order" className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50">
            {t("tableDetail.submitItems")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckCard({
  check, t, busy, confirming, setConfirming, onUpdate, onSettle, onVoid,
}: {
  check: CheckDTO;
  t: T;
  busy: boolean;
  confirming: "close" | "settle" | "void" | null;
  setConfirming: (v: "close" | "settle" | "void" | null) => void;
  onUpdate: (patch: { discount?: CheckDiscount | null; adjustments?: CheckAdjustment[] }) => void;
  onSettle: (body: { paymentMethod: PaymentMethod; note?: string }) => void;
  onVoid: () => void;
}) {
  const [discountType, setDiscountType] = useState<"percent" | "amount">(check.discount?.type ?? "percent");
  const [discountValue, setDiscountValue] = useState<string>(
    check.discount ? String(check.discount.type === "percent" ? check.discount.value : check.discount.value / 100) : "",
  );
  const [adjLabel, setAdjLabel] = useState("");
  const [adjAmount, setAdjAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [paymentNote, setPaymentNote] = useState("");

  const saveDiscount = () => {
    const raw = discountValue.trim();
    if (raw === "") { onUpdate({ discount: null }); return; }
    const num = Number(raw.replace(",", "."));
    if (!Number.isFinite(num) || num < 0) return;
    const value = discountType === "percent" ? Math.round(num) : Math.round(num * 100);
    onUpdate({ discount: { type: discountType, value } });
  };

  const addAdjustment = () => {
    const label = adjLabel.trim();
    const num = Number(adjAmount.trim().replace(",", "."));
    if (!label || !Number.isFinite(num) || num === 0) return;
    const cents = Math.round(num * 100);
    onUpdate({ adjustments: [...check.adjustments, { label, amount: cents }] });
    setAdjLabel("");
    setAdjAmount("");
  };

  const removeAdjustment = (idx: number) => {
    onUpdate({ adjustments: check.adjustments.filter((_, i) => i !== idx) });
  };

  return (
    <section className="mt-4 rounded-xl border-2 border-primary/30 bg-white p-4 print-check" data-testid="check-card">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("tableDetail.check")}</h2>
      <ReadOnlyLines check={check} t={t} />

      <div className="mt-4 border-t border-gray-100 pt-3 print-hide">
        <p className="text-xs font-semibold text-gray-500 mb-1">{t("tableDetail.discount")}</p>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button type="button" onClick={() => setDiscountType("percent")} className={`px-3 py-1.5 text-xs font-semibold ${discountType === "percent" ? "bg-primary text-white" : "text-gray-600"}`}>%</button>
            <button type="button" onClick={() => setDiscountType("amount")} className={`px-3 py-1.5 text-xs font-semibold ${discountType === "amount" ? "bg-primary text-white" : "text-gray-600"}`}>€</button>
          </div>
          <input
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            onBlur={saveDiscount}
            inputMode="decimal"
            data-testid="discount-value"
            className="h-9 w-24 rounded-lg border border-gray-200 px-3 text-sm"
            placeholder="0"
          />
          <button type="button" onClick={saveDiscount} disabled={busy} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50">{t("common.save")}</button>
        </div>
      </div>

      <div className="mt-4 print-hide">
        <p className="text-xs font-semibold text-gray-500 mb-1">{t("tableDetail.adjustments")}</p>
        {check.adjustments.length > 0 && (
          <ul className="mb-2 space-y-1">
            {check.adjustments.map((a, idx) => (
              <li key={idx} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-gray-700">{a.label}</span>
                <span className="flex items-center gap-2">
                  <span className={a.amount < 0 ? "text-green-700" : "text-gray-700"}>{a.amount < 0 ? "−" : "+"}{euros(Math.abs(a.amount))}</span>
                  <button type="button" onClick={() => removeAdjustment(idx)} aria-label={t("common.delete")} className="text-red-400 text-xs">×</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <input value={adjLabel} onChange={(e) => setAdjLabel(e.target.value)} placeholder={t("tableDetail.adjLabel")} className="h-9 flex-1 rounded-lg border border-gray-200 px-3 text-sm" data-testid="adj-label" />
          <input value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} inputMode="decimal" placeholder={t("tableDetail.adjAmount")} className="h-9 w-24 rounded-lg border border-gray-200 px-3 text-sm" data-testid="adj-amount" />
          <button type="button" onClick={addAdjustment} disabled={busy} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold disabled:opacity-50">{t("common.add")}</button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <span className="text-sm font-semibold text-gray-500">{t("tableDetail.total")}</span>
        <span className="text-2xl font-bold text-gray-900" data-testid="check-total">{euros(check.total)}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 print-hide">
        <button type="button" onClick={() => window.print()} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold">{t("tableDetail.print")}</button>
        {confirming === "settle" ? (
          <div data-testid="settlement-sheet" className="w-full rounded-xl border border-green-100 bg-green-50 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-green-900">{t("tableDetail.settlementTitle")}</span>
              <span className="text-lg font-bold text-green-900">{euros(check.total)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["cash", "card", "other"] as PaymentMethod[]).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  data-testid={`payment-method-${method}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${paymentMethod === method ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-700 border-gray-200"}`}
                >
                  {t(`tableDetail.paymentMethod.${method}`)}
                </button>
              ))}
            </div>
            <input
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              data-testid="payment-note"
              maxLength={120}
              placeholder={t("tableDetail.paymentNote")}
              className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm bg-white"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => paymentMethod && onSettle({ paymentMethod, note: paymentNote.trim() || undefined })} disabled={busy || !paymentMethod} data-testid="settle-confirm" className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold disabled:opacity-50">{t("tableDetail.confirmPaid")}</button>
              <button type="button" onClick={() => setConfirming(null)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold bg-white">{t("common.cancel")}</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming("settle")} data-testid="settle" className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold">{t("tableDetail.paid")}</button>
        )}
        {confirming === "void" ? (
          <>
            <button type="button" onClick={onVoid} disabled={busy} data-testid="void-confirm" className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-50">{t("tableDetail.confirmVoid")}</button>
            <button type="button" onClick={() => setConfirming(null)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold">{t("common.cancel")}</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming("void")} className="px-3 py-1.5 rounded-lg text-red-500 text-xs font-semibold">{t("tableDetail.void")}</button>
        )}
      </div>
    </section>
  );
}

function ReadOnlyLines({ check, t }: { check: CheckDTO; t: T }) {
  return (
    <>
      <ul className="space-y-1">
        {check.lines.map((line, idx) => (
          <li key={idx} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-gray-700">{line.quantity}× {line.name}</span>
            <span className="text-gray-900">{euros(line.quantity * line.unitPrice)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between text-sm text-gray-500">
        <span>{t("tableDetail.subtotal")}</span>
        <span>{euros(check.subtotal)}</span>
      </div>
      {check.discount && (
        <div className="flex items-center justify-between text-sm text-green-700">
          <span>{t("tableDetail.discount")}</span>
          <span>{check.discount.type === "percent" ? `−${check.discount.value}%` : `−${euros(check.discount.value)}`}</span>
        </div>
      )}
    </>
  );
}
