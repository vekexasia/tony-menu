"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { uploadEntryImage, deleteEntryImage } from "@/lib/imageUpload";
import { updateEntry, createEntry, deleteEntry, moveEntry } from "@/lib/api";
import { useRestaurantStore, useCategories, useLabels } from "@/stores/restaurantStore";
import { LABEL_COLOR_STYLES, resolveLabel } from "@/lib/label-colors";
import { TranslationTabs } from "@/components/admin/TranslationTabs";
import { MenuItemListView, type MenuItemView } from "@/components/menu/views/MenuItemListView";
import { MenuItemDetailView } from "@/components/menu/views/MenuItemDetailView";
import { useTranslations, getMessage } from "@/lib/i18n";
import { useAdminLocale } from "@/app/admin/AdminI18nProvider";

const FRAME_W = 360;
const BEZEL = 12;

const ALLERGEN_IDS = [
  "Glutine",
  "Crostacei",
  "Uova",
  "Pesce",
  "Arachidi",
  "Soia",
  "Latte-e-Derivati",
  "Frutta-a-Guscio",
  "Sedano",
  "Senape",
  "Sesamo",
  "Anidride-Solforosa-e-Solfiti",
  "Lupini",
  "Molluschi",
];

interface I18nData {
  [locale: string]: {
    name?: string | null;
    desc?: string | null;
  };
}

interface MenuEntry {
  id: string;
  name: string;
  desc?: string;
  price: number;
  order: number;
  outOfStock: boolean;
  frozen: boolean;
  image?: string;
  allergens: string[];
  priceUnit?: string;
  i18n?: I18nData;
  menuIds: string[];
  labelIds: string[];
  hidden: boolean;
}

function RichTextEditor({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const t = useTranslations("admin");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertFormatting = (before: string, after: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    const newText =
      value.substring(0, start) + before + selectedText + after + value.substring(end);

    onChange(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex gap-1 p-1 bg-gray-50 border-b">
        <button
          type="button"
          onClick={() => insertFormatting("<b>", "</b>")}
          className="px-2 py-1 text-sm font-bold hover:bg-gray-200 rounded"
          title={t("entries.editor.bold")}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => insertFormatting("<i>", "</i>")}
          className="px-2 py-1 text-sm italic hover:bg-gray-200 rounded"
          title={t("entries.editor.italic")}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => insertFormatting("<u>", "</u>")}
          className="px-2 py-1 text-sm underline hover:bg-gray-200 rounded"
          title={t("entries.editor.underline")}
        >
          U
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm resize-none focus:outline-none"
        rows={rows}
        placeholder={placeholder}
      />
    </div>
  );
}

const PRIMARY_LOCALE_LABELS: Record<string, string> = {
  it: "Italiano",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  nl: "Nederlands",
  ru: "Русский",
  pt: "Português",
  hu: "Magyar",
};

