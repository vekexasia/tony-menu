import { StaffGate } from "@/components/staff/StaffGate";
import { I18nProvider } from "@/lib/i18n";
import { defaultLocale } from "@/lib/i18n-config";
import { Suspense } from "react";
import OrderReviewPage from "@/components/staff/OrderReviewPage";

/**
 * Waiter intent review (#15), moved from /admin/order-review to a top-level
 * route with no /admin leak. Staff-gated: a diner opening their own QR without a
 * staff session sees the "ask the personnel" screen and cannot self-submit.
 */
export default function OrderReviewRoute() {
  return (
    <I18nProvider locale={defaultLocale}>
      <Suspense fallback={<div className="min-h-screen bg-gray-100" />}>
        <StaffGate>
          <OrderReviewPage />
        </StaffGate>
      </Suspense>
    </I18nProvider>
  );
}
