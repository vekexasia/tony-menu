"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { getAnalytics, type AnalyticsResponse, type ViewedItemRanked, type MenuViewBreakdown } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { MenuIcon, type MenuIconKind } from "@/components/menu/MenuIcon";

type Period = "24h" | "7d" | "30d" | "all";

const PERIOD_KEYS: Period[] = ["24h", "7d", "30d", "all"];

function MovementBadge({ status, delta }: { status: ViewedItemRanked['status']; delta: number | null }) {
  const t = useTranslations("admin");
  if (status === 'new') {
    return <span className="text-xs text-[#cc9166] font-medium ml-1">{t("analytics.movement.new")}</span>;
  }
  if (status === 'up') {
    return <span className="text-xs font-medium ml-1" style={{ color: 'var(--adm-ok)' }}>&uarr;{delta}</span>;
  }
  if (status === 'down') {
    return <span className="text-xs text-red-500 font-medium ml-1">&darr;{Math.abs(delta!)}</span>;
  }
  return <span className="text-xs text-gray-400 ml-1">=</span>;
}

function DailyTrendChart({ data }: { data: { date: string; viewCount: number }[] }) {
  const t = useTranslations("admin");
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.viewCount), 1);
  const total = data.reduce((s, d) => s + d.viewCount, 0);
  const W = 100;
  const H = 32;
  const barWidth = W / data.length;
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-500">{t("analytics.trendTitle").replace("{days}", String(data.length))}</span>
        <span className="text-xs text-gray-400">{t("analytics.trendTotalViews").replace("{count}", String(total))}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-12 block">
        {data.map((d, i) => {
          const h = (d.viewCount / max) * (H - 4);
          const x = i * barWidth + barWidth * 0.1;
          const y = H - h;
          return (
            <rect
              key={d.date}
              x={x}
              y={y}
              width={barWidth * 0.8}
              height={Math.max(h, 0.5)}
              fill="#cc9166"
              rx={0.4}
            >
              <title>{t("analytics.barTooltip").replace("{date}", d.date).replace("{count}", String(d.viewCount))}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>{data[0].date.slice(5)}</span>
        <span>{data[data.length - 1].date.slice(5)}</span>
      </div>
    </div>
  );
}

function ViewedItemThumbnail({ item }: { item: ViewedItemRanked }) {
  if (!item.image) {
    return (
      <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-lg flex-shrink-0">
        🍽️
      </div>
    );
  }

  return (
    <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
      <Image
        src={item.image}
        alt={item.name}
        fill
        className="object-cover"
        sizes="48px"
        unoptimized
      />
    </div>
  );
}

function MenuBreakdown({ items }: { items: MenuViewBreakdown[] }) {
  const t = useTranslations("admin");
  if (items.length === 0) {
    return <p className="text-sm text-gray-400">{t("analytics.noMenuData")}</p>;
  }
  const max = Math.max(...items.map((i) => i.viewCount), 1);
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.menuId} className="flex items-center gap-2">
          <MenuIcon kind={(item.icon ?? "utensils") as MenuIconKind} className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="text-sm text-gray-700 w-24 truncate flex-shrink-0">{item.menuTitle}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-0">
            <div
              className="bg-[#cc9166] h-2 rounded-full"
              style={{ width: `${(item.viewCount / max) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 flex-shrink-0">
            {t("analytics.viewCount").replace("{count}", String(item.viewCount))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function HourlyChart({ data }: { data: { hour: number; viewCount: number }[] }) {
  const t = useTranslations("admin");
  const hasData = data.some((d) => d.viewCount > 0);
  if (!hasData) {
    return <p className="text-sm text-gray-400">{t("analytics.noHourlyData")}</p>;
  }
  const max = Math.max(...data.map((d) => d.viewCount), 1);
  const W = 100;
  const H = 32;
  const barWidth = W / 24;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-12 block">
        {data.map((d) => {
          const h = (d.viewCount / max) * (H - 4);
          const x = d.hour * barWidth + barWidth * 0.1;
          const y = H - h;
          return (
            <rect
              key={d.hour}
              x={x}
              y={y}
              width={barWidth * 0.8}
              height={Math.max(h, 0.5)}
              fill="#cc9166"
              rx={0.4}
            >
              <title>
                {t("analytics.hourlyBarTooltip")
                  .replace("{hour}", String(d.hour).padStart(2, "0"))
                  .replace("{count}", String(d.viewCount))}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const t = useTranslations("admin");
  const [period, setPeriod] = useState<Period>("7d");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [heroLoading, setHeroLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(10);

  const load = useCallback(
    async (p: Period, lim: number, isInitial = false) => {
      if (isInitial) {
        setLoading(true);
      } else {
        setHeroLoading(true);
      }
      setError(null);
      try {
        const result = await getAnalytics(p, lim);
        setData(result);
      } catch {
        if (isInitial) {
          setError("loadError");
        } else {
          // Silent retry once, then show inline error
          try {
            const retry = await getAnalytics(p, lim);
            setData(retry);
          } catch {
            setError("loadError");
          }
        }
      } finally {
        setLoading(false);
        setHeroLoading(false);
      }
    },
    [],
  );

  const isFirstLoad = useRef(true);

  useEffect(() => {
    load(period, limit, isFirstLoad.current);
    isFirstLoad.current = false;
  }, [load, period, limit]);

  const handlePeriodChange = (p: Period) => {
    if (p !== period) {
      setPeriod(p);
      setLimit(10);
    }
  };

  const itemEditorHref = (item: ViewedItemRanked) =>
    item.entryId && item.categoryId
      ? `/admin?s=entries&category=${item.categoryId}&entry=${item.entryId}&entryName=${encodeURIComponent(item.name)}`
      : null;

  // ── Loading skeleton ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {/* Hero skeleton */}
        <div className="flex gap-4">
          <div className="flex-1 bg-white rounded-lg shadow p-4">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-3 animate-pulse" />
            <div className="h-8 bg-gray-200 rounded w-1/2 animate-pulse" />
          </div>
          <div className="flex-1 bg-white rounded-lg shadow p-4">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-3 animate-pulse" />
            <div className="h-8 bg-gray-200 rounded w-1/2 animate-pulse" />
          </div>
        </div>
        <div className="text-sm text-gray-400 text-center">{t("analytics.loading")}</div>
      </div>
    );
  }

  // ── Error (initial load only) ─────────────────────────────────────
  if (error && !data) {
    return (
      <div className="p-4">
        <div className="bg-white rounded-lg shadow p-4 text-center text-gray-500">
          {t("analytics.loadError")}
          <div className="mt-2">
            <button
              onClick={() => load(period, limit, true)}
              className="text-sm text-[#b07040] hover:underline"
            >
              {t("common.retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4" style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
      {/* DATE RANGE SELECTOR */}
      <div className="flex gap-1" role="group" aria-label={t("analytics.periodAria")}>
        {PERIOD_KEYS.map((p) => (
          <button
            key={p}
            onClick={() => handlePeriodChange(p)}
            className={`flex-1 py-3 text-sm font-medium rounded-lg min-h-[44px] transition-colors ${
              period === p
                ? "bg-[#cc9166] text-white"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
            aria-pressed={period === p}
          >
            {t(`analytics.period.${p}`)}
          </button>
        ))}
      </div>

      {/* Error inline (after period change) */}
      {error && data && (
        <div className="text-sm text-red-500 text-center">
          {t("analytics.loadError")}{" "}
          <button
            onClick={() => load(period, limit, false)}
            className="underline"
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {/* PIATTI PIÙ VISTI */}
      <div
        className="bg-white rounded-lg shadow p-4"
        role="region"
        aria-label={t("analytics.mostViewedAria")}
      >
        <p className="text-sm font-semibold text-gray-900 mb-3">{t("analytics.mostViewed")}</p>
        {data?.dailyTotals && data.dailyTotals.length > 0 && (
          <DailyTrendChart data={data.dailyTotals} />
        )}
        {heroLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 bg-gray-200 rounded w-full animate-pulse" />
            ))}
          </div>
        ) : !data || data.viewedItems.length === 0 ? (
          <p className="text-sm text-gray-400">{t("analytics.noViewsYet")}</p>
        ) : (
          <>
            <ol className="divide-y divide-gray-100">
              {data.viewedItems.map((item, idx) => {
                const href = itemEditorHref(item);
                const content = (
                  <>
                    <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm text-gray-400 w-5 flex-shrink-0 text-right">{idx + 1}.</span>
                    <ViewedItemThumbnail item={item} />
                    <div className="min-w-0">
                      <div className="text-sm text-gray-900 flex items-center flex-wrap gap-x-1">
                        <span className="truncate">{item.name}</span>
                        {period !== 'all' && <MovementBadge status={item.status} delta={item.delta} />}
                      </div>
                      {item.categoryName && (
                        <div className="text-xs text-gray-400 truncate mt-0.5">
                          {item.categoryName}
                        </div>
                      )}
                    </div>
                  </div>
                    <span className="text-sm text-gray-500 shrink-0 ml-2">{t("analytics.viewCount").replace("{count}", String(item.viewCount))}</span>
                  </>
                );

                return (
                  <li key={item.entryId ?? idx}>
                    {href ? (
                      <Link
                        href={href}
                        className="w-full flex items-center justify-between gap-3 py-2 min-h-[60px] text-left rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="w-full flex items-center justify-between gap-3 py-2 min-h-[60px] text-left rounded-lg">
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {data && data.viewedItems.length >= limit && limit < 100 && (
              <button
                onClick={() => setLimit((prev) => (prev < 50 ? 50 : 100))}
                disabled={heroLoading}
                className="mt-3 w-full py-2 text-sm font-medium text-[#b07040] hover:bg-[#fbf3ec] rounded-lg transition-colors disabled:opacity-50"
              >
                {heroLoading ? t("analytics.viewMoreLoading") : t("analytics.viewMore")}
              </button>
            )}
            {period !== 'all' && (
              <p className="text-xs text-gray-400 mt-3">
                {t("analytics.movementHint")}
              </p>
            )}
          </>
        )}
      </div>

      {data?.menuBreakdown && data.menuBreakdown.length > 0 && (
        <div
          className="bg-white rounded-lg shadow p-4"
          role="region"
          aria-label={t("analytics.menuBreakdownAria")}
        >
          <p className="text-sm font-semibold text-gray-900 mb-3">{t("analytics.menuBreakdownTitle")}</p>
          <MenuBreakdown items={data.menuBreakdown} />
        </div>
      )}

      {data?.hourlyTotals && (
        <div
          className="bg-white rounded-lg shadow p-4"
          role="region"
          aria-label={t("analytics.hourlyAria")}
        >
          <p className="text-sm font-semibold text-gray-900 mb-3">{t("analytics.hourlyTitle")}</p>
          <HourlyChart data={data.hourlyTotals} />
        </div>
      )}

    </div>
  );
}
