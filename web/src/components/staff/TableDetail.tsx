"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchTableSession, serveStaffOrder, closeTableSession, ApiError, type TableSessionDetail } from "@/lib/api";
import { useLocale, useTranslations } from "@/lib/i18n";

const STATUS_STYLES: Record<TableSessionDetail["orders"][number]["status"], { bg: string; fg: string }> = {
  submitted: { bg: "#FEF3C7", fg: "#92400E" },
  ready: { bg: "#DBEAFE", fg: "#1E40AF" },
  served: { bg: "#D1FAE5", fg: "#065F46" },
  rejected: { bg: "#FEE2E2", fg: "#991B1B" },
};

const POLL_MS = 10_000;

/** One table's session (#15): orders with status, mark-served, add order, close. */
export function TableDetail({ sessionId }: { sessionId: string }) {
  const t = useTranslations("staff");
  const locale = useLocale();
  const router = useRouter();
  const [detail, setDetail] = useState<TableSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [closeWarn, setCloseWarn] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDetail(await fetchTableSession(sessionId));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(err instanceof Error ? err.message : String(err));
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const serve = async (orderId: string) => {
    try {
      await serveStaffOrder(orderId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const close = async () => {
    setCloseWarn(false);
    try {
      await closeTableSession(sessionId);
      router.push("/staff");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setCloseWarn(true);
      else setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (notFound) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <section className="bg-white rounded-2xl shadow-sm p-8 text-center max-w-sm" role="alert">
          <h1 className="text-xl font-bold text-gray-900">{t("table.notFoundTitle")}</h1>
          <p className="text-sm text-gray-500 mt-2">{t("table.notFoundText")}</p>
          <Link href="/staff" className="inline-block mt-6 px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold">{t("table.backToFloor")}</Link>
        </section>
      </main>
    );
  }

  if (!detail) return <div className="min-h-screen bg-gray-100 flex items-center justify-center text-sm text-gray-500">{t("loading")}</div>;

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/staff" className="inline-flex items-center text-sm text-gray-500 mb-4">{t("table.backToFloor")}</Link>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{detail.tableName}</h1>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

        {detail.orders.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">{t("table.noOrders")}</p>
        ) : (
          <div className="space-y-3">
            {detail.orders.map((order) => {
              const style = STATUS_STYLES[order.status];
              return (
                <div key={order.id} data-testid={`order-${order.dailyNumber}`} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-gray-900">#{order.dailyNumber}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: style.bg, color: style.fg }}>
                        {t(`table.status.${order.status}`)}
                      </span>
                    </div>
                    {order.status === "ready" && (
                      <button onClick={() => serve(order.id)} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold">
                        {t("table.markServed")}
                      </button>
                    )}
                  </div>
                  <ul className="mt-2 text-sm text-gray-700 space-y-0.5">
                    {order.items.map((item) => (
                      <li key={item.id}>{item.quantity}× {item.name}</li>
                    ))}
                  </ul>
                  {order.events.length > 0 && (
                    <ol className="mt-3 border-t border-gray-100 pt-2 space-y-0.5" data-testid={`order-${order.dailyNumber}-events`}>
                      {order.events.map((event, idx) => (
                        <li key={idx} className="text-xs text-gray-400">
                          {new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {" · "}{t(`table.status.${event.status}`)}
                          {event.actor ? ` · ${t(`table.actor.${event.actor}`)}` : ""}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Link
          href={`/${locale}/menu?staffSession=${encodeURIComponent(sessionId)}`}
          data-testid="add-order"
          className="block w-full mt-6 py-3 rounded-full bg-primary text-white font-semibold text-center"
        >
          {t("table.addOrder")}
        </Link>

        <button
          type="button"
          onClick={close}
          className="w-full mt-3 py-3 rounded-full bg-white border border-red-200 text-red-600 font-semibold"
        >
          {t("table.closeSession")}
        </button>
        {closeWarn && (
          <p className="mt-2 text-xs text-red-500 text-center font-medium" role="alert">{t("table.closeBlocked")}</p>
        )}
      </div>
    </main>
  );
}
