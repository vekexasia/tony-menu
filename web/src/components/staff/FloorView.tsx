"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchFloor, openTableSession, type FloorTable } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";

const POLL_MS = 10_000;

/** Flat floor view (#15): tables with at-a-glance state; open a session to enter. */
export function FloorView() {
  const t = useTranslations("staff");
  const [tables, setTables] = useState<FloorTable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchFloor();
      setTables(res.tables);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const open = async (tableId: string) => {
    setBusy(tableId);
    try {
      await openTableSession(tableId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{t("floor.title")}</h1>
        <p className="text-sm text-gray-500 mb-4">{t("floor.subtitle")}</p>

        {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

        {tables === null ? (
          <p className="text-sm text-gray-500">{t("loading")}</p>
        ) : tables.length === 0 ? (
          <p className="text-sm text-gray-500">{t("floor.empty")}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="floor-grid">
            {tables.map((table) => {
              const isOpen = table.sessionId !== null;
              const ready = table.readyCount > 0;
              return isOpen ? (
                <Link
                  key={table.id}
                  href={`/staff/table/${table.sessionId}`}
                  data-testid={`table-${table.id}`}
                  className={`rounded-2xl p-4 shadow-sm border text-left ${ready ? "bg-blue-50 border-blue-200" : "bg-white border-gray-200"}`}
                >
                  <div className="font-bold text-gray-900">{table.name}</div>
                  <div className="text-xs mt-2 font-semibold" data-testid={`table-state-${table.id}`}>
                    {ready ? (
                      <span className="text-blue-700">{t("floor.readyToServe").replace("{count}", String(table.readyCount))}</span>
                    ) : table.orderCount > 0 ? (
                      <span className="text-amber-700">{t("floor.openOrders").replace("{count}", String(table.orderCount))}</span>
                    ) : (
                      <span className="text-gray-500">{t("floor.seated")}</span>
                    )}
                  </div>
                </Link>
              ) : (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => open(table.id)}
                  disabled={busy === table.id}
                  data-testid={`table-${table.id}`}
                  className="rounded-2xl p-4 shadow-sm border border-gray-200 bg-white text-left disabled:opacity-50"
                >
                  <div className="font-bold text-gray-900">{table.name}</div>
                  <div className="text-xs mt-2 font-semibold text-gray-400" data-testid={`table-state-${table.id}`}>{t("floor.free")}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
