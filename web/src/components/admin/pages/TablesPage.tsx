"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchTables, createTable, updateTable, deleteTable, type AdminTable } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";

/** Admin tables CRUD (#15): name + active flag, flat list (same pattern as destinations). */
export default function TablesPage() {
  const t = useTranslations("admin");
  const [tables, setTables] = useState<AdminTable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetchTables();
      setTables(res.tables);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await createTable({ name: trimmed });
      setTables((prev) => [...(prev ?? []), { id: res.id, name: trimmed, active: true, sortOrder: prev?.length ?? 0 }]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const rename = async (table: AdminTable) => {
    const next = window.prompt(t("tables.renamePrompt"), table.name)?.trim();
    if (!next || next === table.name) return;
    try {
      await updateTable(table.id, { name: next });
      setTables((prev) => prev?.map((x) => x.id === table.id ? { ...x, name: next } : x) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleActive = async (table: AdminTable) => {
    try {
      await updateTable(table.id, { active: !table.active });
      setTables((prev) => prev?.map((x) => x.id === table.id ? { ...x, active: !x.active } : x) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async (table: AdminTable) => {
    if (!window.confirm(t("tables.deleteConfirm"))) return;
    try {
      await deleteTable(table.id);
      setTables((prev) => prev?.filter((x) => x.id !== table.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main className="p-6 max-w-3xl" style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
      <h1 className="text-2xl font-bold text-gray-900">{t("tables.title")}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-4">{t("tables.subtitle")}</p>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      <div className="flex items-center gap-2 mb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder={t("tables.namePlaceholder")}
          className="h-9 rounded-lg border border-gray-200 px-3 text-sm"
        />
        <button onClick={add} disabled={!name.trim()} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50">
          {t("tables.add")}
        </button>
      </div>

      {tables === null ? (
        <p className="text-sm text-gray-500">{t("common.loading")}</p>
      ) : tables.length === 0 ? (
        <p className="text-xs text-gray-400 italic">{t("tables.empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {tables.map((table) => (
            <li key={table.id} className="flex items-center gap-3 text-sm text-gray-700 rounded-xl border border-gray-200 bg-white px-4 py-2.5">
              <span className={`flex-1 ${table.active ? "" : "text-gray-400 line-through"}`}>{table.name}</span>
              <button onClick={() => toggleActive(table)} className="text-xs text-gray-500 hover:text-gray-700">
                {table.active ? t("tables.deactivate") : t("tables.activate")}
              </button>
              <button onClick={() => rename(table)} className="text-xs text-gray-500 hover:text-gray-700">{t("common.edit")}</button>
              <button onClick={() => remove(table)} className="text-xs text-red-500 hover:text-red-700">{t("common.delete")}</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
