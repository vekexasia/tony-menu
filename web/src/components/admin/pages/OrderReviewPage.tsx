"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError, consumeOrderIntent, fetchOrderIntent } from "@/lib/api";
import type { OrderIntentReviewResponse } from "@menu/schemas";
import { useTranslations } from "@/lib/i18n";

/**
 * Waiter review page (#19): opened by scanning the diner's QR
 * (/admin/order-review/?token=...). Loads the intent, shows lines resolved
 * against the CURRENT menu, and submits through the shared order path.
 */
export default function OrderReviewPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const t = useTranslations("admin");

  const [intent, setIntent] = useState<OrderIntentReviewResponse | null>(null);
  const [loadError, setLoadError] = useState<"notFound" | "generic" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<"expired" | "consumed" | "stale" | "generic" | null>(null);
  const [dailyNumber, setDailyNumber] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoadError(null);
    fetchOrderIntent(token)
      .then(setIntent)
      .catch((err) => setLoadError(err instanceof ApiError && err.status === 404 ? "notFound" : "generic"));
  }, [token]);

  useEffect(load, [load]);

  async function handleSubmit() {
    if (!token || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await consumeOrderIntent(token);
      setDailyNumber(result.dailyNumber);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { error?: string } | undefined;
        if (body?.error === "expired" || body?.error === "consumed") setSubmitError(body.error);
        else setSubmitError("stale");
        // Availability/state may have changed since load — refresh the view.
        load();
      } else {
        setSubmitError("generic");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) return <Message title={t("orderReview.invalidLinkTitle")} text={t("orderReview.invalidLinkText")} />;
  if (loadError === "notFound") return <Message title={t("orderReview.notFoundTitle")} text={t("orderReview.notFoundText")} />;
  if (loadError === "generic") return <Message title={t("orderReview.loadFailedTitle")} text={t("orderReview.loadFailedText")} />;
  if (!intent) return <div className="p-6 text-sm text-gray-500">{t("orderReview.loading")}</div>;

  if (dailyNumber !== null) {
    return (
      <main className="p-6 max-w-2xl">
        <section className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">{t("orderReview.submitted")}</h1>
          <p className="text-5xl font-bold text-primary mt-6" data-testid="order-daily-number">#{dailyNumber}</p>
        </section>
      </main>
    );
  }

  const status = intent.status;
  const hasUnavailable = intent.lines.some((l) => l.unavailable);
  const total = intent.lines.reduce((sum, l) => sum + (l.price ?? 0) * l.quantity, 0);

  return (
    <main className="p-6 max-w-2xl w-full">
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-wide text-primary">{t("orderReview.eyebrow")}</div>
        <h1 className="text-2xl font-bold text-gray-900">{t("orderReview.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("orderReview.subtitle")}</p>
      </div>

      {status === "expired" && (
        <Banner text={t("orderReview.expired")} />
      )}
      {status === "consumed" && (
        <Banner text={t("orderReview.consumed")} />
      )}
      {submitError === "expired" && <Banner text={t("orderReview.expired")} />}
      {submitError === "consumed" && <Banner text={t("orderReview.consumed")} />}
      {submitError === "stale" && <Banner text={t("orderReview.stale")} />}
      {submitError === "generic" && <Banner text={t("orderReview.submitFailed")} />}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="space-y-3">
          {intent.lines.map((line) => (
            <div key={line.entryId} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0">
                {line.quantity}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold ${line.unavailable ? "text-gray-400 line-through" : "text-gray-800"}`}>
                  {line.name ?? line.entryId}
                </p>
                {line.unavailable && <p className="text-xs text-red-500 font-medium">{t("orderReview.unavailable")}</p>}
              </div>
              {line.price !== null && (
                <div className="text-sm font-semibold text-gray-600 flex-shrink-0">
                  {((line.price * line.quantity) / 100).toFixed(2)} &euro;
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-gray-100 mt-4 pt-3 text-sm font-bold text-gray-800">
          <span>{t("orderReview.total")}</span>
          <span>{(total / 100).toFixed(2)} &euro;</span>
        </div>
      </section>

      {status === "pending" && (
        <>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || hasUnavailable}
            className="w-full mt-6 py-3 rounded-full bg-primary text-white font-semibold disabled:opacity-50"
          >
            {submitting ? t("orderReview.submitting") : t("orderReview.submit")}
          </button>
          {hasUnavailable && (
            <p className="mt-2 text-xs text-red-500 text-center font-medium">
              {t("orderReview.removeUnavailable")}
            </p>
          )}
        </>
      )}
    </main>
  );
}

function Banner({ text }: { text: string }) {
  return (
    <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">
      {text}
    </div>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <main className="p-6 max-w-2xl">
      <section className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center" role="alert">
        <h1 className="text-xl font-bold text-red-700">{title}</h1>
        <p className="text-sm text-red-600 mt-2">{text}</p>
      </section>
    </main>
  );
}
