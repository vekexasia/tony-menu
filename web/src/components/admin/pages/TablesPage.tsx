"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchTables, createTable, updateTable, deleteTable, updateTablePosition,
  fetchAreas, createArea, updateArea, deleteArea,
  ApiError, type Area, type AdminTable,
} from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { FloorCanvas, type FloorTile } from "@/components/floor/FloorCanvas";
import type { TableShape } from "@menu/schemas";

/**
 * Admin tables (#15): area management + per-area floor plan editor. Tables carry a
 * shape and a position on the 1000x700 canvas; area is fixed at creation time.
 */
export default function TablesPage() {
  const t = useTranslations("admin");
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [tables, setTables] = useState<AdminTable[]>([]);
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [areaName, setAreaName] = useState("");
  const [tableName, setTableName] = useState("");
  const [tableShape, setTableShape] = useState<TableShape>("rect");

  const refresh = useCallback(async () => {
    try {
      const [a, tb] = await Promise.all([fetchAreas(), fetchTables()]);
      setAreas(a.areas);
      setTables(tb.tables);
      setActiveArea((prev) => prev ?? a.areas[0]?.id ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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
      setTables((prev) => [...prev, { id: res.id, name: trimmed, active: true, sortOrder: prev.length, areaId: activeArea, x: 25, y: 25, shape: tableShape }]);
      setTableName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const renameTable = async (table: AdminTable) => {
    const next = window.prompt(t("tables.renamePrompt"), table.name)?.trim();
    if (!next || next === table.name) return;
    try {
      await updateTable(table.id, { name: next });
      setTables((prev) => prev.map((x) => x.id === table.id ? { ...x, name: next } : x));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleActive = async (table: AdminTable) => {
    try {
      await updateTable(table.id, { active: !table.active });
      setTables((prev) => prev.map((x) => x.id === table.id ? { ...x, active: !x.active } : x));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeTable = async (table: AdminTable) => {
    if (!window.confirm(t("tables.deleteConfirm"))) return;
    try {
      await deleteTable(table.id);
      setTables((prev) => prev.filter((x) => x.id !== table.id));
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
  }));

  return (
    <main className="p-6 max-w-3xl" style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
      <h1 className="text-2xl font-bold text-gray-900">{t("tables.title")}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-4">{t("tables.subtitle")}</p>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm" data-testid="tables-error">{error}</div>}

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

      {areas === null ? (
        <p className="text-sm text-gray-500">{t("common.loading")}</p>
      ) : areas.length === 0 ? (
        <p className="text-xs text-gray-400 italic">{t("tables.noAreas")}</p>
      ) : (
        <>
          <div className="flex gap-2 mb-4 flex-wrap" data-testid="area-tabs">
            {areas.map((area) => (
              <div key={area.id} className={`flex items-center gap-1 rounded-full pl-3 pr-1.5 py-1 text-sm ${area.id === activeArea ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
                <button type="button" onClick={() => setActiveArea(area.id)} data-testid={`area-tab-${area.id}`} className="font-semibold">{area.name}</button>
                <button type="button" onClick={() => renameArea(area)} aria-label={t("common.edit")} className={`px-1 text-xs ${area.id === activeArea ? "text-white/80" : "text-gray-400"}`}>✎</button>
                <button type="button" onClick={() => removeArea(area)} aria-label={t("common.delete")} className={`px-1 text-xs ${area.id === activeArea ? "text-white/80" : "text-red-400"}`}>×</button>
              </div>
            ))}
          </div>

          {activeArea && (
            <>
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

              <p className="text-xs text-gray-400 mb-2">{t("tables.dragHint")}</p>
              <FloorCanvas tiles={tiles} editable onMove={moveTable} />

              <ul className="space-y-1.5 mt-4">
                {areaTables.map((table) => (
                  <li key={table.id} className="flex items-center gap-3 text-sm text-gray-700 rounded-xl border border-gray-200 bg-white px-4 py-2.5">
                    <span className={`flex-1 ${table.active ? "" : "text-gray-400 line-through"}`}>{table.name}</span>
                    <button onClick={() => toggleActive(table)} className="text-xs text-gray-500 hover:text-gray-700">
                      {table.active ? t("tables.deactivate") : t("tables.activate")}
                    </button>
                    <button onClick={() => renameTable(table)} className="text-xs text-gray-500 hover:text-gray-700">{t("common.edit")}</button>
                    <button onClick={() => removeTable(table)} className="text-xs text-red-500 hover:text-red-700">{t("common.delete")}</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}
