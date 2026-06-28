"use client";

import { Suspense, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useRestaurantStore } from "@/stores/restaurantStore";
import { RestaurantInfoModal } from "@/components/menu/RestaurantInfoModal";
import { PromotionPopup } from "@/components/menu/PromotionPopup";
import { MenuIcon } from "@/components/menu/MenuIcon";
import { LanguagePicker } from "@/components/ui/LanguagePicker";
import { LoadingScreen, ErrorScreen } from "@/components/ui/StatusScreen";
import { getLocalizedContentValue } from "@/lib/content-presentation";

export default function HomePage() {
  const t = useTranslations();
  const params = useParams();
  const locale = params.locale as string;
  const { data, isLoading, error, loadRestaurant } = useRestaurantStore();
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showPromo, setShowPromo] = useState(false);

  useEffect(() => {
    loadRestaurant();
  }, [loadRestaurant]);

  // Show promotion popup once per session when valid
  useEffect(() => {
    if (!data?.promotion) return;
    const promo = data.promotion;

    // Check tillDate — skip if expired
    if (promo.tillDate) {
      const till = new Date(promo.tillDate);
      if (Date.now() > till.getTime()) return;
    }

    // Only show once per session
    if (sessionStorage.getItem('promo_seen')) return;

    setShowPromo(true);
  }, [data?.promotion]);

  const handlePromoClose = () => {
    setShowPromo(false);
    sessionStorage.setItem('promo_seen', '1');
  };

  // Get current opening hours
  const getOpeningHours = () => {
    if (!data?.openingSchedule?.schedule) return null;
    const today = new Date().getDay();
    // Convert JS day (0=Sunday) to schedule index (0=Monday)
    const dayIndex = today === 0 ? 6 : today - 1;
    const todaySchedule = data.openingSchedule.schedule[dayIndex];
    if (!todaySchedule || todaySchedule.length === 0) return null;
    return todaySchedule.map((slot) => `${slot.start} - ${slot.end}`).join("  ");
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (error) {
    return <ErrorScreen message={error} retryLabel={t("retry")} onRetry={() => loadRestaurant()} />;
  }

  if (!data) return null;

  const openingHours = getOpeningHours();
  const publishedMenus = (data.menus ?? []).filter((m) => m.published);

  return (
    <main className="min-h-screen bg-gray-100 pb-24">
      {/* Header with image */}
      <header className="relative" data-locale-anchor="home:header">
        {data.headerImage && (
          <div className="relative h-32 md:h-48 w-full">
            <Image
              src={data.headerImage}
              alt={data.name}
              fill
              className="object-cover"
              priority
            />
          </div>
        )}

        {/* Restaurant info card */}
        <div className="relative -mt-20 mx-4">
          <div className="bg-white rounded-xl shadow-lg p-6 text-center">
            <h1
              className="text-2xl md:text-3xl font-bold text-primary tracking-wider italic"
              style={{ fontFamily: data.theme?.font || "inherit" }}
            >
              {data.name?.toUpperCase()}
            </h1>

            {/* Opening hours */}
            {openingHours && (
              <p className="text-sm text-gray-600 mt-2">{openingHours}</p>
            )}

            {/* Icons row */}
            <div className="flex justify-center gap-6 mt-4 text-gray-400">
              {data.info?.latlong && (
                <a
                  href={`https://maps.google.com/?q=${data.info.latlong.latitude},${data.info.latlong.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:text-primary transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                </a>
              )}
              <button onClick={() => setShowInfoModal(true)} className="p-2 hover:text-primary transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
              </button>
              {data.info?.phone && (
                <a href={`tel:${data.info.phone}`} className="p-2 hover:text-primary transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                </a>
              )}
              <button onClick={() => setShowInfoModal(true)} className="p-2 hover:text-primary transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>

            {/* More infos link */}
            <button onClick={() => setShowInfoModal(true)} className="text-sm text-gray-400 mt-3 block w-full text-center hover:text-primary">
              {t("moreInfos")}
            </button>
          </div>
        </div>
      </header>

      {/* Menu selection cards — one per published menu, drag-orderable in admin. */}
      <div className="px-4 py-8">
        {publishedMenus.length === 0 ? (
          <p className="text-center text-gray-500 text-sm">No menus available</p>
        ) : (
          <div
            className={`grid gap-4 max-w-2xl mx-auto ${
              publishedMenus.length === 1 ? "grid-cols-1" : "grid-cols-2"
            }`}
          >
            {publishedMenus.map((menu) => {
              const title = getLocalizedContentValue(menu, "title", locale);
              return (
                <Link
                  key={menu.id}
                  href={`/${locale}/menu?type=${menu.code}`}
                  data-locale-anchor={`home:menu-${menu.code}`}
                  className="bg-white rounded-2xl shadow-lg p-6 flex flex-col items-center justify-center aspect-square hover:shadow-xl transition-shadow"
                >
                  <div className="w-24 h-24 mb-4 flex items-center justify-center text-primary/70">
                    <MenuIcon kind={menu.icon} />
                  </div>
                  <span className="text-lg font-semibold text-gray-800 uppercase tracking-wide text-center">
                    <span className="block">{title}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Restaurant Info Modal */}
      <RestaurantInfoModal
        restaurant={data}
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
      />

      {/* Promotion popup */}
      {data.promotion && (
        <PromotionPopup
          promotion={data.promotion}
          open={showPromo}
          onClose={handlePromoClose}
        />
      )}

      <Suspense><LanguagePicker /></Suspense>
    </main>
  );
}
