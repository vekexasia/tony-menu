"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMe, type MeResponse } from "@/lib/api";
import { useRestaurantStore, useCategories } from "@/stores/restaurantStore";
import { useTranslations } from "@/lib/i18n";
import { AdminLocalePicker } from "./AdminLocalePicker";

interface AuthState {
  loading: boolean;
  user: MeResponse | null;
  isAdmin: boolean;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export default function AdminContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const [authState, setAuthState] = useState<AuthState>({
    loading: true,
    user: null,
    isAdmin: false,
  });
  const { data, loadRestaurant } = useRestaurantStore();
  const categories = useCategories();

  useEffect(() => {
    // Playwright test bypass — inject via page.addInitScript
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
      const bypass = (window as Window & { __playwright_admin__?: { user: { uid: string; email: string; name?: string } } }).__playwright_admin__;
      if (bypass) {
        setAuthState({
          loading: false,
          user: { uid: bypass.user.uid, email: bypass.user.email, name: bypass.user.name, isAdmin: true },
          isAdmin: true,
        });
        return;
      }
    }

    // With Cloudflare Access in front of /admin/*, the user is already
    // authenticated by the time this code runs. We just call /me to find out
    // who they are and whether they're authorised.
    getMe()
      .then((me) => {
        setAuthState({ loading: false, user: me, isAdmin: me.isAdmin === true });
      })
      .catch((error) => {
        console.error("Failed to load /me:", error);
        setAuthState({ loading: false, user: null, isAdmin: false });
      });
  }, []);

  useEffect(() => {
    if (authState.isAdmin) {
      loadRestaurant();
    }
  }, [authState.isAdmin, loadRestaurant]);

  const handleSignOut = () => {
    // Cloudflare Access logout — clears the session cookie and redirects.
    window.location.href = "/cdn-cgi/access/logout";
  };

  if (authState.loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBFAF9", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ color: "#888", fontSize: 13 }}>{t("common.loading")}</div>
      </div>
    );
  }

  if (!authState.user) {
    // Should be unreachable when Access is enabled — Access intercepts before
    // the SPA loads. If we get here, /me returned an error (auth not configured,
    // network problem, etc.).
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBFAF9", fontFamily: "system-ui, sans-serif", padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,.1)", padding: 32, maxWidth: 360, width: "100%", textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#1F1A14", margin: "0 0 8px" }}>{t("layout.invalidSession")}</h1>
          <p style={{ fontSize: 13, color: "#888", margin: "0 0 20px" }}>{t("layout.invalidSessionDesc")}</p>
          <button onClick={handleSignOut} style={{ padding: "8px 20px", background: "#F4F2EE", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 500, color: "#424242", cursor: "pointer" }}>
            {t("layout.reconnect")}
          </button>
        </div>
      </div>
    );
  }

  if (!authState.isAdmin) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBFAF9", fontFamily: "system-ui, sans-serif", padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,.1)", padding: 32, maxWidth: 360, width: "100%", textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <i className="fa-solid fa-ban" style={{ color: "#DC2626", fontSize: 18 }} />
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#1F1A14", margin: "0 0 8px" }}>{t("layout.accessDenied")}</h1>
          <p style={{ fontSize: 13, color: "#888", margin: "0 0 6px" }}>{t("layout.notInAdminEmails")}</p>
          <p style={{ fontSize: 12, color: "#BBB", margin: "0 0 20px", fontFamily: "monospace", wordBreak: "break-all" }}>{authState.user.email}</p>
          <button onClick={handleSignOut} style={{ padding: "8px 20px", background: "#F4F2EE", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 500, color: "#424242", cursor: "pointer" }}>
            {t("common.signOut")}
          </button>
        </div>
      </div>
    );
  }

  // ── Authenticated layout ────────────────────────────────────────
  const restaurantName = data?.name || "Admin";
  const brandInitials = getInitials(restaurantName);
  const userInitials = authState.user.name
    ? getInitials(authState.user.name)
    : (authState.user.email?.[0] || "U").toUpperCase();

  const totalEntries = categories.reduce((s, c) => s + c.entries.length, 0);

  const disabledCodes = (data?.features?.disabledLocales ?? []) as string[];
  const customCodes = ((data?.features?.customLocales ?? []) as { code: string }[]).map((c) => c.code);
  const translationLocales = Array.from(
    new Set(
      [
        "en", "de", "fr", "es", "nl", "ru", "pt",
        ...customCodes,
      ].filter((code) => !disabledCodes.includes(code))
    )
  );
  const entriesWithMissingTranslations = categories.reduce((sum, c) => {
    return sum + c.entries.filter((e) => {
      return translationLocales.some((locale) => {
        const translated = e.i18n?.[locale];
        const missingName = !!e.name?.trim() && !translated?.name?.trim();
        const missingDesc = !!e.description?.trim() && !translated?.desc?.trim();
        return missingName || missingDesc;
      });
    }).length;
  }, 0);
  const completeness =
    totalEntries > 0
      ? Math.round(((totalEntries - entriesWithMissingTranslations) / totalEntries) * 100)
      : 100;

  // pathname is normalized: trailing slashes stripped for comparison.
  const currentPath = (pathname ?? "/admin").replace(/\/+$/, "") || "/admin";

  const topNavItems: { href: string; label: string; matchPrefix?: string }[] = [
    { href: "/admin/categories", label: t("layout.nav.menu") },
    { href: "/admin/analytics", label: t("layout.nav.analytics") },
    { href: "/admin/settings", label: t("layout.nav.settings"), matchPrefix: "/admin/settings" },
  ];

  const firstCategoryId = categories[0]?.id;
  const entriesHref = firstCategoryId
    ? `/admin/items?category=${firstCategoryId}`
    : "/admin/items";

  const gestioneItems: { href: string; icon: string; label: string; count?: number | string }[] = [
    { href: "/admin/menus", icon: "fa-book-open", label: t("layout.section.menus") },
    { href: "/admin/categories", icon: "fa-layer-group", label: t("layout.section.categories"), count: categories.length },
    { href: entriesHref, icon: "fa-utensils", label: t("layout.section.items"), count: totalEntries },
    { href: "/admin/hours", icon: "fa-clock", label: t("layout.section.hours") },
    { href: "/admin/analytics", icon: "fa-chart-simple", label: t("layout.section.analytics") },
  ];

  const settingsItems: { href: string; icon: string; label: string }[] = [
    { href: "/admin/settings/profile", icon: "fa-user", label: t("layout.section.profile") },
    { href: "/admin/settings/languages", icon: "fa-language", label: t("layout.section.languages") },
    { href: "/admin/settings/communications", icon: "fa-bullhorn", label: t("layout.section.announcements") },
    { href: "/admin/settings/chat-ai", icon: "fa-robot", label: t("layout.section.chatAi") },
    { href: "/admin/settings/publishing", icon: "fa-globe", label: t("layout.section.publishing") },
  ];

  const hrefBase = (href: string) => href.split("?")[0].replace(/\/+$/, "") || "/admin";

  // For sidebar: highlight when path matches exactly. The categories link
  // also matches the bare /admin root so the sidebar isn't blank on /admin.
  const isActive = (href: string) => {
    const base = hrefBase(href);
    if (base === "/admin/categories") return currentPath === "/admin" || currentPath === "/admin/categories";
    if (base === "/admin/items") return currentPath === "/admin/items" || currentPath === "/admin/items/edit";
    return currentPath === base;
  };

  const isActiveTab = (item: { href: string; matchPrefix?: string }) => {
    const base = hrefBase(item.href);
    if (base === "/admin/categories") {
      // Top "Menu" tab covers categories, items, items/edit, menus, hours.
      return currentPath === "/admin"
        || currentPath === "/admin/categories"
        || currentPath.startsWith("/admin/items")
        || currentPath === "/admin/menus"
        || currentPath === "/admin/hours";
    }
    if (item.matchPrefix) {
      return currentPath === item.matchPrefix || currentPath.startsWith(`${item.matchPrefix}/`);
    }
    return currentPath === base;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 13, color: "#424242", background: "#FBFAF9" }}>
      <header style={{ height: 52, background: "#1F1A14", display: "flex", alignItems: "center", padding: "0 18px", gap: 20, flexShrink: 0 }}>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 6, background: "var(--adm-accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3, flexShrink: 0 }}>
            {brandInitials}
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.1, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {restaurantName}
            </div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.6)" }}>{t("layout.menuAdmin")}</div>
          </div>
        </div>

        <nav style={{ display: "flex", gap: 2, marginLeft: 16 }}>
          {topNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                background: isActiveTab(item) ? "rgba(255,255,255,.1)" : "transparent",
                border: "none",
                color: isActiveTab(item) ? "#fff" : "rgba(255,255,255,.6)",
                fontSize: 13,
                fontWeight: 500,
                padding: "6px 12px",
                borderRadius: 5,
                cursor: "pointer",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <AdminLocalePicker />
          <div title={authState.user.email || ""} style={{ width: 30, height: 30, borderRadius: "50%", background: "#BBA8E1", color: "#432975", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", cursor: "default" }}>
            {userInitials}
          </div>
          <button
            onClick={handleSignOut}
            style={{ background: "transparent", border: "none", color: "rgba(255,255,255,.5)", fontSize: 11.5, cursor: "pointer", padding: "4px 6px", borderRadius: 4 }}
          >
            {t("common.signOutShort")}
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        <aside className="adm-sidebar" style={{ width: 230, background: "#fff", borderRight: "1px solid #E7E5E4", display: "flex", flexDirection: "column", padding: "14px 0", flexShrink: 0, overflowY: "auto" }}>
          {data?.headerImage && (
            <div style={{ margin: "0 10px 14px", borderRadius: 8, overflow: "hidden", position: "relative", height: 90, flexShrink: 0 }}>
              <img
                src={data.headerImage}
                alt={restaurantName}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,.55) 0%, transparent 60%)" }} />
              <div style={{ position: "absolute", bottom: 6, left: 8, right: 8, fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {restaurantName}
              </div>
            </div>
          )}

          <div style={{ padding: "0 10px", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9A9590", textTransform: "uppercase", letterSpacing: 0.6, padding: "0 6px 6px" }}>{t("layout.manage")}</div>
            {gestioneItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 5,
                  fontSize: 13,
                  textDecoration: "none",
                  fontWeight: isActive(item.href) ? 600 : 400,
                  color: isActive(item.href) ? "var(--adm-accent-deep)" : "#666",
                  background: isActive(item.href) ? "var(--adm-accent-light)" : "transparent",
                  marginBottom: 1,
                }}
              >
                <i className={`fa-solid ${item.icon}`} style={{ width: 14, opacity: isActive(item.href) ? 1 : 0.7, fontSize: 12 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.count != null && (
                  <span style={{ fontSize: 10.5, color: isActive(item.href) ? "var(--adm-accent-deep)" : "#BDB8B2", fontWeight: 600 }}>{item.count}</span>
                )}
              </Link>
            ))}
          </div>

          <div style={{ padding: "0 10px", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9A9590", textTransform: "uppercase", letterSpacing: 0.6, padding: "0 6px 6px" }}>{t("layout.settings")}</div>
            {settingsItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 5,
                  fontSize: 13,
                  textDecoration: "none",
                  fontWeight: isActive(item.href) ? 600 : 400,
                  color: isActive(item.href) ? "var(--adm-accent-deep)" : "#666",
                  background: isActive(item.href) ? "var(--adm-accent-light)" : "transparent",
                  marginBottom: 1,
                }}
              >
                <i className={`fa-solid ${item.icon}`} style={{ width: 14, opacity: isActive(item.href) ? 1 : 0.7, fontSize: 12 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
              </Link>
            ))}
          </div>

          <div style={{ marginTop: "auto", padding: "0 10px" }}>
            <div style={{ background: "#FBFAF9", border: "1px solid #E7E5E4", borderRadius: 6, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#424242" }}>{t("layout.completeness")}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#1F8E5A" }}>{completeness}%</span>
              </div>
              <div style={{ height: 4, background: "#E7E5E4", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "#1F8E5A", borderRadius: 2, width: `${completeness}%` }} />
              </div>
              <div style={{ fontSize: 10.5, color: "#888", marginTop: 6 }}>
                {entriesWithMissingTranslations === 0
                  ? t("layout.allItemsTranslated")
                  : (entriesWithMissingTranslations === 1
                      ? t("layout.itemsMissingTranslations").replace("{count}", String(entriesWithMissingTranslations))
                      : t("layout.itemsMissingTranslationsPlural").replace("{count}", String(entriesWithMissingTranslations)))}
              </div>
            </div>
          </div>
        </aside>

        <div style={{ flex: 1, display: "flex", minWidth: 0, overflow: "hidden" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
