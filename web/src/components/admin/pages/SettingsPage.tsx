"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { updateRestaurantSettings, setMenuPublished, fetchRestaurantSettings, downloadMenuExport, fetchLabels, createLabel, updateLabel, deleteLabel, type AdminLabel } from "@/lib/api";
import { PALETTES, type PaletteKey, DEFAULT_PALETTE, applyPalette } from "@/lib/palettes";
import { LABEL_COLOR_STYLES, resolveLabel } from "@/lib/label-colors";
import { uploadHeaderImage, uploadPromotionalImage, uploadLocaleFlag } from "@/lib/imageUpload";
import { deleteLocaleFlag } from "@/lib/api";
import { TranslationTabs } from "@/components/admin/TranslationTabs";
import { Flag } from "@/components/ui/Flag";
import { useRestaurantStore } from "@/stores/restaurantStore";
import { locales } from "@/lib/i18n-config";
import { useTranslations } from "@/lib/i18n";
import { useAdminLocale } from "@/app/admin/AdminI18nProvider";

// ── Design tokens (mirrors admin.css) ────────────────────────────
const T = {
  dark: "#1F1A14",
  accent: "var(--adm-accent)",
  accentDeep: "var(--adm-accent-deep)",
  accentLight: "var(--adm-accent-light)",
  surface: "#FBFAF9",
  border: "#E7E5E4",
  ok: "#1F8E5A",
  okBg: "#E6F4EC",
  off: "#9A9590",
  offBg: "#F0EEEA",
  muted: "#888",
  text: "#424242",
  danger: "#DC2626",
  dangerBg: "#FEE2E2",
  warn: "#92400E",
  warnBg: "#FEF3C7",
  warnBorder: "#FDE68A",
} as const;

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  padding: "0 12px",
  fontSize: 13,
  background: "#fff",
  color: T.text,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  padding: "8px 12px",
  fontSize: 13,
  background: "#fff",
  color: T.text,
  fontFamily: "inherit",
  resize: "vertical",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "#666",
  marginBottom: 4,
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.off, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {title}
        </span>
      </div>
      <div style={{ padding: 16 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        background: on ? "#2563EB" : T.border,
        cursor: "pointer",
        transition: "background .2s",
        flexShrink: 0,
        padding: 0,
      }}
    >
      <span style={{
        position: "absolute",
        left: on ? 22 : 2,
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,.2)",
        transition: "left .2s",
      }} />
    </button>
  );
}

export type SettingsSection = "profile" | "languages" | "communications" | "chat-ai" | "publishing";

