"use client";

import { useEffect, useState } from "react";
import { updateOpeningHours } from "@/lib/api";
import { useRestaurantStore } from "@/stores/restaurantStore";
import type { TimeSlot } from "@/lib/types";
import { useTranslations } from "@/lib/i18n";

const DAY_KEYS = [
  { key: 0, label: "monday" },
  { key: 1, label: "tuesday" },
  { key: 2, label: "wednesday" },
  { key: 3, label: "thursday" },
  { key: 4, label: "friday" },
  { key: 5, label: "saturday" },
  { key: 6, label: "sunday" },
] as const;

export default function HoursPage() {
  const t = useTranslations("admin");
  const [schedule, setSchedule] = useState<TimeSlot[][]>(
    Array(7).fill(null).map(() => [])
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data: storeData } = useRestaurantStore();

  // Load hours from the restaurant store (populated from D1 catalog)
  useEffect(() => {
    if (!storeData) return;
    const storedSchedule = storeData.openingSchedule?.schedule;
    if (storedSchedule) {
      setSchedule(storedSchedule.map((day) => day.map((slot) => ({ start: slot.start, end: slot.end }))));
    }
    setLoading(false);
  }, [storeData]);

  const updateSlot = (dayIndex: number, slotIndex: number, field: "start" | "end", value: string) => {
    setSchedule((prev) => {
      const newSchedule = [...prev];
      const daySlots = [...newSchedule[dayIndex]];
      daySlots[slotIndex] = { ...daySlots[slotIndex], [field]: value };
      newSchedule[dayIndex] = daySlots;
      return newSchedule;
    });
  };

  const addSlot = (dayIndex: number) => {
    setSchedule((prev) => {
      const newSchedule = [...prev];
      newSchedule[dayIndex] = [
        ...newSchedule[dayIndex],
        { start: "12:00", end: "14:00" },
      ];
      return newSchedule;
    });
  };

  const removeSlot = (dayIndex: number, slotIndex: number) => {
    setSchedule((prev) => {
      const newSchedule = [...prev];
      newSchedule[dayIndex] = newSchedule[dayIndex].filter((_, i) => i !== slotIndex);
      return newSchedule;
    });
  };

  const saveChanges = async () => {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const existing = storeData?.openingSchedule;
      await updateOpeningHours({
        open: existing?.open ?? true,
        bookable: existing?.bookable,
        minWaitSlot: existing?.minWaitSlot ?? 0,
        slotDuration: existing?.slotDuration ?? 15,
        maxDaysLookAhead: existing?.maxDaysLookAhead ?? 12,
        schedule,
      });

      setSuccessMessage(t("hours.savedSuccess"));
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Error saving hours:", err);
      setError(t("hours.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#9A9590", fontSize: 13 }}>{t("hours.loading")}</div>
      </div>
    );
  }

  return (
    <div className="adm-scroll" style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "20px 24px" }}>

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--adm-accent-deep)", textTransform: "uppercase", letterSpacing: 0.6, display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
          <span>{t("hours.breadcrumbMenu")}</span>
          <span style={{ opacity: 0.4 }}>›</span>
          <span style={{ color: "#888" }}>{t("hours.breadcrumbHours")}</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1F1A14", margin: 0 }}>
          {t("hours.title")}
        </h1>
      </div>

      {/* Error message */}
      {error && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 6, padding: "10px 14px", color: "#DC2626", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Success message */}
      {successMessage && (
        <div style={{ background: "#E6F4EC", border: "1px solid #BBF7D0", borderRadius: 6, padding: "10px 14px", color: "#1F8E5A", fontSize: 13, marginBottom: 16 }}>
          {successMessage}
        </div>
      )}

      {/* Days schedule */}
      <div className="bg-white rounded-lg shadow-sm divide-y">
        {DAY_KEYS.map((day) => {
          const daySlots = schedule[day.key] || [];
          const isClosed = daySlots.length === 0;

          return (
            <div key={day.key} className="p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-gray-900">{t(`hours.weekday.${day.label}`)}</span>
                {isClosed ? (
                  <span className="text-sm text-red-500 font-medium">{t("hours.dayClosed")}</span>
                ) : (
                  <span className="text-sm text-green-600 font-medium">{t("hours.dayOpen")}</span>
                )}
              </div>

              {/* Time slots */}
              <div className="space-y-2">
                {daySlots.map((slot, slotIndex) => (
                  <div key={slotIndex} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={slot.start}
                      onChange={(e) => updateSlot(day.key, slotIndex, "start", e.target.value)}
                      className="px-2 py-1 border rounded text-sm"
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="time"
                      value={slot.end}
                      onChange={(e) => updateSlot(day.key, slotIndex, "end", e.target.value)}
                      className="px-2 py-1 border rounded text-sm"
                    />
                    <button
                      onClick={() => removeSlot(day.key, slotIndex)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                      title={t("hours.removeSlot")}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-5 h-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}

                {/* Add slot button */}
                <button
                  onClick={() => addSlot(day.key)}
                  className="flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-4 h-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                  {t("hours.addSlot")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Save button */}
      <button
        onClick={saveChanges}
        disabled={saving}
        className="w-full py-3 bg-primary text-white rounded-lg font-medium disabled:opacity-50"
      >
        {saving ? t("common.saving") : t("common.saveChanges")}
      </button>
    </div>
  );
}
