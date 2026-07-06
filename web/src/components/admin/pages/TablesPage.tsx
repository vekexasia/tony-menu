"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchAdminFloor, createTable, updateTable, deleteTable, updateTablePosition,
  createArea, updateArea, deleteArea,
  ApiError, type Area, type AdminFloorTable,
} from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { FloorCanvas, type FloorTile } from "@/components/floor/FloorCanvas";
import type { TableShape } from "@menu/schemas";

const POLL_MS = 10_000;

/**
 * Admin tables (#15): canvas-first, colour-coded like the staff floor. Default mode
 * navigates to a table's page on tap. "Edit layout" toggle reveals drag/snap/autosave
 * plus the rare-action UI (add table, area management, per-table action panel).
 */
export default function TablesPage() {
  const t = useTranslations("admin");
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [tables, setTables] = useState<AdminFloorTable[]>([]);
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string>("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [areaName, setAreaName] = useState("");
  const [tableName, setTableName] = useState("");
  const [tableShape, setTableShape] = useState<TableShape>("rect");
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const res = await fetchAdminFloor();
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
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const addArea = async () => {
    const trimmed = areaName.trim();
    if (!trimmed) return;
    try {
      const res = await createArea({ name: trimmed });
      setAreas((prev) => [...(prev ?? []), { id: res.id, name: trimmed, sortOrder: prev?.length ?? 0 }]);
      setActiveArea((prev) => prev ?? res.id);
      setAreaName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const renameArea = async (area: Area) => {
    const next = window.prompt(t("tables.areaRenamePrompt"), area.name)?.trim();
    if (!next || next === area.name) return;
    try {
      await updateArea(area.id, { name: next });
      setAreas((prev) => prev?.map((x) => x.id === area.id ? { ...x, name: next } : x) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeArea = async (area: Area) => {
    if (!window.confirm(t("tables.areaDeleteConfirm"))) return;
    try {
      await deleteArea(area.id);
      setAreas((prev) => prev?.filter((x) => x.id !== area.id) ?? null);
      setActiveArea((prev) => (prev === area.id ? null : prev));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError(t("tables.areaHasTables"));
      else setError(err instanceof Error ? err.message : String(err));
    }
  };

  const addTable = async () => {
    const trimmed = tableName.trim();
    if (!trimmed || !activeArea) return;
    try {
      const res = await createTable({ name: trimmed, areaId: activeArea, shape: tableShape });
      setTables((prev) => [...prev, {
        id: res.id, name: trimmed, active: true, areaId: activeArea, x: 25, y: 25, shape: tableShape,
        sessionId: null, openedAt: null, orderCount: 0, readyCount: 0, oldestSubmittedAt: null,
      }]);
      setTableName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Default mode: tap navigates to the table page. Edit mode: tap opens the action panel.
  const onTileTap = (tile: FloorTile) => {
    if (!editMode) {
      router.push(`/admin/tables/${tile.id}`);
      return;
    }
    const table = tables.find((tb) => tb.id === tile.id);
    if (!table) return;
    setSelectedId((prev) => (prev === table.id ? null : table.id)); // second tap closes
    setRenaming(table.name);
    setConfirmingDelete(false);
  };

  const saveRename = async (table: AdminFloorTable) => {
    const next = renaming.trim();
    if (!next || next === table.name) return;
    try {
      await updateTable(table.id, { name: next });
      setTables((prev) => prev.map((x) => x.id === table.id ? { ...x, name: next } : x));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleActive = async (table: AdminFloorTable) => {
    try {
      await updateTable(table.id, { active: !table.active });
      setTables((prev) => prev.map((x) => x.id === table.id ? { ...x, active: !x.active } : x));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeTable = async (table: AdminFloorTable) => {
    try {
      await deleteTable(table.id);
      setTables((prev) => prev.filter((x) => x.id !== table.id));
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Optimistic drag-end auto-save; revert on failure.
  const moveTable = async (id: string, x: number, y: number) => {
    const prevPos = tables.find((tb) => tb.id === id);
    setTables((prev) => prev.map((tb) => tb.id === id ? { ...tb, x, y } : tb));
    try {
      await updateTablePosition(id, { x, y });
    } catch (err) {
      if (prevPos) setTables((prev) => prev.map((tb) => tb.id === id ? { ...tb, x: prevPos.x, y: prevPos.y } : tb));
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const areaTables = tables.filter((tb) => tb.areaId === activeArea);
  const tiles: FloorTile[] = areaTables.map((tb) => ({
    id: tb.id, name: tb.name, x: tb.x, y: tb.y, shape: tb.shape, active: tb.active,
    sessionId: tb.sessionId, oldestSubmittedAt: tb.oldestSubmittedAt,
  }));
  const selected = areaTables.find((tb) => tb.id === selectedId) ?? null;

  const statusLine = (tb: AdminFloorTable): string => {
    if (!tb.sessionId) return t("tables.statusFree");
    if (tb.oldestSubmittedAt == null) return t("tables.statusOpen");
    const mins = Math.floor((now - tb.oldestSubmittedAt) / 60000);
    return t("tables.statusWaiting").replace("{count}", String(mins));
  };

  return (
    <main className="p-6 w-full max-w-none" style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("tables.title")}</h1>
          <p className="text-sm text-gray-500 mt-1 mb-4">{t("tables.subtitle")}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 shrink-0 cursor-pointer">
          <input type="checkbox" checked={editMode} onChange={(e) => { setEditMode(e.target.checked); setSelectedId(null); }} data-testid="edit-layout-toggle" />
          {t("tables.editLayout")}
        </label>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm" data-testid="tables-error">{error}</div>}

      {editMode && (
        <div className="flex items-center gap-2 mb-4">
          <input
            value={areaName}
            onChange={(e) => setAreaName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addArea(); }}
            placeholder={t("tables.areaPlaceholder")}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm"
          />
          <button onClick={addArea} disabled={!areaName.trim()} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50">
            {t("tables.addArea")}
          </button>
        </div>
      )}

      {areas === null ? (
        <p className="text-sm text-gray-500">{t("common.loading")}</p>
      ) : areas.length === 0 ? (
        <p className="text-xs text-gray-400 italic">{t("tables.noAreas")}</p>
      ) : (
        <>
          <div className="flex gap-2 mb-4 flex-wrap" data-testid="area-tabs">
            {areas.map((area) => (
              <div key={area.id} className={`flex items-center gap-1 rounded-full pl-3 pr-1.5 py-1 text-sm ${area.id === activeArea ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
                <button type="button" onClick={() => { setActiveArea(area.id); setSelectedId(null); }} data-testid={`area-tab-${area.id}`} className="font-semibold">{area.name}</button>
                {editMode && <button type="button" onClick={() => renameArea(area)} aria-label={t("common.edit")} className={`px-1 text-xs ${area.id === activeArea ? "text-white/80" : "text-gray-400"}`}>✎</button>}
                {editMode && <button type="button" onClick={() => removeArea(area)} aria-label={t("common.delete")} className={`px-1 text-xs ${area.id === activeArea ? "text-white/80" : "text-red-400"}`}>×</button>}
              </div>
            ))}
          </div>

          {activeArea && (
            <>
              {editMode && (
                <div className="flex items-center gap-2 mb-4">
                  <input
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addTable(); }}
                    placeholder={t("tables.namePlaceholder")}
                    className="h-9 rounded-lg border border-gray-200 px-3 text-sm w-40"
                  />
                  <select value={tableShape} onChange={(e) => setTableShape(e.target.value as TableShape)} className="h-9 rounded-lg border border-gray-200 px-2 text-sm" aria-label={t("tables.shapeLabel")}>
                    <option value="rect">{t("tables.shapeRect")}</option>
                    <option value="circle">{t("tables.shapeCircle")}</option>
                  </select>
                  <button onClick={addTable} disabled={!tableName.trim()} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50">
                    {t("tables.add")}
                  </button>
                </div>
              )}

              <p className="text-xs text-gray-400 mb-2">{editMode ? t("tables.canvasHintEdit") : t("tables.canvasHint")}</p>
              <FloorCanvas tiles={tiles} editable={editMode} now={now} pannable onMove={moveTable} onTap={onTileTap} />

              {selected && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4" data-testid="table-panel">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{selected.name}</p>
                      <p className="text-xs text-gray-500">{areas.find((a) => a.id === selected.areaId)?.name} · {statusLine(selected)}</p>
                    </div>
                    <button type="button" onClick={() => setSelectedId(null)} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-600">×</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={renaming}
                      onChange={(e) => setRenaming(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRename(selected); }}
                      className="h-9 rounded-lg border border-gray-200 px-3 text-sm w-40"
                      aria-label={t("tables.renamePrompt")}
                    />
                    <button onClick={() => saveRename(selected)} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold">{t("common.save")}</button>
                    <button onClick={() => toggleActive(selected)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold">
                      {selected.active ? t("tables.deactivate") : t("tables.activate")}
                    </button>
                    {confirmingDelete ? (
                      <>
                        <button onClick={() => removeTable(selected)} data-testid="table-delete-confirm" className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold">{t("common.delete")}</button>
                        <button onClick={() => setConfirmingDelete(false)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold">{t("common.cancel")}</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmingDelete(true)} className="px-3 py-1.5 rounded-lg text-red-500 text-xs font-semibold">{t("common.delete")}</button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
