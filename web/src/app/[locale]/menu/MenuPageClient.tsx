"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useTranslations } from "@/lib/i18n";
import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useRestaurantStore, useCategories, useLabels } from "@/stores/restaurantStore";
import { MenuItemDetail } from "@/components/menu/MenuItemDetail";
import { MenuItemListView } from "@/components/menu/views/MenuItemListView";
import { RestaurantInfoModal } from "@/components/menu/RestaurantInfoModal";
import { PromotionPopup } from "@/components/menu/PromotionPopup";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useChatActionsStore, useScrollToCategoryId, useChatFilterCriteria } from "@/stores/chatActionsStore";
import { useSelectionStore } from "@/stores/selectionStore";
import type { MenuEntry } from "@/lib/types";
import { recordView } from "@/lib/api";
import { viewDedupeKey } from "@/lib/utils";
import { getContentDisplayText, getLocalizedContentValue, getSearchableContentTexts } from "@/lib/content-presentation";
import { isMenuAvailableNow } from "@/lib/menu-schedule";
import { resolveLabel } from "@/lib/label-colors";

// Client-side dedup: skip redundant network calls for items already viewed in this
// page session. The backend deduplicates via UNIQUE constraint too — this is a
// bandwidth optimisation only. The key includes a YYYYMMDD date bucket so a tab
// left open across midnight correctly allows re-tracking for the new day.
const viewedThisSession = new Set<string>();

type MenuEntryWithDetails = MenuEntry & { description?: string; image?: string; priceUnit?: string; outOfStock?: boolean; frozen?: boolean };

