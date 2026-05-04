"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  createMenu,
  deleteMenu,
  fetchMenus,
  reorderMenus,
  updateMenu,
  type AdminMenu,
  type Weekday,
} from "@/lib/api";

const ALL_WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
import { useRestaurantStore, useCategories } from "@/stores/restaurantStore";
import { SortableList, DragHandle } from "@/components/admin/SortableList";
import { TranslationTabs } from "@/components/admin/TranslationTabs";
import { MenuIcon, MENU_ICON_KINDS, type MenuIconKind } from "@/components/menu/MenuIcon";
import { useTranslations } from "@/lib/i18n";

interface I18nData {
  [locale: string]: { title?: string };
}

const CODE_RE = /^[a-z0-9-]+$/;

export default function MenusPage() {
  const t = useTranslations("admin");
  const { loadRestaurant, data: restaurantData } = useRestaurantStore();
  const categories = useCategories();
  const primaryLocale = restaurantData?.features?.primaryLocale ?? "it";

  const [menus, setMenus] = useState<AdminMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdminMenu | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editI18n, setEditI18n] = useState<I18nData>({});
  const [editIcon, setEditIcon] = useState<MenuIconKind>("utensils");
  const [editAvailableFrom, setEditAvailableFrom] = useState<string>("");
  const [editAvailableTo, setEditAvailableTo] = useState<string>("");
  const [editAvailableDays, setEditAvailableDays] = useState<Weekday[] | null>(null);
  const [activeTab, setActiveTab] = useState(primaryLocale);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<AdminMenu | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = async () => {
    setLoadError(null);
    try {
      const res = await fetchMenus();
      setMenus(res.menus);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("menus.loadError"));
    }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  // Compute per-menu entry counts using the public catalog the store already loaded.
  // (Memberships drive these counts, so categories alone aren't enough.)
  const entryCountByMenu = (() => {
    const counts = new Map<string, number>();
    for (const cat of categories) {
      for (const entry of cat.entries) {
        for (const id of entry.menuIds) {
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
    }
    return counts;
  })();

  const handleCreate = async () => {
    setCreateError(null);
    const code = newCode.trim().toLowerCase();
    const title = newTitle.trim();
    if (!CODE_RE.test(code)) {
      setCreateError(t("menus.invalidCode"));
      return;
    }
    if (!title) {
      setCreateError(t("menus.titleRequired"));
      return;
    }
    try {
      await createMenu({ code, title });
      setCreating(false);
      setNewCode("");
      setNewTitle("");
      await refresh();
      await loadRestaurant({ force: true });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("menus.createFailed");
      setCreateError(msg);
    }
  };

  const openEdit = (menu: AdminMenu) => {
    setEditing(menu);
    setEditTitle(menu.title);
    setEditCode(menu.code);
    setEditI18n((menu.i18n ?? {}) as I18nData);
    setEditIcon((MENU_ICON_KINDS as readonly string[]).includes(menu.icon) ? (menu.icon as MenuIconKind) : "utensils");
    setEditAvailableFrom(menu.availableFrom ?? "");
    setEditAvailableTo(menu.availableTo ?? "");
    setEditAvailableDays(menu.availableDays ?? null);
    setActiveTab(primaryLocale);
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const title = editTitle.trim();
    const code = editCode.trim().toLowerCase();
    if (!CODE_RE.test(code)) {
      setEditError(t("menus.invalidCode"));
      return;
    }
    if (!title) {
      setEditError(t("menus.titleRequired"));
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const schedulePayload = editAvailableFrom && editAvailableTo
        ? { availableFrom: editAvailableFrom, availableTo: editAvailableTo }
        : { availableFrom: null, availableTo: null };
      // Normalize all-7 / empty to null so we don't store two equivalent representations.
      const days = editAvailableDays;
      const daysPayload =
        !days || days.length === 0 || days.length === 7
          ? { availableDays: null }
          : { availableDays: ALL_WEEKDAYS.filter((d) => days.includes(d)) };
      await updateMenu(editing.id, { title, code, icon: editIcon, i18n: editI18n as Record<string, Record<string, string>>, ...schedulePayload, ...daysPayload });
      setEditing(null);
      await refresh();
      await loadRestaurant({ force: true });
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : t("menus.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (menu: AdminMenu) => {
    const next = !menu.published;
    setMenus((prev) => prev.map((m) => (m.id === menu.id ? { ...m, published: next } : m)));
    try {
      await updateMenu(menu.id, { published: next });
      await loadRestaurant({ force: true });
    } catch {
      // revert on error
      setMenus((prev) => prev.map((m) => (m.id === menu.id ? { ...m, published: !next } : m)));
    }
  };

  const handleReorder = async (reordered: AdminMenu[]) => {
    setMenus(reordered.map((m, i) => ({ ...m, sortOrder: i })));
    try {
      await reorderMenus(reordered.map((m, i) => ({ id: m.id, order: i })));
    } catch {
      await refresh();
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingId(deleting.id);
    try {
      await deleteMenu(deleting.id);
      setDeleting(null);
      await refresh();
      await loadRestaurant({ force: true });
    } catch {
      // leave dialog open so user can retry
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-gray-500">{t("menus.loading")}</div>;
  }

  return (
    <div className="adm-scroll" style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "20px 24px" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-primary">{t("layout.nav.menu")}</div>
          <h1 className="text-xl font-bold text-gray-900">{t("menus.title")}</h1>
          <p className="text-xs text-gray-500 mt-1">
            {t("menus.subtitle")}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90"
        >
          {t("menus.newMenu")}
        </button>
      </div>

      {loadError && (
        <div className="mb-3 px-3 py-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
          {loadError}
        </div>
      )}

      {creating && (
        <div className="mb-4 p-4 bg-white border rounded-lg">
          <h3 className="font-semibold text-gray-800 mb-2">{t("menus.newMenuTitle")}</h3>
          <div className="grid grid-cols-2 gap-2">
            <input
              autoFocus
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder={t("menus.codePlaceholder")}
              className="px-3 py-2 border rounded text-sm"
            />
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t("menus.titlePlaceholder")}
              className="px-3 py-2 border rounded text-sm"
            />
          </div>
          {createError && (
            <div className="mt-2 text-xs text-red-600">{createError}</div>
          )}
          <div className="mt-3 flex gap-2 justify-end">
            <button
              onClick={() => { setCreating(false); setCreateError(null); }}
              className="px-3 py-2 rounded text-sm text-gray-600 hover:bg-gray-100"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleCreate}
              className="px-3 py-2 rounded text-sm font-semibold bg-primary text-white hover:bg-primary/90"
            >
              {t("common.create")}
            </button>
          </div>
        </div>
      )}

      {menus.length === 0 ? (
        <div className="p-8 text-center text-gray-500 bg-white rounded-lg border">
          {t("menus.empty")}
        </div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          <SortableList
            items={menus}
            onReorder={handleReorder}
            renderItem={(menu, _index, dragHandleProps) => {
              const entryCount = entryCountByMenu.get(menu.id) ?? 0;
              return (
                <div
                  className={`flex items-center gap-3 p-3 hover:bg-gray-50 ${menu.published ? "" : "opacity-60"}`}
                >
                  <DragHandle {...dragHandleProps} />
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(menu)}>
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      {menu.title}
                      {!menu.published && (
                        <span className="adm-pill-draft text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded">
                          {t("menus.draft")}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      <code>{menu.code}</code> · {entryCount} {entryCount === 1 ? t("menus.entryOne") : t("menus.entryMany")}
                      {menu.availableFrom && menu.availableTo && (
                        <span className="adm-pill-accent ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded">
                          {menu.availableFrom}–{menu.availableTo}
                        </span>
                      )}
                      {menu.availableDays && menu.availableDays.length > 0 && menu.availableDays.length < 7 && (
                        <span className="adm-pill-accent ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded">
                          {ALL_WEEKDAYS.filter((d) => menu.availableDays!.includes(d)).map((d) => t(`menus.day.${d}`)).join(' · ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePublished(menu); }}
                    className={`px-2 py-1 text-xs rounded font-semibold ${
                      menu.published ? "adm-pill-ok hover:opacity-80" : "adm-pill-draft hover:opacity-80"
                    }`}
                    title={menu.published ? t("menus.publishedTooltip") : t("menus.draftTooltip")}
                  >
                    {menu.published ? t("menus.published") : t("menus.draft")}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleting(menu); }}
                    className="p-2 text-red-500 hover:bg-red-50 rounded"
                    title={t("menus.deleteTooltip")}
                  >
                    <i className="fa-solid fa-trash" style={{ fontSize: 12 }} />
                  </button>
                </div>
              );
            }}
          />
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex justify-between items-center z-10">
              <h3 className="font-bold text-lg">{t("menus.editTitle")}</h3>
              <button onClick={() => setEditing(null)} className="p-2 hover:bg-gray-100 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("menus.codeLabel")}</label>
                <input
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">{t("menus.codeHint").replace("{code}", editCode || "...")}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t("menus.iconLabel")}</label>
                <div className="grid grid-cols-4 gap-2">
                  {MENU_ICON_KINDS.map((kind) => {
                    const selected = kind === editIcon;
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => setEditIcon(kind)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                          selected ? "bg-primary/10 border-primary text-primary" : "bg-white border-gray-200 hover:bg-gray-50 text-gray-600"
                        }`}
                        title={t(`menus.icon.${kind}`)}
                      >
                        <div className="w-7 h-7">
                          <MenuIcon kind={kind} />
                        </div>
                        <span className="text-[10px] font-medium uppercase tracking-wide">{t(`menus.icon.${kind}`)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("menus.titleLabel")}</label>
                <TranslationTabs
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  primaryLocale={primaryLocale}
                  enabledLocales={restaurantData?.features?.enabledLocales}
                  disabledLocales={restaurantData?.features?.disabledLocales}
                  customLocales={restaurantData?.features?.customLocales}
                  fields={[{ key: "title", label: t("menus.fieldTitle"), sourceValue: editTitle }]}
                  i18n={editI18n as Record<string, Record<string, string>>}
                  onI18nChange={(updated) => setEditI18n(updated as I18nData)}
                >
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                    placeholder={t("menus.editTitlePlaceholder")}
                  />
                </TranslationTabs>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("menus.scheduleLabel")}</label>
                <p className="text-xs text-gray-500 mb-2">{t("menus.scheduleHint")}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={editAvailableFrom}
                    onChange={(e) => setEditAvailableFrom(e.target.value)}
                    className="px-3 py-2 border rounded text-sm flex-1"
                    placeholder="HH:MM"
                  />
                  <span className="text-sm text-gray-500">{t("menus.scheduleTo")}</span>
                  <input
                    type="time"
                    value={editAvailableTo}
                    onChange={(e) => setEditAvailableTo(e.target.value)}
                    className="px-3 py-2 border rounded text-sm flex-1"
                    placeholder="HH:MM"
                  />
                  {(editAvailableFrom || editAvailableTo) && (
                    <button
                      type="button"
                      onClick={() => { setEditAvailableFrom(""); setEditAvailableTo(""); }}
                      className="text-xs text-gray-500 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50"
                    >
                      {t("menus.scheduleClear")}
                    </button>
                  )}
                </div>
                {editAvailableFrom && !editAvailableTo && (
                  <p className="text-xs text-amber-600 mt-1">{t("menus.scheduleBothRequired")}</p>
                )}
                {!editAvailableFrom && editAvailableTo && (
                  <p className="text-xs text-amber-600 mt-1">{t("menus.scheduleBothRequired")}</p>
                )}
                {editAvailableFrom && editAvailableTo && (
                  <p className="text-xs text-gray-500 mt-1">
                    {editAvailableFrom > editAvailableTo
                      ? t("menus.scheduleOvernight").replace("{from}", editAvailableFrom).replace("{to}", editAvailableTo)
                      : t("menus.scheduleSameDay").replace("{from}", editAvailableFrom).replace("{to}", editAvailableTo)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("menus.daysLabel")}</label>
                <p className="text-xs text-gray-500 mb-2">{t("menus.daysHint")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_WEEKDAYS.map((day) => {
                    const selected = editAvailableDays?.includes(day) ?? false;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setEditAvailableDays((prev) => {
                            const current = prev ?? [];
                            const next = current.includes(day)
                              ? current.filter((d) => d !== day)
                              : [...current, day];
                            return next.length === 0 ? null : next;
                          });
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          selected
                            ? "bg-primary text-white border-primary"
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {t(`menus.day.${day}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {editError && (
                <div className="text-sm text-red-600">{editError}</div>
              )}

              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditing(null)} className="px-3 py-2 rounded text-sm text-gray-600 hover:bg-gray-100">{t("common.cancel")}</button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-3 py-2 rounded text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 max-w-md w-full">
            <h3 className="font-bold text-lg text-gray-900">{t("menus.deleteTitle").replace("{name}", deleting.title)}</h3>
            <p className="text-sm text-gray-600 mt-2">
              {t("menus.deleteConfirm")}
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setDeleting(null)} className="px-3 py-2 rounded text-sm text-gray-600 hover:bg-gray-100">{t("common.cancel")}</button>
              <button
                onClick={handleDelete}
                disabled={deletingId === deleting.id}
                className="px-3 py-2 rounded text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingId === deleting.id ? t("common.deleting") : t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