export default function EditEntryPage() {
  const t = useTranslations("admin");
  const searchParams = useSearchParams();
  const router = useRouter();
  const categoryId = searchParams.get("category");
  const entryParam = searchParams.get("entry");
  const isNewEntry = entryParam === "new";

  const allCategories = useCategories();
  const allLabels = useLabels();
  const { loadRestaurant, categoriesCache, isLoading: storeLoading, data: restaurantData } = useRestaurantStore();
  const { locale: adminLocale } = useAdminLocale();

  const primaryLocale = restaurantData?.features?.primaryLocale ?? "it";
  const primaryLocaleLabel =
    PRIMARY_LOCALE_LABELS[primaryLocale]
    ?? (restaurantData?.features?.customLocales ?? []).find((c) => c.code === primaryLocale)?.name
    ?? primaryLocale;

  const [editingEntry, setEditingEntry] = useState<MenuEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [movingEntry, setMovingEntry] = useState(false);
  const [selectedTargetCategory, setSelectedTargetCategory] = useState<string>("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTranslationTab, setActiveTranslationTab] = useState<string>(primaryLocale);
  const initializedRef = useRef(false);

  useEffect(() => {
    loadRestaurant();
  }, [loadRestaurant]);

  // Initialize the form once per (entry, category) once the store is ready.
  useEffect(() => {
    if (!categoryId) {
      setError("entries.categoryNotSpecified");
      setLoading(false);
      return;
    }
    if (storeLoading) return;
    if (!restaurantData) return;
    if (initializedRef.current) return;

    if (isNewEntry) {
      const cachedCat = categoriesCache.get(`menuEntries/${categoryId}`);
      const maxOrder = cachedCat && cachedCat.entries.length > 0
        ? Math.max(...cachedCat.entries.map((e) => e.order)) + 1
        : 0;
      const defaultMenuIds = (restaurantData.menus ?? []).map((m) => m.id);
      setEditingEntry({
        id: "",
        name: "",
        desc: "",
        price: 0,
        order: maxOrder,
        outOfStock: false,
        frozen: false,
        allergens: [],
        menuIds: defaultMenuIds,
        labelIds: [],
        hidden: false,
      });
      setActiveTranslationTab(primaryLocale);
      setLoading(false);
      initializedRef.current = true;
      return;
    }

    if (!entryParam) {
      setError("entries.categoryNotSpecified");
      setLoading(false);
      return;
    }

    const cachedCat = categoriesCache.get(`menuEntries/${categoryId}`);
    if (!cachedCat) {
      setError("entries.categoryNotFound");
      setLoading(false);
      return;
    }

    const cached = cachedCat.entries.find((e) => e.id === entryParam);
    if (!cached) {
      setError("entries.categoryNotFound");
      setLoading(false);
      return;
    }

    setEditingEntry({
      id: cached.id,
      name: cached.name,
      desc: cached.description || "",
      price: cached.price,
      order: cached.order,
      outOfStock: cached.outOfStock,
      frozen: cached.containsFrozenIngredient,
      image: cached.image,
      allergens: (cached.allergens || []) as string[],
      priceUnit: cached.priceUnit,
      i18n: (cached.i18n || {}) as I18nData,
      menuIds: cached.menuIds,
      labelIds: (cached.labelIds || []) as string[],
      hidden: cached.hidden,
    });
    setActiveTranslationTab(primaryLocale);
    setLoading(false);
    initializedRef.current = true;
  }, [categoryId, entryParam, isNewEntry, storeLoading, restaurantData, categoriesCache, primaryLocale]);

  const categoryName = useMemo(() => {
    if (!categoryId) return "";
    const cachedCat = categoriesCache.get(`menuEntries/${categoryId}`);
    return cachedCat?.name ?? "";
  }, [categoryId, categoriesCache]);

  const backHref = `/admin/items?category=${categoryId ?? ""}`;

  const navigateBackAfterMutation = () => {
    useRestaurantStore.getState().reset();
    void loadRestaurant({ force: true });
    router.push(backHref);
  };

  const sanitizeI18nData = (i18n?: I18nData | null): Record<string, Record<string, string>> => {
    const sanitized: Record<string, Record<string, string>> = {};
    for (const [locale, fields] of Object.entries(i18n || {})) {
      const localeData: Record<string, string> = {};
      if (typeof fields?.name === "string" && fields.name.trim()) localeData.name = fields.name;
      if (typeof fields?.desc === "string" && fields.desc.trim()) localeData.desc = fields.desc;
      if (Object.keys(localeData).length > 0) sanitized[locale] = localeData;
    }
    return sanitized;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !editingEntry || !categoryId) return;
    const file = e.target.files[0];
    setUploadingImage(true);
    setSaveError(null);
    try {
      const imageUrl = await uploadEntryImage(editingEntry.id, file);
      setEditingEntry({ ...editingEntry, image: imageUrl });
    } catch (err) {
      console.error("Error uploading image:", err);
      setSaveError(t("entries.uploadFailed"));
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteImage = async () => {
    if (!editingEntry || !categoryId) return;
    setUploadingImage(true);
    setSaveError(null);
    try {
      const success = await deleteEntryImage(editingEntry.id);
      if (success) {
        setEditingEntry({ ...editingEntry, image: undefined });
      } else {
        setSaveError(t("entries.removeImageFailed"));
      }
    } catch (err) {
      console.error("Error deleting image:", err);
      setSaveError(t("entries.removeImageFailed"));
    } finally {
      setUploadingImage(false);
    }
  };

  const toggleAllergen = (allergenId: string) => {
    if (!editingEntry) return;
    const currentAllergens = editingEntry.allergens || [];
    const newAllergens = currentAllergens.includes(allergenId)
      ? currentAllergens.filter((a) => a !== allergenId)
      : [...currentAllergens, allergenId];
    setEditingEntry({ ...editingEntry, allergens: newAllergens });
  };

  const handleSave = async () => {
    if (!editingEntry || !categoryId) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (isNewEntry) {
        await createEntry(categoryId, {
          name: editingEntry.name,
          description: editingEntry.desc || "",
          price: editingEntry.price,
          order: editingEntry.order,
          outOfStock: editingEntry.outOfStock,
          frozen: editingEntry.frozen,
          allergens: editingEntry.allergens,
          priceUnit: editingEntry.priceUnit || undefined,
          i18n: sanitizeI18nData(editingEntry.i18n),
          menuIds: editingEntry.menuIds,
          labelIds: editingEntry.labelIds,
          hidden: editingEntry.hidden,
        });
      } else {
        await updateEntry(editingEntry.id, {
          name: editingEntry.name,
          description: editingEntry.desc || "",
          price: editingEntry.price,
          outOfStock: editingEntry.outOfStock,
          frozen: editingEntry.frozen,
          allergens: editingEntry.allergens,
          priceUnit: editingEntry.priceUnit || undefined,
          i18n: sanitizeI18nData(editingEntry.i18n),
          menuIds: editingEntry.menuIds,
          labelIds: editingEntry.labelIds,
          hidden: editingEntry.hidden,
        });
      }
      navigateBackAfterMutation();
    } catch (err) {
      console.error("Error saving entry:", err);
      setSaveError(t(isNewEntry ? "entries.createFailed" : "entries.saveFailed"));
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingEntry || isNewEntry) return;
    setDeleting(true);
    try {
      await deleteEntry(editingEntry.id);
      navigateBackAfterMutation();
    } catch (err) {
      console.error("Error deleting entry:", err);
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const handleMoveEntryToCategory = async (targetCategoryId: string) => {
    if (!editingEntry || !categoryId || !targetCategoryId || targetCategoryId === categoryId) return;
    setMovingEntry(true);
    setSaveError(null);
    try {
      await moveEntry(editingEntry.id, targetCategoryId);
      useRestaurantStore.getState().reset();
      void loadRestaurant({ force: true });
      router.push(`/admin/items?category=${targetCategoryId}`);
    } catch (err) {
      console.error("Error moving entry:", err);
      setSaveError(t("entries.moveFailed"));
      setMovingEntry(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 flex justify-center">
        <div className="text-gray-500">{t("entries.loadingEntries")}</div>
      </div>
    );
  }

  if (error || !editingEntry || !categoryId) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {t(error ?? "entries.categoryNotFound")}
        </div>
        <Link href={`/admin/categories`} className="mt-4 inline-block text-primary hover:underline">
          {t("entries.backToCategories")}
        </Link>
      </div>
    );
  }

  const allMenus = restaurantData?.menus ?? [];

  return (
    <div className="p-4 space-y-4" style={{ flex: 1, minWidth: 0, overflowY: "auto", overflowX: "hidden", position: "relative" }}>
      {/* Header */}
      <div className="flex items-center gap-3 min-w-0">
        <Link href={backHref} className="p-2 hover:bg-gray-100 rounded-lg shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-5 h-5 text-gray-600"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-primary tracking-wider truncate">
            {(isNewEntry ? t("entries.modal.newTitle") : t("entries.modal.editTitle")).toUpperCase()}
          </h2>
          {categoryName && (
            <p className="text-xs text-gray-500 truncate">{categoryName}</p>
          )}
        </div>
      </div>

      <div className="adm-edit-grid max-w-[1140px]">
        {/* Form */}
        <div className="space-y-4 min-w-0 max-w-3xl">
          {/* Image */}
          {!isNewEntry && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("entries.modal.imageLabel")}
              </label>
              {editingEntry.image ? (
                <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-gray-200">
                  <Image src={editingEntry.image} alt={editingEntry.name} fill className="object-cover" unoptimized />
                  <div className="absolute bottom-2 right-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 disabled:opacity-50"
                      title={t("entries.modal.changeImage")}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-5 h-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteImage}
                      disabled={uploadingImage}
                      className="p-2 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 disabled:opacity-50"
                      title={t("entries.modal.removeImage")}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-5 h-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                  {uploadingImage && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="text-white font-medium">{t("common.loading")}</div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="w-full aspect-video rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                >
                  {uploadingImage ? (
                    <div className="text-gray-500">{t("common.loading")}</div>
                  ) : (
                    <>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-10 h-10 text-gray-400"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                        />
                      </svg>
                      <span className="text-sm text-gray-500">{t("entries.modal.uploadImageCta")}</span>
                    </>
                  )}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          )}

          {/* Translation tabs */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("entries.modal.nameDescLabel")}
            </label>
            <TranslationTabs
              activeTab={activeTranslationTab}
              onTabChange={setActiveTranslationTab}
              primaryLocale={primaryLocale}
              enabledLocales={restaurantData?.features?.enabledLocales}
              disabledLocales={restaurantData?.features?.disabledLocales}
              customLocales={restaurantData?.features?.customLocales}
              fields={[
                { key: "name", label: t("entries.modal.nameField"), sourceValue: editingEntry.name },
                { key: "desc", label: t("entries.modal.descField"), multiline: true, sourceValue: editingEntry.desc || "" },
              ]}
              i18n={(editingEntry.i18n || {}) as Record<string, Record<string, string>>}
              onI18nChange={(updated) =>
                setEditingEntry((prev) => (prev ? { ...prev, i18n: updated as I18nData } : prev))
              }
            >
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {t("entries.modal.namePrimary").replace("{locale}", primaryLocaleLabel)}
                  </label>
                  <input
                    type="text"
                    value={editingEntry.name}
                    onChange={(e) => setEditingEntry({ ...editingEntry, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {t("entries.modal.descPrimary").replace("{locale}", primaryLocaleLabel)}
                  </label>
                  <RichTextEditor
                    value={editingEntry.desc || ""}
                    onChange={(value) => setEditingEntry({ ...editingEntry, desc: value })}
                    placeholder={t("entries.modal.descPlaceholder")}
                  />
                </div>
              </div>
            </TranslationTabs>
          </div>

          {/* Price */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("entries.modal.priceLabel")}
              </label>
              <input
                type="number"
                step="0.01"
                value={editingEntry.price}
                onChange={(e) =>
                  setEditingEntry({ ...editingEntry, price: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="w-24">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("entries.modal.unitLabel")}
              </label>
              <input
                type="text"
                value={editingEntry.priceUnit || ""}
                onChange={(e) =>
                  setEditingEntry({ ...editingEntry, priceUnit: e.target.value || undefined })
                }
                className="w-full px-3 py-2 border rounded-lg"
                placeholder={t("entries.modal.unitPlaceholder")}
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editingEntry.outOfStock}
                onChange={(e) => setEditingEntry({ ...editingEntry, outOfStock: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm">{t("entries.modal.outOfStock")}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editingEntry.frozen}
                onChange={(e) => setEditingEntry({ ...editingEntry, frozen: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm">{t("entries.modal.frozen")}</span>
            </label>
          </div>

          {/* Menu memberships */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("entries.modal.menuLabel")}
            </label>
            {allMenus.length === 0 ? (
              <p className="text-xs text-gray-500">{t("entries.modal.noMenusDefined")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {allMenus.map((menu) => {
                  const isSelected = editingEntry.menuIds.includes(menu.id);
                  return (
                    <label
                      key={menu.id}
                      className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/10 border-primary" : "bg-white border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const next = isSelected
                            ? editingEntry.menuIds.filter((id) => id !== menu.id)
                            : [...editingEntry.menuIds, menu.id];
                          setEditingEntry({ ...editingEntry, menuIds: next });
                        }}
                        className="sr-only"
                      />
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{menu.title}</span>
                        <span className="block text-xs text-gray-500">{menu.code}</span>
                      </span>
                      {isSelected && <span className="text-primary text-sm">✓</span>}
                    </label>
                  );
                })}
              </div>
            )}
            <label className="flex items-center gap-2 mt-3">
              <input
                type="checkbox"
                checked={editingEntry.hidden}
                onChange={(e) => setEditingEntry({ ...editingEntry, hidden: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm">{t("entries.modal.hideFromPublic")}</span>
            </label>
          </div>

          {/* Labels */}
          {allLabels.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("entries.labelsSection")}
              </label>
              <div className="flex flex-wrap gap-2">
                {allLabels.map((label) => {
                  const selected = editingEntry.labelIds.includes(label.id);
                  const cs = LABEL_COLOR_STYLES[label.color] ?? LABEL_COLOR_STYLES.primary;
                  const displayName = resolveLabel(label, adminLocale).name;
                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? editingEntry.labelIds.filter((id) => id !== label.id)
                          : [...editingEntry.labelIds, label.id];
                        setEditingEntry({ ...editingEntry, labelIds: next });
                      }}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "4px 12px",
                        borderRadius: 12,
                        border: selected ? `2px solid ${cs.color}` : `2px solid transparent`,
                        background: cs.background,
                        color: cs.color,
                        cursor: "pointer",
                        opacity: selected ? 1 : 0.5,
                        fontFamily: "inherit",
                      }}
                    >
                      {displayName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {allLabels.length === 0 && (
            <p className="text-xs text-gray-400 italic">{t("entries.labelsHint")}</p>
          )}

          {/* Allergens */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("entries.modal.allergensLabel")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ALLERGEN_IDS.map((id) => {
                const label = t(`entries.allergen.${id}`);
                return (
                  <label
                    key={id}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                      editingEntry.allergens.includes(id)
                        ? "bg-primary/10 border-primary"
                        : "bg-white border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={editingEntry.allergens.includes(id)}
                      onChange={() => toggleAllergen(id)}
                      className="sr-only"
                    />
                    <Image
                      src={`/images/allergeni-${id}.png`}
                      alt={label}
                      width={24}
                      height={24}
                      className="rounded-full"
                      unoptimized
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Move to category */}
          {!isNewEntry && allCategories.length > 1 && (
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("entries.modal.moveToCategory")}
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedTargetCategory}
                  onChange={(e) => setSelectedTargetCategory(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg bg-white"
                  disabled={movingEntry}
                >
                  <option value="">{t("entries.modal.selectCategory")}</option>
                  {allCategories
                    .filter((cat) => cat.id !== categoryId)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleMoveEntryToCategory(selectedTargetCategory)}
                  disabled={!selectedTargetCategory || movingEntry}
                  className="px-4 py-2 bg-primary text-white rounded-lg font-medium disabled:opacity-50 hover:opacity-90"
                >
                  {movingEntry ? t("entries.modal.moving") : t("entries.modal.moveButton")}
                </button>
              </div>
            </div>
          )}

          {saveError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              {saveError}
            </div>
          )}

          {/* Action row */}
          <div className="border-t pt-4 flex flex-col-reverse sm:flex-row sm:items-center gap-2">
            {!isNewEntry && (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                disabled={saving || deleting}
                className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg font-medium hover:bg-red-100 disabled:opacity-50"
              >
                {t("common.delete")}
              </button>
            )}
            <div className="flex-1" />
            <Link
              href={backHref}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 text-center"
            >
              {t("common.cancel")}
            </Link>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || uploadingImage || (isNewEntry && !editingEntry.name.trim())}
              className="px-6 py-2 bg-primary text-white rounded-lg font-medium disabled:opacity-50"
            >
              {saving
                ? t("common.saving")
                : isNewEntry
                  ? t("entries.modal.creatingEntry")
                  : t("entries.modal.savingChanges")}
            </button>
          </div>
        </div>

        {/* Preview pane — fixed to the right edge, follows the active translation tab.
            Renders the public views at iPhone-native size (390px) and scales them
            down via CSS transform so proportions match the customer view exactly. */}
        {(() => {
          const previewLocale = activeTranslationTab;
          const i18nForPreview = editingEntry.i18n?.[previewLocale];
          const previewName =
            (previewLocale === primaryLocale
              ? editingEntry.name
              : i18nForPreview?.name?.toString().trim() || editingEntry.name) ?? "";
          const previewDesc =
            (previewLocale === primaryLocale
              ? editingEntry.desc
              : i18nForPreview?.desc?.toString().trim() || editingEntry.desc) ?? "";
          const previewLabels = editingEntry.labelIds.length
            ? allLabels.filter((l) => editingEntry.labelIds.includes(l.id)).map(l => resolveLabel(l, previewLocale))
            : undefined;
          const view: MenuItemView = {
            name: previewName,
            description: previewDesc,
            price: editingEntry.price,
            priceUnit: editingEntry.priceUnit,
            image: editingEntry.image,
            allergens: editingEntry.allergens,
            outOfStock: editingEntry.outOfStock,
            containsFrozenIngredient: editingEntry.frozen,
            labels: previewLabels,
          };
          return (
            <aside
              className="hidden xl:flex xl:flex-col xl:items-center xl:gap-2"
              style={{
                position: "sticky",
                top: 16,
                width: FRAME_W,
                alignSelf: "flex-start",
              }}
            >
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                  <rect x="7" y="2" width="10" height="20" rx="2" />
                  <line x1="11" y1="18" x2="13" y2="18" />
                </svg>
                {t("entries.preview.title")}
                <span className="ml-1 inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-600 normal-case">
                  {previewLocale.toUpperCase()}
                </span>
              </div>
              <div style={{ width: FRAME_W }}>
                {/* Pixel 7 body — rounded-rect with a centered punch-hole front camera */}
                <div
                  className="relative bg-gray-900 shadow-2xl"
                  style={{
                    padding: BEZEL,
                    borderRadius: 42,
                  }}
                >
                  {/* Side buttons (right edge) */}
                  <span
                    aria-hidden
                    className="absolute bg-gray-700 rounded-l"
                    style={{ right: -2, top: 80, width: 3, height: 36 }}
                  />
                  <span
                    aria-hidden
                    className="absolute bg-gray-700 rounded-l"
                    style={{ right: -2, top: 130, width: 3, height: 60 }}
                  />
                  {/* Screen */}
                  <div
                    className="relative bg-gray-100 overflow-hidden"
                    style={{ borderRadius: 36 }}
                  >
                    {/* Punch-hole front camera */}
                    <span
                      aria-hidden
                      className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black"
                      style={{ top: 12, width: 14, height: 14, zIndex: 5 }}
                    />
                    {/* Status bar */}
                    <div
                      className="flex items-center justify-between px-6 text-[11px] font-medium text-gray-700"
                      style={{ height: 36 }}
                    >
                      <span>9:41</span>
                      <span className="opacity-0">·</span>
                    </div>
                    {/* Scrollable content area */}
                    <div style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
                      <div className="p-3 space-y-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                            {t("entries.preview.cardTitle")}
                          </p>
                          <MenuItemListView item={view} />
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 mt-3">
                            {t("entries.preview.expandedTitle")}
                          </p>
                          <MenuItemDetailView
                            item={view}
                            allergyWarning={getMessage(previewLocale, "allergyWarning")}
                            frozenWarning={getMessage(previewLocale, "frozenProduct")}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 italic text-center">{t("entries.preview.subtitle")}</p>
            </aside>
          );
        })()}
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && !isNewEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-6 h-6 text-red-600"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{t("entries.delete.title")}</h3>
              <p className="text-gray-500 mb-6">
                {(() => {
                  const parts = t("entries.delete.confirm").split("{name}");
                  return parts.map((part, i) => (
                    <span key={i}>
                      {part}
                      {i < parts.length - 1 && <strong>{editingEntry.name}</strong>}
                    </span>
                  ));
                })()}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? t("common.deleting") : t("common.delete")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
