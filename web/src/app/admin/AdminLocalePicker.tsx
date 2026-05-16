"use client";

import { Flag } from "@/components/ui/Flag";
import { useTranslations } from "@/lib/i18n";
import { type Locale } from "@/lib/i18n-config";
import { useAdminLocale } from "./AdminI18nProvider";

const PICKER_LOCALES: { code: Locale; label: string }[] = [
  { code: "it", label: "Italiano" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "nl", label: "Nederlands" },
  { code: "ru", label: "Русский" },
  { code: "pt", label: "Português" },
  { code: "hu", label: "Magyar" },
  { code: "vec", label: "Vèneto" },
];

export function AdminLocalePicker() {
  const { locale, setLocale } = useAdminLocale();
  const t = useTranslations("admin");

  return (
    <label
      title={t("layout.adminLanguage")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "rgba(255,255,255,.08)",
        borderRadius: 5,
        padding: "3px 8px",
        cursor: "pointer",
      }}
    >
      <Flag code={locale} decorative />
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label={t("layout.adminLanguage")}
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,.85)",
          fontSize: 12,
          fontWeight: 500,
          fontFamily: "inherit",
          cursor: "pointer",
          appearance: "none",
          paddingRight: 14,
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path fill='rgba(255,255,255,.6)' d='M1 3l4 4 4-4z'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right center",
        }}
      >
        {PICKER_LOCALES.map((l) => (
          <option key={l.code} value={l.code} style={{ color: "#1F1A14" }}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
