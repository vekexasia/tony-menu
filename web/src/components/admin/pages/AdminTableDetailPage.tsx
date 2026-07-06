"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchAdminTableDetail, createCheck, updateCheck, settleCheck, voidCheck, adminCloseSession,
  ApiError, type AdminTableDetail, type CheckDTO,
} from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import type { CheckAdjustment, CheckDiscount } from "@menu/schemas";

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
        <p className="text-sm text-gray-500 py-8" data-testid="table-free">{t("tableDetail.free")}</p>
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
          onSettle={() => run(() => settleCheck(check.id))}
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
    </main>
  );
}

type T = (key: string) => string;

function SessionCard({
  session, t, hasCheck, busy, confirming, setConfirming, onCreateCheck, onClose,
}: {
  session: NonNullable<AdminTableDetail["currentSession"]>;
  t: T;
  hasCheck: boolean;
  busy: boolean;
  confirming: "close" | "settle" | "void" | null;
  setConfirming: (v: "close" | "settle" | "void" | null) => void;
  onCreateCheck: () => void;
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

function CheckCard({
  check, t, busy, confirming, setConfirming, onUpdate, onSettle, onVoid,
}: {
  check: CheckDTO;
  t: T;
  busy: boolean;
  confirming: "close" | "settle" | "void" | null;
  setConfirming: (v: "close" | "settle" | "void" | null) => void;
  onUpdate: (patch: { discount?: CheckDiscount | null; adjustments?: CheckAdjustment[] }) => void;
  onSettle: () => void;
  onVoid: () => void;
}) {
  const [discountType, setDiscountType] = useState<"percent" | "amount">(check.discount?.type ?? "percent");
  const [discountValue, setDiscountValue] = useState<string>(
    check.discount ? String(check.discount.type === "percent" ? check.discount.value : check.discount.value / 100) : "",
  );
  const [adjLabel, setAdjLabel] = useState("");
  const [adjAmount, setAdjAmount] = useState("");

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
          <>
            <button type="button" onClick={onSettle} disabled={busy} data-testid="settle-confirm" className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold disabled:opacity-50">{t("tableDetail.confirmPaid")}</button>
            <button type="button" onClick={() => setConfirming(null)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold">{t("common.cancel")}</button>
          </>
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
