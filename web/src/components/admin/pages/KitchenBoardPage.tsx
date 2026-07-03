"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAdminOrders,
  updateOrderStatus,
  setDestinationPrinted,
  fetchOrderDestinations,
  createOrderDestination,
  updateOrderDestination,
  deleteOrderDestination,
  type AdminOrder,
  type AdminOrderDestination,
} from "@/lib/api";
import { useRestaurantStore } from "@/stores/restaurantStore";
import { useTranslations } from "@/lib/i18n";

const POLL_MS = 10_000;

const STATUS_STYLES: Record<AdminOrder["status"], { bg: string; fg: string }> = {
  submitted: { bg: "#FEF3C7", fg: "#92400E" },
  ready: { bg: "#DBEAFE", fg: "#1E40AF" },
  served: { bg: "#D1FAE5", fg: "#065F46" },
  rejected: { bg: "#FEE2E2", fg: "#991B1B" },
};

// Short beep for the in-app new-order alert. WebAudio: no asset, no dependency.
function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.1;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close();
  } catch {
    // Audio may be blocked before a user gesture — the banner still shows.
  }
}

export default function KitchenBoardPage() {
  const t = useTranslations("admin");
  const { data, isLoading: storeLoading, loadRestaurant } = useRestaurantStore();
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [destinations, setDestinations] = useState<AdminOrderDestination[]>([]);
  const [tab, setTab] = useState<string>("all");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newAlert, setNewAlert] = useState<number | null>(null);
  const [newDestName, setNewDestName] = useState("");
  const knownIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    loadRestaurant();
  }, [loadRestaurant]);

  const orderingEnabled = data?.features?.ordering?.enabled === true;

  const refresh = useCallback(async () => {
    try {
      const res = await fetchAdminOrders();
      setError(null);
      setOrders(res.orders);
      const ids = new Set(res.orders.map((o) => o.id));
      if (knownIds.current) {
        const fresh = res.orders.filter((o) => !knownIds.current!.has(o.id));
        if (fresh.length > 0) {
          beep();
          setNewAlert(Math.max(...fresh.map((o) => o.dailyNumber)));
        }
      }
      knownIds.current = ids;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (!orderingEnabled) return;
    refresh();
    fetchOrderDestinations().then((res) => setDestinations(res.destinations)).catch(() => {});
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [orderingEnabled, refresh]);

  const transition = async (order: AdminOrder, status: "ready" | "served" | "rejected", reason?: string) => {
    try {
      await updateOrderStatus(order.id, status === "rejected" ? { status, rejectReason: reason } : { status });
      setOrders((prev) => prev?.map((o) => o.id === order.id ? { ...o, status, rejectReason: reason ?? null } : o) ?? null);
      setRejectingId(null);
      setRejectReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const togglePrinted = async (rowId: string, printed: boolean) => {
    try {
      const res = await setDestinationPrinted(rowId, printed);
      setOrders((prev) => prev?.map((o) => ({
        ...o,
        items: o.items.map((i) => ({
          ...i,
          destinations: i.destinations.map((d) => d.id === rowId ? { ...d, printedAt: res.printedAt } : d),
        })),
      })) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // ── Destination CRUD handlers ─────────────────────────────────────
  const addDestination = async () => {
    const name = newDestName.trim();
    if (!name) return;
    try {
      const res = await createOrderDestination(name);
      setDestinations((prev) => [...prev, { id: res.id, name, sortOrder: prev.length }]);
      setNewDestName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const renameDestination = async (dest: AdminOrderDestination) => {
    // ponytail: window.prompt over a rename modal — upgrade if destinations grow richer fields.
    const name = window.prompt(t("destinations.renamePrompt"), dest.name)?.trim();
    if (!name || name === dest.name) return;
    try {
      await updateOrderDestination(dest.id, name);
      setDestinations((prev) => prev.map((d) => d.id === dest.id ? { ...d, name } : d));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeDestination = async (dest: AdminOrderDestination) => {
    if (!window.confirm(t("destinations.deleteConfirm"))) return;
    try {
      await deleteOrderDestination(dest.id);
      setDestinations((prev) => prev.filter((d) => d.id !== dest.id));
      if (tab === dest.id) setTab("all");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (storeLoading || (!data && !error)) {
    return <div className="p-6 text-sm text-gray-500">{t("common.loading")}</div>;
  }

  if (!orderingEnabled) {
    return (
      <main className="p-6 max-w-3xl" data-testid="kitchen-disabled">
        <h1 className="text-2xl font-bold text-gray-900">{t("kitchen.title")}</h1>
        <p className="text-sm text-gray-500 mt-2">{t("kitchen.disabled")}</p>
      </main>
    );
  }

  const activeOrders = orders?.filter((o) => o.status === "submitted" || o.status === "ready") ?? [];

  return (
    <main className="p-6 max-w-4xl" style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">{t("kitchen.title")}</h1>
        {newAlert !== null && (
          <button
            data-testid="new-order-alert"
            onClick={() => setNewAlert(null)}
            className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-sm font-semibold animate-pulse"
          >
            {t("kitchen.newOrder").replace("{number}", String(newAlert))}
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      {/* Tabs: whole-order board + one per department */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <TabButton active={tab === "all"} onClick={() => setTab("all")} label={t("kitchen.allOrders")} />
        {destinations.map((d) => (
          <TabButton key={d.id} active={tab === d.id} onClick={() => setTab(d.id)} label={d.name} />
        ))}
      </div>

      {orders === null ? (
        <div className="text-sm text-gray-500">{t("common.loading")}</div>
      ) : tab === "all" ? (
        // ── Whole-order view: status transitions ─────────────────────
        <div className="space-y-3">
          {orders.length === 0 && <p className="text-sm text-gray-500 py-6">{t("kitchen.empty")}</p>}
          {orders.map((order) => {
            const style = STATUS_STYLES[order.status];
            return (
              <div key={order.id} data-testid={`order-${order.dailyNumber}`} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-gray-900">#{order.dailyNumber}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: style.bg, color: style.fg }}>
                      {t(`kitchen.status.${order.status}`)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.status === "submitted" && (
                      <button onClick={() => transition(order, "ready")} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:opacity-90">
                        {t("kitchen.markReady")}
                      </button>
                    )}
                    {order.status === "ready" && (
                      <button onClick={() => transition(order, "served")} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:opacity-90">
                        {t("kitchen.markServed")}
                      </button>
                    )}
                    {(order.status === "submitted" || order.status === "ready") && (
                      <button onClick={() => { setRejectingId(order.id); setRejectReason(""); }} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100">
                        {t("kitchen.reject")}
                      </button>
                    )}
                  </div>
                </div>
                <ul className="mt-2 text-sm text-gray-700 space-y-0.5">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity}× {item.name}
                      {item.destinations.length > 0 && (
                        <span className="text-xs text-gray-400"> — {item.destinations.map((d) => d.destinationName).join(", ")}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {order.status === "rejected" && order.rejectReason && (
                  <p className="mt-2 text-xs text-red-600">{t("kitchen.rejectedReason")}: {order.rejectReason}</p>
                )}
                {rejectingId === order.id && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      autoFocus
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder={t("kitchen.rejectReasonPlaceholder")}
                      className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm"
                    />
                    <button
                      disabled={!rejectReason.trim()}
                      onClick={() => transition(order, "rejected", rejectReason.trim())}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {t("kitchen.confirmReject")}
                    </button>
                    <button onClick={() => setRejectingId(null)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold">
                      {t("common.cancel")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // ── Per-department view: mark rows printed/done independently ─
        <div className="space-y-3">
          {activeOrders.every((o) => o.items.every((i) => i.destinations.every((d) => d.destinationId !== tab))) && (
            <p className="text-sm text-gray-500 py-6">{t("kitchen.departmentEmpty")}</p>
          )}
          {activeOrders.map((order) => {
            const rows = order.items.flatMap((item) =>
              item.destinations.filter((d) => d.destinationId === tab).map((d) => ({ item, dest: d })),
            );
            if (rows.length === 0) return null;
            return (
              <div key={order.id} data-testid={`dept-order-${order.dailyNumber}`} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="font-bold text-gray-900 mb-2">#{order.dailyNumber}</div>
                <ul className="space-y-1.5">
                  {rows.map(({ item, dest }) => (
                    <li key={dest.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={dest.printedAt !== null}
                        onChange={(e) => togglePrinted(dest.id, e.target.checked)}
                        className="w-4 h-4"
                        aria-label={`${t("kitchen.markDone")} ${item.name}`}
                      />
                      <span className={dest.printedAt !== null ? "line-through text-gray-400" : "text-gray-700"}>
                        {item.quantity}× {item.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Departments (order destinations) manager ── */}
      <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-gray-900">{t("destinations.title")}</h2>
        <p className="text-sm text-gray-500 mt-1 mb-3">{t("destinations.subtitle")}</p>
        <div className="flex items-center gap-2 mb-3">
          <input
            value={newDestName}
            onChange={(e) => setNewDestName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addDestination(); }}
            placeholder={t("destinations.namePlaceholder")}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm"
          />
          <button onClick={addDestination} disabled={!newDestName.trim()} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50">
            {t("destinations.add")}
          </button>
        </div>
        {destinations.length === 0 ? (
          <p className="text-xs text-gray-400 italic">{t("destinations.empty")}</p>
        ) : (
          <ul className="space-y-1.5">
            {destinations.map((d) => (
              <li key={d.id} className="flex items-center gap-3 text-sm text-gray-700">
                <span className="flex-1">{d.name}</span>
                <button onClick={() => renameDestination(d)} className="text-xs text-gray-500 hover:text-gray-700">
                  {t("common.edit")}
                </button>
                <button onClick={() => removeDestination(d)} className="text-xs text-red-500 hover:text-red-700">
                  {t("common.delete")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
        active ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );
}
