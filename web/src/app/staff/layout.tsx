import { Suspense } from "react";
import { I18nProvider } from "@/lib/i18n";
import { defaultLocale } from "@/lib/i18n-config";

/**
 * Staff (waiter mode, #15) area. Diner-device facing, no /admin. Uses the public
 * default locale — waiters and diners share the deployment's primary language.
 */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale={defaultLocale}>
      <Suspense fallback={<div className="min-h-screen bg-gray-100" />}>
        {children}
      </Suspense>
    </I18nProvider>
  );
}
