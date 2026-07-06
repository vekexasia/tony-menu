"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchFloor, openTableSession, type Area, type FloorTable } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { FloorCanvas, type FloorTile } from "@/components/floor/FloorCanvas";

const POLL_MS = 10_000;
const TICK_MS = 30_000; // re-render the elapsed-minutes labels

/** Floor plan view (#15): area tabs + read-only canvas; tap a table to open its session. */
export function FloorView() {
  const t = useTranslations("staff");
  const router = useRouter();
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const res = await fetchFloor();
      setAreas(res.areas);
      setTables(res.tables);
      setActiveArea((prev) => prev ?? res.areas[0]?.id ?? null);
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

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const open = async (tile: FloorTile) => {
    const table = tables.find((tb) => tb.id === tile.id);
    if (!table) return;
    if (table.sessionId) {
      router.push(`/staff/table/${table.sessionId}`);
      return;
    }
    setBusy(tile.id);
    try {
      const { sessionId } = await openTableSession(tile.id);
      router.push(`/staff/table/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  const tiles: FloorTile[] = tables
    .filter((tb) => tb.areaId === activeArea)
    .map((tb) => ({
      id: tb.id,
      name: tb.name,
      x: tb.x,
      y: tb.y,
      shape: tb.shape,
      sessionId: tb.sessionId,
      oldestSubmittedAt: tb.oldestSubmittedAt,
    }));

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{t("floor.title")}</h1>
        <p className="text-sm text-gray-500 mb-4">{t("floor.subtitle")}</p>

        {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

        {areas === null ? (
          <p className="text-sm text-gray-500">{t("loading")}</p>
        ) : areas.length === 0 ? (
          <p className="text-sm text-gray-500">{t("floor.empty")}</p>
        ) : (
          <>
            <div className="flex gap-2 mb-4 flex-wrap" data-testid="floor-tabs">
              {areas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => setActiveArea(area.id)}
                  data-testid={`area-tab-${area.id}`}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold ${area.id === activeArea ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200"}`}
                >
                  {area.name}
                </button>
              ))}
            </div>
            <FloorCanvas tiles={tiles} editable={false} now={now} busyId={busy} onTap={open} />
          </>
        )}
      </div>
    </main>
  );
}
