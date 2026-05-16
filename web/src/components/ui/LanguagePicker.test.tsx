import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguagePicker } from "./LanguagePicker";
import { useRestaurantStore } from "@/stores/restaurantStore";
import type { RestaurantData } from "@/lib/types";

const pushMock = vi.fn();
const usePathnameMock = vi.fn();
const useSearchParamsMock = vi.fn();

let currentLocale = "it";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => usePathnameMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock("@/lib/i18n", () => ({
  useLocale: () => currentLocale,
}));

const PREFERRED_LOCALE_KEY = "preferred-locale";
const LOCALE_SWITCH_SCROLL_KEY = "locale-switch-scroll-position";

function Anchor({ id, top }: { id: string; top: number }) {
  return <div data-locale-anchor={id} data-test-top={String(top)} data-test-height="48" />;
}

describe("LanguagePicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pushMock.mockReset();
    usePathnameMock.mockReturnValue("/it/menu");
    useSearchParamsMock.mockReturnValue(new URLSearchParams("category=fish"));
    currentLocale = "it";
    window.localStorage.clear();
    window.sessionStorage.clear();
    useRestaurantStore.setState({ data: null });

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      writable: true,
      value: 420,
    });

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 900,
    });

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const top = Number(this.dataset.testTop ?? 0);
      const height = Number(this.dataset.testHeight ?? 40);
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        bottom: top + height,
        right: 100,
        width: 100,
        height,
        toJSON() {
          return {};
        },
      } as DOMRect;
    });

    window.scrollTo = vi.fn() as typeof window.scrollTo;
    window.scrollBy = vi.fn((...args: unknown[]) => {
      const y = typeof args[1] === "number" ? args[1] : 0;
      document.querySelectorAll<HTMLElement>("[data-test-top]").forEach((element) => {
        const currentTop = Number(element.dataset.testTop ?? 0);
        element.dataset.testTop = String(currentTop - y);
      });
    }) as typeof window.scrollBy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("stores the nearest visible content anchor when switching locale", () => {
    render(
      <>
        <Anchor id="entry:far" top={320} />
        <Anchor id="entry:near" top={110} />
        <LanguagePicker />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: /select language/i }));
    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(window.localStorage.getItem(PREFERRED_LOCALE_KEY)).toBe("en");
    expect(window.sessionStorage.getItem(LOCALE_SWITCH_SCROLL_KEY)).toBe(
      JSON.stringify({
        href: "/en/menu?category=fish",
        anchorId: "entry:near",
        anchorTop: 110,
        fallbackScrollY: 420,
      }),
    );
    expect(pushMock).toHaveBeenCalledWith("/en/menu?category=fish", { scroll: false });
  });

  it("restores the matching content anchor after locale navigation", () => {
    currentLocale = "en";
    usePathnameMock.mockReturnValue("/en/menu");
    useSearchParamsMock.mockReturnValue(new URLSearchParams("category=fish"));
    window.sessionStorage.setItem(
      LOCALE_SWITCH_SCROLL_KEY,
      JSON.stringify({
        href: "/en/menu?category=fish",
        anchorId: "entry:near",
        anchorTop: 110,
        fallbackScrollY: 420,
      }),
    );

    render(
      <>
        <Anchor id="entry:near" top={260} />
        <LanguagePicker />
      </>,
    );

    vi.runAllTimers();

    expect(window.scrollBy).toHaveBeenCalledWith(0, 150);
    expect(window.sessionStorage.getItem(LOCALE_SWITCH_SCROLL_KEY)).toBeNull();
  });

  it("shows every enabled standard locale from restaurant settings", () => {
    useRestaurantStore.setState({
      data: {
        id: "test",
        labels: [],
        name: "Test",
        payoff: "",
        headerImage: "",
        ownerID: "",
        messages: undefined,
        menus: [],
        categories: [],
        features: {
          primaryLocale: "it",
          enabledLocales: ["en", "de", "fr"],
          disabledLocales: [],
        },
      } satisfies RestaurantData,
    });

    render(<LanguagePicker />);

    fireEvent.click(screen.getByRole("button", { name: /select language/i }));

    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deutsch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Français" })).toBeInTheDocument();
  });
});
