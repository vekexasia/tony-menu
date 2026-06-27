"use client";

import { useEffect } from "react";
import { useTranslations } from "@/lib/i18n";
import Link from "next/link";
import { useRestaurantStore } from "@/stores/restaurantStore";
import { LoadingScreen, ErrorScreen } from "@/components/ui/StatusScreen";
import type { TimeSlot } from "@/lib/types";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export default function InfoPage() {
  const t = useTranslations();
  const { data, isLoading, error, loadRestaurant } = useRestaurantStore();

  useEffect(() => {
    loadRestaurant();
  }, [loadRestaurant]);

  if (isLoading) return <LoadingScreen as="main" />;
  if (error) return <ErrorScreen as="main" message={error} retryLabel={t("retry")} onRetry={() => loadRestaurant({ force: true })} />;
  if (!data) return null;

  const { info, socials, openingSchedule, messages } = data;
  const todayIndex = (new Date().getDay() + 6) % 7;

  const formatTimeSlots = (slots: TimeSlot[] | undefined): string => {
    if (!slots || slots.length === 0) return t("closed");
    return slots.map((slot) => `${slot.start} - ${slot.end}`).join(", ");
  };

  const mapHref = info?.latlong
    ? `https://www.google.com/maps/place/${info.latlong.latitude},${info.latlong.longitude}/@${info.latlong.latitude},${info.latlong.longitude},14z`
    : undefined;

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="bg-primary text-white p-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold">{t("restaurantInfo")}</h1>
        </div>
      </header>

      <div className="p-4 space-y-6">
        {/* Restaurant intro (only when configured) */}
        {messages?.intro && (
          <section className="bg-white rounded-lg p-4 shadow-sm">
            <h2 className="text-lg font-bold text-primary mb-3">{t("restaurant")}</h2>
            <p className="text-gray-600 leading-relaxed">{messages.intro}</p>
          </section>
        )}

        {/* Location */}
        {info && (info.addressLine1 || info.city) && (
          <section className="bg-white rounded-lg p-4 shadow-sm">
            <h2 className="text-lg font-bold text-primary mb-3">{t("location")}</h2>
            {info.addressLine1 && <p className="text-gray-600">{info.addressLine1}</p>}
            {info.city && (
              <p className="text-gray-600">
                {info.zip ? `${info.zip} ` : ""}
                {info.city}
                {info.region ? ` (${info.region})` : ""}
              </p>
            )}
            {mapHref && (
              <a
                href={mapHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-primary font-medium"
              >
                {t("seeMap")}
              </a>
            )}
          </section>
        )}

        {/* Contacts */}
        {(info?.phone || socials?.whatsapp) && (
          <section className="bg-white rounded-lg p-4 shadow-sm">
            <h2 className="text-lg font-bold text-primary mb-3">{t("contacts")}</h2>
            {info?.phone && (
              <a href={`tel:${info.phone}`} className="text-primary font-medium flex items-center gap-2">
                {t("call")}
              </a>
            )}
            {info?.phone && <p className="mt-2 text-gray-600">T: {info.phone}</p>}
          </section>
        )}

        {/* Opening hours */}
        {openingSchedule && (
          <section className="bg-white rounded-lg p-4 shadow-sm">
            <h2 className="text-lg font-bold text-primary mb-3">{t("openingHours")}</h2>
            <div className="space-y-2 text-gray-600">
              {DAYS.map((day, index) => (
                <div
                  key={day}
                  className={`flex justify-between ${index === todayIndex ? "font-bold" : ""}`}
                >
                  <span>{t(day)}</span>
                  <span>{formatTimeSlots(openingSchedule.schedule?.[index])}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
