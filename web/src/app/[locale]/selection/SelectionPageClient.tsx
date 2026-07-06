"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { useRestaurantStore } from "@/stores/restaurantStore";
import { LoadingScreen, ErrorScreen } from "@/components/ui/StatusScreen";
import { SelectionContent } from "@/components/menu/SelectionContent";

// Thin page wrapper: loads the restaurant, renders the shared selection UI in
// page chrome. The staff add-order flow deep-links here (/selection?staffSession=…),
// so this route stays a real page. The menu pill opens the same content in a modal.
export function SelectionPageClient() {
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations();
  const { isLoading, error, loadRestaurant } = useRestaurantStore();

  useEffect(() => {
    loadRestaurant();
  }, [loadRestaurant]);

  if (isLoading) {
    return <LoadingScreen as="main" />;
  }

  if (error) {
    return <ErrorScreen as="main" message={error} retryLabel={t("retry")} onRetry={() => loadRestaurant({ force: true })} />;
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <Link href={`/${locale}/menu`} className="inline-flex items-center text-sm text-gray-500 mb-4">
          {t("selection.backToMenu")}
        </Link>
        <SelectionContent />
      </div>
    </main>
  );
}
