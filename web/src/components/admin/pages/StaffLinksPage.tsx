"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { fetchStaffLinks, createStaffLink, revokeStaffLink, type StaffLinkSummary } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";

/** Admin staff-links page (#15): create named links (link/QR shown once), list, revoke. */
export default function StaffLinksPage() {
  const t = useTranslations("admin");
  const [links, setLinks] = useState<StaffLinkSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  // The freshly-created link's URL — shown once, never retrievable again.
  const [created, setCreated] = useState<{ name: string; url: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchStaffLinks();
      setLinks(res.links);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const res = await createStaffLink({ name: trimmed });
      const url = `${window.location.origin}/staff?token=${res.token}`;
      setCreated({ name: trimmed, url });
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (link: StaffLinkSummary) => {
    if (!window.confirm(t("staffLinks.revokeConfirm"))) return;
    try {
      await revokeStaffLink(link.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const fmtDate = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : "—");

  const statusLabel = (link: StaffLinkSummary) => {
    if (link.revokedAt) return t("staffLinks.statusRevoked");
    if (link.consumedAt) return t("staffLinks.statusActive");
    return t("staffLinks.statusUnused");
  };

  return (
    <main className="p-6 max-w-3xl" style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
      <h1 className="text-2xl font-bold text-gray-900">{t("staffLinks.title")}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-4">{t("staffLinks.subtitle")}</p>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm mb-6">
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); }}
            placeholder={t("staffLinks.namePlaceholder")}
            className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm"
          />
          <button onClick={create} disabled={!name.trim() || creating} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50">
            {t("staffLinks.create")}
          </button>
        </div>

        {created && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4" data-testid="created-link">
            <p className="text-sm font-semibold text-green-800">{t("staffLinks.createdFor").replace("{name}", created.name)}</p>
            <p className="text-xs text-green-700 mt-1">{t("staffLinks.showOnce")}</p>
            <div className="flex justify-center my-4"><QRCodeSVG value={created.url} size={180} marginSize={2} /></div>
            <input readOnly value={created.url} className="w-full h-9 rounded-lg border border-green-200 bg-white px-3 text-xs font-mono" onFocus={(e) => e.currentTarget.select()} />
          </div>
        )}
      </section>

      {links === null ? (
        <p className="text-sm text-gray-500">{t("common.loading")}</p>
      ) : links.length === 0 ? (
        <p className="text-sm text-gray-400 italic">{t("staffLinks.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900">{link.name}</div>
                <div className="text-xs text-gray-400">
                  {t("staffLinks.created")}: {fmtDate(link.createdAt)} · {t("staffLinks.lastSeen")}: {fmtDate(link.lastSeenAt)}
                </div>
              </div>
              <span className="text-xs font-semibold text-gray-600">{statusLabel(link)}</span>
              {!link.revokedAt && (
                <button onClick={() => revoke(link)} className="text-xs text-red-500 hover:text-red-700 font-semibold">
                  {t("staffLinks.revoke")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