export default function MenuPageClient() {
  const t = useTranslations();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = params.locale as string;
  // Menu code lives in the query string (?type=<code>) because `output: "export"`
  // forbids runtime-discovered dynamic route params. The legacy `?type=drinks`
  // value is honored as an alias for any 'drinks'- or 'takeaway'-coded menu.
  const typeParam = searchParams.get("type") ?? undefined;
  const aiChatDevOverride = process.env.NODE_ENV !== 'production' && searchParams.get('aiChat') === '1';
  const hasChatWorker = Boolean(process.env.NEXT_PUBLIC_CHAT_WORKER_URL);
  const { data, isLoading, error, loadRestaurant } = useRestaurantStore();
  const categories = useCategories();
  const allLabels = useLabels();
  const initializeSelection = useSelectionStore((state) => state.initialize);
  const selectionCount = useSelectionStore((state) => state.count());
  const [showNotice, setShowNotice] = useState(true);
  const [showPromo, setShowPromo] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuEntryWithDetails | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const categoryRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const categoryTabsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const isScrollingToCategory = useRef(false);

  const scrollToCategoryId = useScrollToCategoryId();
  const chatFilterCriteria = useChatFilterCriteria();
  const { consumeScrollRequest, clearFilter } = useChatActionsStore();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as Window & { __ristoPerf?: Record<string, unknown> }).__ristoPerf = {
        pageStart: performance.now(),
        route: 'menu',
      };
    }
    loadRestaurant();
  }, [loadRestaurant]);

  useEffect(() => {
    if (data?.id) initializeSelection(data.id);
  }, [data?.id, initializeSelection]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const perfStore = ((window as Window & { __ristoPerf?: Record<string, unknown> }).__ristoPerf ??= {});
    if (isLoading) { perfStore.loadingVisibleAt = performance.now(); return; }
    if (data) {
      document.title = data.name || "Menu Risto";
      perfStore.dataReadyAt = performance.now();
      requestAnimationFrame(() => { perfStore.firstFrameAfterDataAt = performance.now(); });
    }
  }, [isLoading, data]);

  useEffect(() => {
    if (!data?.promotion) return;
    const promo = data.promotion;
    if (promo.tillDate) {
      const till = new Date(promo.tillDate);
      if (Date.now() > till.getTime()) return;
    }
    if (sessionStorage.getItem('promo_seen')) return;
    setShowPromo(true);
  }, [data?.promotion]);

  const handlePromoClose = () => {
    setShowPromo(false);
    sessionStorage.setItem('promo_seen', '1');
  };

  // Minute-tick so time-gated menus (availableFrom/availableTo) re-evaluate every minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Resolve the current menu from `?type=<code>`. Falls back to the first published menu
  // when no `type` is in the query string. The legacy value `drinks` aliases to any menu
  // coded `drinks` (or `takeaway` for old QR codes from before the rename).
  const publishedMenus = useMemo(
    () => (data?.menus ?? []).filter((m) => m.published && isMenuAvailableNow(m, now)),
    [data?.menus, now],
  );
  const currentMenu = useMemo(() => {
    if (!data) return undefined;
    if (typeParam) {
      const direct = data.menus.find((m) => m.code === typeParam);
      if (direct) return direct;
      if (typeParam === "drinks") {
        return publishedMenus.find((m) => m.code === "takeaway");
      }
    }
    return publishedMenus[0];
  }, [data, typeParam, publishedMenus]);

  const isVisible = (entry: MenuEntry) => {
    if (!currentMenu) return false;
    if (entry.hidden) return false;
    return entry.menuIds.includes(currentMenu.id);
  };

  const noticeConfig = data?.info?.menuNotice;
  const noticeEnabled = noticeConfig?.enabled !== false;
  const defaultNoticeText = `${t("allergyWarning")}\n\n${t("frozenIngredientsNote")}`;
  const noticeText = noticeConfig?.i18n?.[locale]?.text || noticeConfig?.text || defaultNoticeText;
  const selectionEnabled = data?.features?.selection === true;

  const filteredCategories = useMemo(() => {
    if (!currentMenu) return [];
    return categories
      .map((cat) => ({
        ...cat,
        entries: cat.entries.filter((entry) => {
          if (!isVisible(entry)) return false;
          const nameTexts = getSearchableContentTexts({ entity: entry, field: "name", locale, restaurantId: data?.id });
          const descriptionTexts = getSearchableContentTexts({ entity: entry, field: "description", locale, restaurantId: data?.id });
          const searchableContent = [...nameTexts, ...descriptionTexts].join(" ").toLowerCase();
          if (searchQuery) return searchableContent.includes(searchQuery.toLowerCase());
          if (chatFilterCriteria?.excludeAllergens?.length) {
            if (entry.allergens?.some(a => chatFilterCriteria.excludeAllergens!.includes(a))) return false;
          }
          if (chatFilterCriteria?.searchQuery) {
            if (!searchableContent.includes(chatFilterCriteria.searchQuery.toLowerCase())) return false;
          }
          return true;
        }),
      }))
      .filter((cat) => cat.entries.length > 0);
  }, [categories, currentMenu, searchQuery, chatFilterCriteria, locale, data?.id]);

  useEffect(() => {
    if (typeof window === 'undefined' || !data) return;
    const perfStore = ((window as Window & { __ristoPerf?: Record<string, unknown> }).__ristoPerf ??= {});
    perfStore.filteredCategoryCount = filteredCategories.length;
    perfStore.filteredEntryCount = filteredCategories.reduce((sum, cat) => sum + cat.entries.length, 0);
  }, [data, filteredCategories]);

  useEffect(() => {
    if (filteredCategories.length > 0 && !activeCategory) setActiveCategory(filteredCategories[0].id);
  }, [filteredCategories, activeCategory]);

  useEffect(() => {
    if (filteredCategories.length === 0) return;
    const handleScroll = () => {
      if (isScrollingToCategory.current) return;
      const stickyOffset = 56;
      let currentCategory: string | null = null;
      for (const cat of filteredCategories) {
        const element = categoryRefs.current.get(cat.id);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= stickyOffset + 50) currentCategory = cat.id;
        }
      }
      if (currentCategory && currentCategory !== activeCategory) {
        setActiveCategory(currentCategory);
        const tabElement = tabRefs.current.get(currentCategory);
        const tabsContainer = categoryTabsRef.current;
        if (tabElement && tabsContainer) {
          const containerRect = tabsContainer.getBoundingClientRect();
          const tabRect = tabElement.getBoundingClientRect();
          const scrollLeft = tabElement.offsetLeft - containerRect.width / 2 + tabRect.width / 2;
          tabsContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [filteredCategories, activeCategory]);

  const scrollToCategory = (categoryId: string) => {
    const element = categoryRefs.current.get(categoryId);
    if (element) {
      isScrollingToCategory.current = true;
      const stickyOffset = 56;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - stickyOffset;
      window.scrollTo({ top: offsetPosition, behavior: "smooth" });
      setActiveCategory(categoryId);
      setTimeout(() => { isScrollingToCategory.current = false; }, 500);
    }
  };

  useEffect(() => {
    if (scrollToCategoryId) { scrollToCategory(scrollToCategoryId); consumeScrollRequest(); }
  }, [scrollToCategoryId, consumeScrollRequest]);

  const getDisplayText = (
    item: { name?: string; description?: string; desc?: string; i18n?: Record<string, Record<string, string>> },
    field: "name" | "description" = "name"
  ) => getContentDisplayText({ entity: item, field, locale, restaurantId: data?.id });

  const getLocalized = (
    item: { name?: string; description?: string; desc?: string; i18n?: Record<string, Record<string, string>> },
    field: "name" | "description" = "name"
  ): string => getLocalizedContentValue(item, field, locale);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center p-8">
          <p className="text-red-500 mb-4">{error}</p>
          <button onClick={() => loadRestaurant()} className="px-4 py-2 bg-primary text-white rounded-lg">
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const getTodayHours = () => {
    if (!data.openingSchedule?.schedule) return t("closedToday");
    const today = new Date().getDay();
    const dayIndex = today === 0 ? 6 : today - 1;
    const todaySchedule = data.openingSchedule.schedule[dayIndex];
    if (!todaySchedule || todaySchedule.length === 0) return t("closedToday");
    return todaySchedule.map((slot) => `${slot.start} - ${slot.end}`).join("   ");
  };

  return (
    <main className="min-h-screen bg-gray-100 pb-20">
      <div className="relative">
        {data.headerImage && (
          <div className="relative h-56 overflow-hidden">
            <Image src={data.headerImage} alt={data.name} fill className="object-cover" priority sizes="100vw" />
          </div>
        )}
        <div className="absolute top-4 left-0 right-0 px-16 z-10">
          <div className="flex items-center bg-white rounded-full shadow-lg px-4 py-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400 mr-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input type="text" placeholder={t("searchDish")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 outline-none text-gray-700 text-center" />
          </div>
        </div>
        {selectionEnabled && selectionCount > 0 && (
          <Link
            href={`/${locale}/selection`}
            className="absolute top-4 right-4 z-20 rounded-full bg-primary text-white shadow-lg px-3 py-2 text-xs font-semibold"
            aria-label={`My selection (${selectionCount})`}
          >
            My selection ({selectionCount})
          </Link>
        )}
        <div className="relative -mt-20 mx-3 z-20">
          <button onClick={() => setShowInfoModal(true)} className="w-full bg-white rounded-xl shadow-lg p-4 text-center">
            <h1 className="text-xl font-semibold text-primary tracking-wide" style={{ fontFamily: data.theme?.font || "inherit" }}>
              {data.name?.toUpperCase()}
            </h1>
            <p className="text-sm text-gray-600 mt-2">{getTodayHours()}</p>
            <div className="flex justify-center gap-6 mt-3 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <p className="text-xs text-gray-400 mt-2">{t("moreInfo")}</p>
          </button>
        </div>
      </div>

      {chatFilterCriteria && (
        <div className="mx-4 mt-2 mb-1 flex items-center gap-2 bg-primary/10 text-primary text-sm px-3 py-2 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
          <span className="flex-1">
            {chatFilterCriteria.excludeAllergens?.length ? `Filtro allergeni attivo` : `Filtro: "${chatFilterCriteria.searchQuery}"`}
          </span>
          <button onClick={clearFilter} className="text-primary hover:text-primary/70 font-medium">&times;</button>
        </div>
      )}

      {filteredCategories.length > 1 && (
        <div className="sticky top-0 z-40 bg-gray-100 py-2">
          <div ref={categoryTabsRef} className="flex overflow-x-auto gap-2 px-4 no-scrollbar">
            {filteredCategories.map((cat) => (
              <button
                key={cat.id}
                ref={(el) => { if (el) tabRefs.current.set(cat.id, el); }}
                onClick={() => scrollToCategory(cat.id)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${activeCategory === cat.id ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-200"}`}
              >
                {getDisplayText(cat).primary}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 mt-4 space-y-6">
        {filteredCategories.length === 0 && searchQuery && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 text-gray-300 mb-4"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            <p className="text-gray-500 text-lg font-medium">{t("noResults")}</p>
            <p className="text-gray-400 text-sm mt-1">{t("tryDifferentSearch")}</p>
          </div>
        )}

        {filteredCategories.map((cat) => (
          <div key={cat.id} data-locale-anchor={`category:${cat.id}`} ref={(el) => { if (el) categoryRefs.current.set(cat.id, el); }}>
            {(() => {
              const categoryName = getDisplayText(cat);
              return (
                <h3 className="text-primary font-bold text-lg mb-3 tracking-wider">
                  <span className="block">{categoryName.primary.toUpperCase()}</span>
                  {categoryName.secondary && <span className="mt-0.5 block text-xs font-medium tracking-normal text-primary/70 normal-case">{categoryName.secondary}</span>}
                </h3>
              );
            })()}
            <div className="space-y-3">
              {cat.entries.map((entry) => {
                const entryWithDesc = entry as MenuEntryWithDetails;
                const itemName = getDisplayText(entry);
                const itemDescription = getLocalized({ description: entryWithDesc.description, i18n: entry.i18n }, "description") || entryWithDesc.description;
                return (
                  <div key={entry.id} data-locale-anchor={`entry:${entry.id}`}>
                    <MenuItemListView
                      item={{
                        name: itemName.primary,
                        nameSecondary: itemName.secondary,
                        description: itemDescription,
                        price: entry.price,
                        priceUnit: entryWithDesc.priceUnit,
                        image: entryWithDesc.image,
                        outOfStock: entryWithDesc.outOfStock,
                        labels: entry.labelIds?.length
                          ? allLabels.filter(l => entry.labelIds!.includes(l.id)).map(l => resolveLabel(l, locale))
                          : undefined,
                      }}
                      outOfStockLabel={t("outOfStock")}
                      onClick={() => {
                        setSelectedItem(entryWithDesc);
                        const dedupeKey = viewDedupeKey(entry.id);
                        if (!viewedThisSession.has(dedupeKey)) {
                          recordView(entry.id)
                            .then(() => { viewedThisSession.add(dedupeKey); })
                            .catch(() => {});
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <footer className="px-4 py-8 text-center">
        <a
          href="https://github.com/vekexasia/tony-menu"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {t("poweredByTonyMenu")}
        </a>
      </footer>

      {showNotice && noticeEnabled && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <p className="text-gray-700 mb-6 whitespace-pre-line">{noticeText}</p>
            <button onClick={() => setShowNotice(false)} className="w-full bg-primary text-white py-3 rounded-full font-medium hover:opacity-90 transition-opacity">OK</button>
          </div>
        </div>
      )}

      {hasChatWorker && (data?.features?.aiChat === true || aiChatDevOverride) && <ChatPanel locale={locale} voiceEnabled={data?.features?.aiVoice === true} />}
      <MenuItemDetail item={selectedItem} onClose={() => setSelectedItem(null)} locale={locale} selectionEnabled={selectionEnabled} />

      {data && <RestaurantInfoModal restaurant={data} isOpen={showInfoModal} onClose={() => setShowInfoModal(false)} />}
      {data.promotion && <PromotionPopup promotion={data.promotion} open={showPromo} onClose={handlePromoClose} />}

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </main>
  );
}