export default function SettingsPage({ section }: { section?: SettingsSection } = {}) {
  const t = useTranslations("admin");
  const { locale: adminLocale } = useAdminLocale();
  const SECTION_TITLES: Record<SettingsSection, string> = {
    profile: t("settings.section.profile"),
    languages: t("settings.section.languages"),
    communications: t("settings.section.communications"),
    "chat-ai": t("settings.section.chatAi"),
    publishing: t("settings.section.publishing"),
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [published, setPublished] = useState<boolean | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ── Labels state ──────────────────────────────────────────────────
  const [labelsList, setLabelsList] = useState<AdminLabel[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<AdminLabel['color']>('primary');
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [translatingLabel, setTranslatingLabel] = useState<AdminLabel | null>(null);
  const [translatingLabelName, setTranslatingLabelName] = useState("");
  const [translatingLabelColor, setTranslatingLabelColor] = useState<AdminLabel['color']>('primary');
  const [translatingLabelI18n, setTranslatingLabelI18n] = useState<Record<string, Record<string, string>>>({});
  const [translatingLabelTab, setTranslatingLabelTab] = useState<string>("it");

  const [name, setName] = useState("");
  const [payoff, setPayoff] = useState("");
  const [headerImage, setHeaderImage] = useState("");

  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [region, setRegion] = useState("");

  const [menuNoticeEnabled, setMenuNoticeEnabled] = useState(true);
  const [menuNoticeText, setMenuNoticeText] = useState("* Avvisa sempre il personale di allergie e/o intolleranze alimentari.\n\n* Alcune pietanze potrebbero contenere ingredienti surgelati/congelati secondo la stagionalità del prodotto e le esigenze del mercato");
  const [menuNoticeI18n, setMenuNoticeI18n] = useState<Record<string, Record<string, string>>>({});
  const [menuNoticeTab, setMenuNoticeTab] = useState<string>("it");

  const [promoTitle, setPromoTitle] = useState("");
  const [promoContent, setPromoContent] = useState("");
  const [promoUrl, setPromoUrl] = useState("");
  const [promoTillDate, setPromoTillDate] = useState("");

  const [facebook, setFacebook] = useState("");
  const [instagram, setInstagram] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [chatAgentPrompt, setChatAgentPrompt] = useState("");
  const [aiChatEnabled, setAiChatEnabled] = useState(false);

  const { data: restaurantStoreData, loadRestaurant } = useRestaurantStore();
  const primaryLocale = restaurantStoreData?.features?.primaryLocale ?? "it";
  const [primaryLocaleDraft, setPrimaryLocaleDraft] = useState<string>("it");
  const STANDARD_NON_PRIMARY = locales.filter((l) => l !== primaryLocale && l !== "vec") as string[];
  const [enabledLocales, setEnabledLocales] = useState<string[]>(STANDARD_NON_PRIMARY);
  const [disabledLocales, setDisabledLocales] = useState<string[]>([]);
  const [customLocales, setCustomLocales] = useState<{ code: string; name: string; flagUrl?: string | null }[]>([]);
  const [newLocaleCode, setNewLocaleCode] = useState("");
  const [newLocaleName, setNewLocaleName] = useState("");
  const [editingLocale, setEditingLocale] = useState<{ code: string; name: string; flagUrl?: string | null } | null>(null);
  const [uploadingFlagFor, setUploadingFlagFor] = useState<string | null>(null);
  const flagInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [palette, setPalette] = useState<PaletteKey>(DEFAULT_PALETTE);

  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [uploadingPromo, setUploadingPromo] = useState(false);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const promoInputRef = useRef<HTMLInputElement>(null);

  // Populate form fields from the store (public catalog data)
  useEffect(() => {
    if (!restaurantStoreData) return;
    setName(restaurantStoreData.name || "");
    setPayoff(restaurantStoreData.payoff || "");
    setHeaderImage(restaurantStoreData.headerImage || "");
    setPhone(restaurantStoreData.info?.phone || "");
    setAddressLine1(restaurantStoreData.info?.addressLine1 || "");
    setCity(restaurantStoreData.info?.city || "");
    setZip(restaurantStoreData.info?.zip || "");
    setRegion(restaurantStoreData.info?.region || "");
    setMenuNoticeEnabled(restaurantStoreData.info?.menuNotice?.enabled !== false);
    if (restaurantStoreData.info?.menuNotice?.text) setMenuNoticeText(restaurantStoreData.info.menuNotice.text);
    setMenuNoticeI18n((restaurantStoreData.info?.menuNotice?.i18n as Record<string, Record<string, string>>) || {});
    setFacebook(restaurantStoreData.socials?.facebook || "");
    setInstagram(restaurantStoreData.socials?.instagram || "");
    setWhatsapp(restaurantStoreData.socials?.whatsapp || "");
    if (restaurantStoreData.theme?.palette) setPalette(restaurantStoreData.theme.palette as PaletteKey);
    if (restaurantStoreData.features?.primaryLocale) {
      setPrimaryLocaleDraft(restaurantStoreData.features.primaryLocale);
      setMenuNoticeTab((current) => current === "it" ? restaurantStoreData.features!.primaryLocale! : current);
    }
    if (restaurantStoreData.features?.enabledLocales != null) {
      setEnabledLocales(restaurantStoreData.features.enabledLocales);
    }
    if (restaurantStoreData.features?.disabledLocales != null) {
      setDisabledLocales(restaurantStoreData.features.disabledLocales);
    }
    if (restaurantStoreData.features?.customLocales != null) {
      setCustomLocales(restaurantStoreData.features.customLocales);
    }
  }, [restaurantStoreData]);

  // Load private settings (chatAgentPrompt, aiChatEnabled, promotionAlert) from admin API
  useEffect(() => {
    async function loadPrivateSettings() {
      try {
        const settings = await fetchRestaurantSettings();
        setChatAgentPrompt(settings.chatAgentPrompt || "");
        setAiChatEnabled(settings.aiChatEnabled ?? false);
        setPublished(settings.publicationState === "published");
        if (settings.primaryLocale) setPrimaryLocaleDraft(settings.primaryLocale);
        if (settings.enabledLocales != null) setEnabledLocales(settings.enabledLocales);
        if (settings.disabledLocales) setDisabledLocales(settings.disabledLocales);
        if (settings.customLocales) setCustomLocales(settings.customLocales);
        const promo = settings.promotionAlert as Record<string, string> | null;
        if (promo) {
          setPromoTitle(promo.title || "");
          setPromoContent(promo.content || "");
          setPromoUrl(promo.url || "");
          if (promo.tillDate) {
            const date = new Date(promo.tillDate);
            setPromoTillDate(date.toISOString().split("T")[0]);
          }
        }
        setLoading(false);
      } catch (err) {
        console.error("Error loading settings:", err);
        setError(t("settings.loadFailed"));
        setLoading(false);
      }
    }

    async function loadLabels() {
      setLabelsLoading(true);
      try {
        const res = await fetchLabels();
        setLabelsList(res.labels);
      } catch { /* non-blocking */ }
      finally { setLabelsLoading(false); }
    }

    loadPrivateSettings();
    loadLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      let tillDateISO = "";
      if (promoTillDate) {
        const date = new Date(promoTillDate);
        date.setHours(23, 59, 59, 999);
        tillDateISO = date.toISOString();
      }

      const payload = {
        name,
        payoff,
        theme: { palette },
        info: {
          phone,
          addressLine1,
          city,
          zip,
          region,
          headerImage,
          menuNotice: {
            enabled: menuNoticeEnabled,
            text: menuNoticeText,
            i18n: menuNoticeI18n,
          },
        },
        promotionAlert: { title: promoTitle, content: promoContent, url: promoUrl, tillDate: tillDateISO },
        socials: { facebook, instagram, whatsapp },
        chatAgentPrompt,
        aiChatEnabled,
        primaryLocale: primaryLocaleDraft,
        enabledLocales,
        disabledLocales,
        customLocales,
      };

      await updateRestaurantSettings(payload);
      await loadRestaurant({ force: true });

      setSuccess(t("settings.saved"));
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Error saving:", err);
      setError(t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleHeaderImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHeader(true);
    setError(null);
    try {
      const imageUrl = await uploadHeaderImage(file);
      setHeaderImage(imageUrl);
      await loadRestaurant({ force: true });
      setSuccess(t("settings.headerImageUpdated"));
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError(t("settings.imageUploadFailed"));
    } finally {
      setUploadingHeader(false);
      if (headerInputRef.current) headerInputRef.current.value = "";
    }
  };

  const handlePromoImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPromo(true);
    setError(null);
    try {
      const imageUrl = await uploadPromotionalImage(file);
      setPromoUrl(`${imageUrl}?t=${Date.now()}`);
      setSuccess(t("settings.promoImageUpdated"));
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError(t("settings.imageUploadFailed"));
    } finally {
      setUploadingPromo(false);
      if (promoInputRef.current) promoInputRef.current.value = "";
    }
  };

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return;
    setCreatingLabel(true);
    try {
      const res = await createLabel({ name: newLabelName.trim(), color: newLabelColor });
      const created: AdminLabel = { id: res.id, name: newLabelName.trim(), color: newLabelColor, sortOrder: labelsList.length, i18n: null };
      setLabelsList((prev) => [...prev, created]);
      setNewLabelName('');
      setNewLabelColor('primary');
    } catch { setError(t('labels.saveFailed')); }
    finally { setCreatingLabel(false); }
  };

  const openLabelModal = (label: AdminLabel, tab: string) => {
    const raw = (label.i18n as Record<string, Record<string, string>>) ?? {};
    const { [primaryLocale]: _omit, ...rest } = raw;
    setTranslatingLabel(label);
    setTranslatingLabelName(label.name);
    setTranslatingLabelColor(label.color);
    setTranslatingLabelI18n(rest);
    setTranslatingLabelTab(tab);
  };

  const handleSaveTranslations = async () => {
    if (!translatingLabel) return;
    try {
      const { [primaryLocale]: _omit, ...i18nToSave } = translatingLabelI18n;
      await updateLabel(translatingLabel.id, { name: translatingLabelName.trim(), color: translatingLabelColor, i18n: i18nToSave });
      setLabelsList((prev) => prev.map((l) => l.id === translatingLabel.id ? { ...l, name: translatingLabelName.trim(), color: translatingLabelColor, i18n: i18nToSave } : l));
      setTranslatingLabel(null);
    } catch { setError(t('labels.saveFailed')); }
  };

  const handleDeleteLabel = async (id: string) => {
    if (!confirm(t('labels.deleteConfirm'))) return;
    try {
      await deleteLabel(id);
      setLabelsList((prev) => prev.filter((l) => l.id !== id));
    } catch { setError(t('labels.saveFailed')); }
  };

  const handlePublishToggle = async () => {
    setPublishing(true);
    setError(null);
    try {
      const next = !published;
      await setMenuPublished(next);
      setPublished(next);
      setSuccess(next ? t("settings.menuPublished") : t("settings.menuHidden"));
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError(t("settings.publishFailed"));
    } finally {
      setPublishing(false);
    }
  };

  const show = (s: SettingsSection) => !section || section === s;

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: T.off, fontSize: 13 }}>{t("settings.loading")}</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0, overflow: "hidden" }}>
      <main className="adm-scroll" style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "20px 24px" }}>

        {/* Page header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.accentDeep, textTransform: "uppercase", letterSpacing: 0.6, display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <span>{t("settings.breadcrumb")}</span>
            {section && (
              <>
                <span style={{ opacity: 0.4 }}>›</span>
                <span style={{ color: T.muted }}>{SECTION_TITLES[section]}</span>
              </>
            )}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.dark, margin: 0 }}>
            {section ? SECTION_TITLES[section] : t("settings.title")}
          </h1>
        </div>

        {/* Mobile section chips — sidebar is hidden on narrow viewports */}
        <nav className="adm-settings-chips" style={{ display: "none", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {(["profile", "languages", "communications", "chat-ai", "publishing"] as const).map((s) => {
            const active = section === s;
            return (
              <Link
                key={s}
                href={`/admin?s=settings-${s}`}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 14,
                  border: `1px solid ${active ? T.dark : T.border}`,
                  background: active ? T.dark : "#fff",
                  color: active ? "#fff" : T.text,
                  textDecoration: "none",
                }}
              >
                {SECTION_TITLES[s]}
              </Link>
            );
          })}
        </nav>

        {/* Toast messages */}
        {success && (
          <div style={{ background: T.okBg, border: `1px solid #BBF7D0`, borderRadius: 6, padding: "10px 14px", color: T.ok, fontSize: 13, marginBottom: 16 }}>
            {success}
          </div>
        )}
        {error && (
          <div style={{ background: T.dangerBg, border: "1px solid #FECACA", borderRadius: 6, padding: "10px 14px", color: T.danger, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ maxWidth: section ? 720 : 1200 }}>

          {/* ── 2-column grid (single column when a sub-section is selected, or on narrow viewports) ── */}
          <div className={section ? undefined : "adm-settings-grid"} style={section ? { display: "block" } : { display: "grid", gap: 16, alignItems: "start" }}>

            {/* ── LEFT column ── */}
            <div>
              {show("profile") && <>
              {/* ── Informazioni Base ── */}
              <Card title={t("settings.cards.basicInfo")}>
                <Field label={t("settings.field.restaurantName")}>
                  <input className="adm-input" style={inputStyle} type="text" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label={t("settings.field.payoff")}>
                  <input className="adm-input" style={inputStyle} type="text" value={payoff} onChange={(e) => setPayoff(e.target.value)} placeholder={t("settings.field.payoffPlaceholder")} />
                </Field>
              </Card>

              {/* ── Immagine Header ── */}
              <Card title={t("settings.cards.headerImage")}>
                {headerImage ? (
                  <div style={{ position: "relative", width: "100%", aspectRatio: "16/7", borderRadius: 6, overflow: "hidden", background: T.border }}>
                    <Image src={headerImage} alt="Header" fill style={{ objectFit: "cover" }} unoptimized />
                    <button
                      type="button"
                      onClick={() => headerInputRef.current?.click()}
                      disabled={uploadingHeader}
                      style={{ position: "absolute", bottom: 8, right: 8, background: "#fff", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,.2)" }}
                      title={t("settings.headerImage.changeImage")}
                    >
                      <i className="fa-solid fa-pen" style={{ fontSize: 12, color: T.text }} />
                    </button>
                    {uploadingHeader && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ color: "#fff", fontSize: 13 }}>{t("settings.headerImage.uploading")}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => headerInputRef.current?.click()}
                    disabled={uploadingHeader}
                    style={{ width: "100%", aspectRatio: "16/7", borderRadius: 6, border: `2px dashed ${T.border}`, background: T.surface, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", color: T.off, fontSize: 13 }}
                  >
                    <i className="fa-solid fa-image" style={{ fontSize: 24, opacity: 0.4 }} />
                    <span>{uploadingHeader ? t("settings.headerImage.uploading") : t("settings.headerImage.uploadCta")}</span>
                  </button>
                )}
                <input ref={headerInputRef} type="file" accept="image/*" onChange={handleHeaderImageChange} style={{ display: "none" }} />
              </Card>

              {/* ── Palette ── */}
              <Card title={t("settings.cards.palette")}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {(Object.entries(PALETTES) as [PaletteKey, (typeof PALETTES)[PaletteKey]][]).map(([key, p]) => {
                    const active = palette === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setPalette(key);
                          applyPalette(key);
                        }}
                        title={p.label}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 5,
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        <span style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          background: p.primary,
                          display: "block",
                          boxShadow: active
                            ? `0 0 0 2px #fff, 0 0 0 4px ${p.primary}`
                            : "0 1px 3px rgba(0,0,0,.15)",
                          transition: "box-shadow .15s",
                        }} />
                        <span style={{ fontSize: 10, color: active ? T.dark : T.off, fontWeight: active ? 700 : 400 }}>
                          {p.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>

              {/* ── Etichette ── */}
              <Card title={t("labels.title")}>
                <p style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>{t("labels.subtitle")}</p>

                {/* Create form */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {(Object.keys(LABEL_COLOR_STYLES) as Array<keyof typeof LABEL_COLOR_STYLES>).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewLabelColor(c)}
                        title={c}
                        style={{
                          width: 22, height: 22, borderRadius: "50%",
                          border: newLabelColor === c ? `2px solid ${T.dark}` : `2px solid transparent`,
                          background: LABEL_COLOR_STYLES[c].background,
                          cursor: "pointer",
                          boxShadow: newLabelColor === c ? `0 0 0 1px ${T.dark}` : "none",
                          padding: 0, outline: "none", flexShrink: 0,
                        }}
                      />
                    ))}
                  </div>
                  <input
                    className="adm-input"
                    style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateLabel(); }}
                    placeholder={t("labels.namePlaceholder")}
                    maxLength={50}
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateLabel()}
                    disabled={creatingLabel || !newLabelName.trim()}
                    style={{ padding: "0 14px", height: 36, background: T.accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, opacity: creatingLabel || !newLabelName.trim() ? 0.5 : 1 }}
                  >
                    {t("labels.newLabel")}
                  </button>
                </div>

                {/* List */}
                {labelsLoading ? (
                  <p style={{ fontSize: 12, color: T.muted }}>{t("settings.loading")}</p>
                ) : labelsList.length === 0 ? (
                  <p style={{ fontSize: 12, color: T.muted }}>{t("labels.noLabels")}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {labelsList.map((label) => {
                      const cs = LABEL_COLOR_STYLES[label.color] ?? LABEL_COLOR_STYLES.primary;
                      const displayName = resolveLabel(label as import('@/lib/types').MenuLabel, adminLocale).name;
                      return (
                        <div key={label.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 12, background: cs.background, color: cs.color, flexShrink: 0 }}>
                            {displayName}
                          </span>
                          <button type="button" onClick={() => openLabelModal(label, adminLocale)} style={{ fontSize: 11, color: T.accentDeep, background: "none", border: "none", cursor: "pointer", padding: 0 }} title={t("labels.translateTitle")}>
                            <i className="fa-solid fa-pen" />
                          </button>
                          <button type="button" onClick={() => void handleDeleteLabel(label.id)} style={{ fontSize: 11, color: T.danger, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                            <i className="fa-solid fa-trash" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* ── Contatti e Indirizzo ── */}
              <Card title={t("settings.cards.contactAddress")}>
                <Field label={t("settings.field.phone")}>
                  <input className="adm-input" style={inputStyle} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 0421 123456" />
                </Field>
                <Field label={t("settings.field.address")}>
                  <input className="adm-input" style={inputStyle} type="text" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Via Roma, 1" />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 10, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>{t("settings.field.city")}</label>
                    <input className="adm-input" style={inputStyle} type="text" value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>{t("settings.field.zip")}</label>
                    <input className="adm-input" style={inputStyle} type="text" value={zip} onChange={(e) => setZip(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>{t("settings.field.region")}</label>
                    <input className="adm-input" style={inputStyle} type="text" value={region} onChange={(e) => setRegion(e.target.value)} />
                  </div>
                </div>
              </Card>

              </>}

              {show("communications") && <>
              {/* ── Avviso Menu ── */}
              <Card title={t("settings.cards.menuNotice")}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, padding: "10px 12px", background: T.surface, borderRadius: 6, border: `1px solid ${T.border}` }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: T.dark, margin: 0 }}>{t("settings.menuNotice.showInitialPopup")}</p>
                    <p style={{ fontSize: 11, color: T.off, margin: "2px 0 0" }}>{t("settings.menuNotice.popupDesc")}</p>
                  </div>
                  <Toggle on={menuNoticeEnabled} onChange={() => setMenuNoticeEnabled((v) => !v)} />
                </div>
                <TranslationTabs
                  activeTab={menuNoticeTab}
                  onTabChange={setMenuNoticeTab}
                  primaryLocale={primaryLocale}
                  fields={[{ key: "text", label: t("settings.menuNotice.fieldText"), multiline: true, sourceValue: menuNoticeText }]}
                  i18n={menuNoticeI18n}
                  onI18nChange={setMenuNoticeI18n}
                  enabledLocales={enabledLocales}
                  disabledLocales={disabledLocales}
                  customLocales={customLocales}
                >
                  <Field label={t("settings.menuNotice.primaryText")}>
                    <textarea
                      className="adm-textarea"
                      style={{ ...textareaStyle, minHeight: 120 }}
                      value={menuNoticeText}
                      onChange={(e) => setMenuNoticeText(e.target.value)}
                      rows={6}
                      placeholder={t("settings.menuNotice.placeholder")}
                    />
                  </Field>
                </TranslationTabs>
              </Card>

              </>}

              {show("profile") && <>
              {/* ── Social Media ── */}
              <Card title={t("settings.cards.socialMedia")}>
                <Field label={t("settings.field.facebookUrl")}>
                  <input className="adm-input" style={inputStyle} type="url" value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="https://facebook.com/..." />
                </Field>
                <Field label={t("settings.field.instagramUrl")}>
                  <input className="adm-input" style={inputStyle} type="url" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="https://instagram.com/..." />
                </Field>
                <Field label={t("settings.field.whatsapp")}>
                  <input className="adm-input" style={inputStyle} type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="393331234567" />
                </Field>
              </Card>
              </>}
            </div>

            {/* ── RIGHT column ── */}
            <div>
              {show("communications") && <>
              {/* ── Promozione / Alert ── */}
              <Card title={t("settings.cards.promotion")}>
                <p style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>
                  {t("settings.promo.intro")}
                </p>
                <Field label={t("settings.promo.titleField")}>
                  <input className="adm-input" style={inputStyle} type="text" value={promoTitle} onChange={(e) => setPromoTitle(e.target.value)} placeholder={t("settings.promo.titlePlaceholder")} />
                </Field>
                <Field label={t("settings.promo.contentField")}>
                  <textarea className="adm-textarea" style={{ ...textareaStyle, minHeight: 72 }} value={promoContent} onChange={(e) => setPromoContent(e.target.value)} rows={3} placeholder={t("settings.promo.contentPlaceholder")} />
                </Field>
                <Field label={t("settings.promo.expiryField")}>
                  <input className="adm-input" style={inputStyle} type="date" value={promoTillDate} onChange={(e) => setPromoTillDate(e.target.value)} />
                  <p style={{ fontSize: 11, color: T.off, marginTop: 4 }}>{t("settings.promo.expiryHint")}</p>
                </Field>
                <div>
                  <label style={labelStyle}>{t("settings.promo.imageLabel")}</label>
                  {promoUrl ? (
                    <div style={{ position: "relative", width: "100%", aspectRatio: "16/7", borderRadius: 6, overflow: "hidden", background: T.border }}>
                      <Image src={promoUrl} alt="Promo" fill style={{ objectFit: "cover" }} unoptimized />
                      <button
                        type="button"
                        onClick={() => promoInputRef.current?.click()}
                        disabled={uploadingPromo}
                        style={{ position: "absolute", bottom: 8, right: 8, background: "#fff", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,.2)" }}
                      >
                        <i className="fa-solid fa-pen" style={{ fontSize: 12, color: T.text }} />
                      </button>
                      {uploadingPromo && (
                        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ color: "#fff", fontSize: 13 }}>{t("settings.headerImage.uploading")}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => promoInputRef.current?.click()}
                      disabled={uploadingPromo}
                      style={{ width: "100%", aspectRatio: "16/7", borderRadius: 6, border: `2px dashed ${T.border}`, background: T.surface, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", color: T.off, fontSize: 13 }}
                    >
                      <i className="fa-solid fa-image" style={{ fontSize: 24, opacity: 0.4 }} />
                      <span>{uploadingPromo ? t("settings.headerImage.uploading") : t("settings.headerImage.uploadCta")}</span>
                    </button>
                  )}
                  <input ref={promoInputRef} type="file" accept="image/*" onChange={handlePromoImageChange} style={{ display: "none" }} />
                </div>
              </Card>

              </>}

              {show("languages") && (
              /* ── Lingue ── */
              <Card title={t("settings.cards.languages")}>
                <p style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>
                  {t("settings.languages.intro")}
                </p>

                {/* Primary locale picker */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "10px 12px", marginBottom: 14, background: T.surface, borderRadius: 6, border: `1px solid ${T.border}` }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: T.dark, margin: 0 }}>{t("settings.languages.primaryLabel")}</p>
                    <p style={{ fontSize: 11, color: T.off, margin: "2px 0 0" }}>{t("settings.languages.primaryDesc")}</p>
                  </div>
                  <select
                    value={primaryLocaleDraft}
                    onChange={(e) => setPrimaryLocaleDraft(e.target.value)}
                    className="adm-input"
                    style={{ height: 32, borderRadius: 6, border: `1px solid ${T.border}`, padding: "0 8px", fontSize: 13, background: "#fff", flexShrink: 0 }}
                  >
                    {(["it", "en", "de", "fr", "es", "nl", "ru", "pt"] as const).map((code) => {
                      const label: Record<string, string> = { it: "Italiano", en: "English", de: "Deutsch", fr: "Français", es: "Español", nl: "Nederlands", ru: "Русский", pt: "Português" };
                      return <option key={code} value={code}>{label[code]}</option>;
                    })}
                    {customLocales.map((cl) => (
                      <option key={cl.code} value={cl.code}>{cl.name}</option>
                    ))}
                  </select>
                </div>

                {/* Standard locales */}
                <p style={{ fontSize: 10, fontWeight: 700, color: T.off, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{t("settings.languages.standard")}</p>
                {STANDARD_NON_PRIMARY.map((locale: string) => {
                  const LABEL: Record<string, string> = { it: "Italiano", en: "English", de: "Deutsch", fr: "Français", es: "Español", nl: "Nederlands", ru: "Русский", pt: "Português" };
                  const CODE: Record<string, string> = { it: "IT", en: "EN", de: "DE", fr: "FR", es: "ES", nl: "NL", ru: "RU", pt: "PT" };
                  const state: "off" | "hidden" | "live" = disabledLocales.includes(locale) ? "off" : enabledLocales.includes(locale) ? "live" : "hidden";
                  const setState = (s: "off" | "hidden" | "live") => {
                    setEnabledLocales((prev) => s === "live" ? [...prev.filter((l) => l !== locale), locale] : prev.filter((l) => l !== locale));
                    setDisabledLocales((prev) => s === "off" ? [...prev.filter((l) => l !== locale), locale] : prev.filter((l) => l !== locale));
                  };
                  return (
                    <div key={locale} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Flag code={locale} label={LABEL[locale]} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.off, background: T.offBg, borderRadius: 4, padding: "1px 5px" }}>{CODE[locale]}</span>
                        <span style={{ fontSize: 13, color: T.text }}>{LABEL[locale]}</span>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {(["off", "hidden", "live"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setState(s)}
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "3px 10px",
                              borderRadius: 4,
                              border: "none",
                              cursor: "pointer",
                              fontFamily: "inherit",
                              background: state === s ? (s === "live" ? "#16A34A" : s === "hidden" ? "#F59E0B" : "#DC2626") : "#F3F4F6",
                              color: state === s ? "#fff" : "#6B7280",
                            }}
                          >
                            {s === "off" ? t("settings.languages.state.off") : s === "hidden" ? t("settings.languages.state.hidden") : t("settings.languages.state.live")}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Custom locales */}
                <p style={{ fontSize: 10, fontWeight: 700, color: T.off, textTransform: "uppercase", letterSpacing: 0.5, margin: "16px 0 6px" }}>{t("settings.languages.custom")}</p>
                {customLocales.length === 0 && (
                  <p style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>{t("settings.languages.noCustom")}</p>
                )}
                {customLocales.map((cl) => {
                  const state: "off" | "hidden" | "live" = disabledLocales.includes(cl.code) ? "off" : enabledLocales.includes(cl.code) ? "live" : "hidden";
                  const setState = (s: "off" | "hidden" | "live") => {
                    setEnabledLocales((prev) => s === "live" ? [...prev.filter((l) => l !== cl.code), cl.code] : prev.filter((l) => l !== cl.code));
                    setDisabledLocales((prev) => s === "off" ? [...prev.filter((l) => l !== cl.code), cl.code] : prev.filter((l) => l !== cl.code));
                  };
                  const isEditing = editingLocale?.code === cl.code;
                  const flagInputId = `flag-input-${cl.code}`;
                  const onFlagSelected = async (file: File) => {
                    setUploadingFlagFor(cl.code);
                    try {
                      const url = await uploadLocaleFlag(cl.code, file);
                      setCustomLocales((prev) => prev.map((l) => l.code === cl.code ? { ...l, flagUrl: url } : l));
                    } finally {
                      setUploadingFlagFor(null);
                    }
                  };
                  const onFlagRemove = async () => {
                    setUploadingFlagFor(cl.code);
                    try {
                      await deleteLocaleFlag(cl.code);
                      setCustomLocales((prev) => prev.map((l) => l.code === cl.code ? { ...l, flagUrl: null } : l));
                    } finally {
                      setUploadingFlagFor(null);
                    }
                  };
                  return (
                    <div key={cl.code} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Flag code={cl.code} customUrl={cl.flagUrl ?? null} label={cl.name} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.accentDeep, background: T.accentLight, borderRadius: 4, padding: "1px 5px" }}>{cl.code.toUpperCase()}</span>
                          <span style={{ fontSize: 13, color: T.text }}>{cl.name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <input
                            ref={(el) => { flagInputRefs.current[cl.code] = el; }}
                            id={flagInputId}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            style={{ display: "none" }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void onFlagSelected(file);
                              e.target.value = "";
                            }}
                          />
                          <button
                            type="button"
                            disabled={uploadingFlagFor === cl.code}
                            onClick={() => flagInputRefs.current[cl.code]?.click()}
                            style={{ fontSize: 11, color: T.accentDeep, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", opacity: uploadingFlagFor === cl.code ? 0.5 : 1 }}
                          >
                            {uploadingFlagFor === cl.code ? t("settings.languages.uploading") : (cl.flagUrl ? t("settings.languages.changeFlag") : t("settings.languages.uploadFlag"))}
                          </button>
                          {cl.flagUrl && (
                            <button
                              type="button"
                              disabled={uploadingFlagFor === cl.code}
                              onClick={onFlagRemove}
                              style={{ fontSize: 11, color: T.danger, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                            >
                              {t("settings.languages.removeFlag")}
                            </button>
                          )}
                          <button type="button" onClick={() => setEditingLocale(isEditing ? null : { ...cl })} style={{ fontSize: 11, color: T.accentDeep, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                            {isEditing ? t("settings.languages.cancelButton") : t("settings.languages.editButton")}
                          </button>
                          <button type="button" onClick={() => {
                            setCustomLocales(customLocales.filter((l) => l.code !== cl.code));
                            setEnabledLocales(enabledLocales.filter((l) => l !== cl.code));
                            setDisabledLocales(disabledLocales.filter((l) => l !== cl.code));
                          }} style={{ fontSize: 11, color: T.danger, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                            {t("settings.languages.removeButton")}
                          </button>
                          <div style={{ display: "flex", gap: 4 }}>
                            {(["off", "hidden", "live"] as const).map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setState(s)}
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: "3px 10px",
                                  borderRadius: 4,
                                  border: "none",
                                  cursor: "pointer",
                                  fontFamily: "inherit",
                                  background: state === s ? (s === "live" ? "#16A34A" : s === "hidden" ? "#F59E0B" : "#DC2626") : "#F3F4F6",
                                  color: state === s ? "#fff" : "#6B7280",
                                }}
                              >
                                {s === "off" ? t("settings.languages.state.off") : s === "hidden" ? t("settings.languages.state.hidden") : t("settings.languages.state.live")}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {isEditing && editingLocale && (
                        <div style={{ paddingBottom: 10, display: "flex", gap: 8 }}>
                          <input
                            className="adm-input"
                            style={{ ...inputStyle, width: 80, flexShrink: 0, textTransform: "uppercase" }}
                            value={editingLocale.code}
                            onChange={(e) => setEditingLocale({ ...editingLocale, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                            placeholder="vec"
                            maxLength={10}
                          />
                          <input
                            className="adm-input"
                            style={{ ...inputStyle, flex: 1 }}
                            value={editingLocale.name}
                            onChange={(e) => setEditingLocale({ ...editingLocale, name: e.target.value })}
                            placeholder="Veneto"
                            maxLength={50}
                          />
                          <button type="button" onClick={() => {
                            if (!editingLocale.code || !editingLocale.name) return;
                            setCustomLocales(customLocales.map((l) => l.code === cl.code ? editingLocale : l));
                            setEnabledLocales(enabledLocales.map((l) => l === cl.code ? editingLocale.code : l));
                            setDisabledLocales(disabledLocales.map((l) => l === cl.code ? editingLocale.code : l));
                            setEditingLocale(null);
                          }} style={{ padding: "0 12px", height: 36, background: T.accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                            {t("settings.languages.saveButton")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add new custom locale */}
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <input
                    className="adm-input"
                    style={{ ...inputStyle, width: 80, flexShrink: 0 }}
                    value={newLocaleCode}
                    onChange={(e) => setNewLocaleCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="vec"
                    maxLength={10}
                  />
                  <input
                    className="adm-input"
                    style={{ ...inputStyle, flex: 1 }}
                    value={newLocaleName}
                    onChange={(e) => setNewLocaleName(e.target.value)}
                    placeholder="Veneto"
                    maxLength={50}
                  />
                  <button type="button" onClick={() => {
                    const code = newLocaleCode.trim();
                    const name = newLocaleName.trim();
                    if (!code || !name) return;
                    if (customLocales.some((l) => l.code === code)) return;
                    setCustomLocales([...customLocales, { code, name }]);
                    setNewLocaleCode("");
                    setNewLocaleName("");
                  }} disabled={!newLocaleCode.trim() || !newLocaleName.trim()} style={{ padding: "0 12px", height: 36, background: T.accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, opacity: !newLocaleCode.trim() || !newLocaleName.trim() ? 0.5 : 1 }}>
                    {t("settings.languages.addButton")}
                  </button>
                </div>
              </Card>

              )}

              {show("chat-ai") && (
              /* ── Chat Agent ── */
              <Card title={t("settings.cards.chatAgent")}>
                <p style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>
                  {t("settings.chat.intro")}
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, padding: "10px 12px", background: T.surface, borderRadius: 6, border: `1px solid ${T.border}` }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: T.dark, margin: 0 }}>{t("settings.chat.enable")}</p>
                    <p style={{ fontSize: 11, color: T.off, margin: "2px 0 0" }}>{t("settings.chat.enableDesc")}</p>
                  </div>
                  <Toggle on={aiChatEnabled} onChange={() => setAiChatEnabled((v) => !v)} />
                </div>
                <Field label={t("settings.chat.promptLabel")}>
                  <textarea
                    className="adm-textarea"
                    style={{ ...textareaStyle, minHeight: 120 }}
                    value={chatAgentPrompt}
                    onChange={(e) => setChatAgentPrompt(e.target.value)}
                    rows={6}
                    placeholder={t("settings.chat.promptPlaceholder")}
                  />
                  <p style={{ fontSize: 11, color: T.off, marginTop: 4 }}>
                    {t("settings.chat.promptHint")}
                  </p>
                </Field>
              </Card>

              )}

              {show("publishing") && <>
              {/* ── Visibilità Menu ── */}
              <Card title={t("settings.cards.menuVisibility")}>
                {published === false && (
                  <div style={{ background: T.warnBg, border: `1px solid ${T.warnBorder}`, borderRadius: 6, padding: "10px 14px", color: T.warn, fontSize: 12, marginBottom: 14 }}>
                    {t("settings.publishing.notPublicWarning")}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: T.dark, margin: 0 }}>
                      {published ? t("settings.publishing.menuPublic") : t("settings.publishing.menuNotPublic")}
                    </p>
                    <p style={{ fontSize: 11, color: T.off, margin: "2px 0 0" }}>
                      {published ? t("settings.publishing.publicDesc") : t("settings.publishing.notPublicDesc")}
                    </p>
                  </div>
                  <button
                    onClick={handlePublishToggle}
                    disabled={publishing}
                    style={{ padding: "7px 14px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: published ? T.offBg : T.accent, color: published ? T.text : "#fff", opacity: publishing ? 0.5 : 1 }}
                  >
                    {publishing ? t("settings.publishing.working") : published ? t("settings.publishing.hideMenu") : t("settings.publishing.publishMenu")}
                  </button>
                </div>
              </Card>

              <Card title={t("settings.cards.export")}>
                <p style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>{t("settings.export.description")}</p>
                <button
                  onClick={async () => {
                    setExporting(true);
                    try { await downloadMenuExport(); } finally { setExporting(false); }
                  }}
                  disabled={exporting}
                  style={{ padding: "7px 14px", borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: "#fff", color: T.dark, opacity: exporting ? 0.5 : 1 }}
                >
                  {exporting ? t("settings.export.downloading") : t("settings.export.button")}
                </button>
              </Card>

              </>}
            </div>

          </div>{/* end 2-col grid */}

          {/* ── Save (full width) ── */}
          <div style={{ position: "sticky", bottom: 16, marginTop: 16 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: "100%",
                height: 42,
                borderRadius: 8,
                border: "none",
                background: T.accent,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 2px 8px rgba(196,122,79,.35)",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? t("settings.savingAll") : t("settings.saveAll")}
            </button>
          </div>

        </div>
      </main>

      {/* ── Label translations modal ── */}
      {translatingLabel && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setTranslatingLabel(null); }}
        >
          <div style={{ background: "#fff", borderRadius: 10, width: "100%", maxWidth: 560, boxShadow: "0 8px 32px rgba(0,0,0,.2)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.dark }}>{t("labels.translateTitle")}</span>
              <button type="button" onClick={() => setTranslatingLabel(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: T.off, lineHeight: 1 }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                {(Object.keys(LABEL_COLOR_STYLES) as Array<keyof typeof LABEL_COLOR_STYLES>).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setTranslatingLabelColor(c)}
                    style={{
                      width: 22, height: 22, borderRadius: "50%",
                      border: translatingLabelColor === c ? `2px solid ${T.dark}` : `2px solid transparent`,
                      background: LABEL_COLOR_STYLES[c].background,
                      cursor: "pointer",
                      boxShadow: translatingLabelColor === c ? `0 0 0 1px ${T.dark}` : "none",
                      padding: 0, outline: "none", flexShrink: 0,
                    }}
                  />
                ))}
              </div>
              <TranslationTabs
                activeTab={translatingLabelTab}
                onTabChange={setTranslatingLabelTab}
                primaryLocale={primaryLocale}
                fields={[{ key: "name", label: t("labels.nameLabel"), sourceValue: translatingLabelName }]}
                i18n={translatingLabelI18n}
                onI18nChange={setTranslatingLabelI18n}
                enabledLocales={enabledLocales}
                disabledLocales={disabledLocales}
                customLocales={customLocales}
              >
                <div>
                  <label style={{ fontSize: 12, color: T.muted, display: "block", marginBottom: 4 }}>{t("labels.nameLabel")} ({primaryLocale.toUpperCase()})</label>
                  <input
                    className="adm-input"
                    style={{ ...inputStyle, width: "100%" }}
                    value={translatingLabelName}
                    onChange={(e) => setTranslatingLabelName(e.target.value)}
                    maxLength={50}
                  />
                </div>
              </TranslationTabs>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 16px", borderTop: `1px solid ${T.border}`, background: T.surface }}>
              <button type="button" onClick={() => setTranslatingLabel(null)} style={{ padding: "0 14px", height: 34, background: T.offBg, color: T.text, border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                {t("common.cancel")}
              </button>
              <button type="button" onClick={() => void handleSaveTranslations()} style={{ padding: "0 14px", height: 34, background: T.accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

