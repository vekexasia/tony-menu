"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { checkStaffSession, consumeStaffLink, getStaffSession, setStaffSession, clearStaffSession } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";

type GateState = "loading" | "ok" | "denied";

/**
 * Guards staff-only UI (#15). On mount:
 *  - ?token=XYZ → exchange it for a session, store it, clean the URL;
 *  - otherwise validate the stored session.
 * Without a valid session it renders the "ask the operator" screen. Children
 * render only once a session is confirmed.
 */
export function StaffGate({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const t = useTranslations("staff");
  const [state, setState] = useState<GateState>("loading");

  useEffect(() => {
    let cancelled = false;
    const token = searchParams.get("token");

    async function run() {
      if (token) {
        try {
          const res = await consumeStaffLink(token);
          setStaffSession(res.sessionToken);
          // Clean the one-use token out of the URL so a reload can't re-consume.
          window.history.replaceState(null, "", window.location.pathname);
          if (!cancelled) setState("ok");
          return;
        } catch {
          // Fall through to session check — a reload after a successful consume
          // hits this path (token already gone from URL on reload anyway).
        }
      }

      if (!getStaffSession()) {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        await checkStaffSession();
        if (!cancelled) setState("ok");
      } catch {
        clearStaffSession();
        if (!cancelled) setState("denied");
      }
    }

    run();
    return () => { cancelled = true; };
  }, [searchParams]);

  if (state === "loading") {
    return <div className="min-h-screen bg-gray-100 flex items-center justify-center text-sm text-gray-500">{t("loading")}</div>;
  }

  if (state === "denied") {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <section className="bg-white rounded-2xl shadow-sm p-8 text-center max-w-sm w-full" role="alert" data-testid="staff-denied">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4 text-xl font-bold">!</div>
          <h1 className="text-xl font-bold text-gray-900">{t("gate.title")}</h1>
          <p className="text-sm text-gray-500 mt-2">{t("gate.text")}</p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
