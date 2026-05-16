import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

let searchParams = new URLSearchParams("");
const routerPushMock = vi.fn();
const loadRestaurantMock = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt, ...rest } = props;
    delete rest.fill;
    delete rest.sizes;
    delete rest.unoptimized;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt as string} {...rest} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className, style }: { children: React.ReactNode; href: string; className?: string; style?: React.CSSProperties }) => (
    <a href={href} className={className} style={style}>{children}</a>
  ),
}));

vi.mock("@/lib/i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error { status = 500; },
  updateEntry: vi.fn(),
  reorderEntries: vi.fn(),
  deleteEntry: vi.fn(),
  translateText: vi.fn(),
}));

import EntriesPage from "./EntriesPage";
import { useRestaurantStore } from "@/stores/restaurantStore";
import type { MenuCategory, RestaurantData } from "@/lib/types";

const categories = [
  {
    id: "cat-starters",
    path: "menuEntries/cat-starters",
    name: "Starters",
    order: 0,
    entries: [
      {
        id: "entry-bruschetta",
        path: "menuEntries/cat-starters/entries/entry-bruschetta",
        categoryPath: "menuEntries/cat-starters",
        name: "Bruschetta",
        description: "Toasted bread",
        price: 7.5,
        order: 0,
        outOfStock: false,
        containsFrozenIngredient: false,
        allergens: [],
        menuIds: ["menu-food"],
        labelIds: [],
        hidden: false,
      },
      {
        id: "entry-soup",
        path: "menuEntries/cat-starters/entries/entry-soup",
        categoryPath: "menuEntries/cat-starters",
        name: "Soup",
        description: "Bruschetta-inspired tomato bowl",
        price: 8,
        order: 1,
        outOfStock: false,
        containsFrozenIngredient: false,
        allergens: [],
        menuIds: ["menu-food"],
        labelIds: [],
        hidden: false,
      },
      {
        id: "003-teciada-di-pesce-in-guazzetto\tcon-crostini",
        path: "menuEntries/cat-starters/entries/003-teciada-di-pesce-in-guazzetto\tcon-crostini",
        categoryPath: "menuEntries/cat-starters",
        name: "Teciada di pesce in guazzetto\tcon crostini",
        description: "Fish stew",
        price: 20,
        order: 2,
        outOfStock: false,
        containsFrozenIngredient: false,
        allergens: [],
        menuIds: ["menu-food"],
        labelIds: [],
        hidden: false,
      },
    ],
    variantPaths: [],
    extraPaths: [],
  },
  {
    id: "cat-desserts",
    path: "menuEntries/cat-desserts",
    name: "Desserts",
    order: 1,
    entries: [
      {
        id: "entry-tiramisu",
        path: "menuEntries/cat-desserts/entries/entry-tiramisu",
        categoryPath: "menuEntries/cat-desserts",
        name: "Tiramisu",
        description: "Coffee dessert",
        price: 6,
        order: 0,
        outOfStock: false,
        containsFrozenIngredient: false,
        allergens: [],
        menuIds: ["menu-food"],
        labelIds: [],
        hidden: false,
      },
    ],
    variantPaths: [],
    extraPaths: [],
  },
] as MenuCategory[];

const restaurantData = {
  id: "restaurant",
  name: "Restaurant",
  menus: [{ id: "menu-food", code: "food", title: "Food", published: true, sortOrder: 0 }],
  categories,
  features: { primaryLocale: "en" },
} as RestaurantData;

function resetStore() {
  useRestaurantStore.setState({
    data: restaurantData,
    categoriesCache: new Map(categories.map((category) => [category.path, category])),
    isLoading: false,
    error: null,
    loadRestaurant: loadRestaurantMock,
  } as never);
}

describe("EntriesPage", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams("");
    routerPushMock.mockClear();
    loadRestaurantMock.mockClear();
    resetStore();
  });

  it("shows all items when no category is selected", async () => {
    render(<EntriesPage />);

    expect(await screen.findByText("Bruschetta")).toBeInTheDocument();
    expect(screen.getByText("Soup")).toBeInTheDocument();
    expect(screen.getByText("Tiramisu")).toBeInTheDocument();
  });

  it("filters all items by item name", async () => {
    render(<EntriesPage />);

    fireEvent.change(await screen.findByPlaceholderText("entries.searchPlaceholder"), {
      target: { value: "brus" },
    });

    expect(screen.getByText("Bruschetta")).toBeInTheDocument();
    expect(screen.queryByText("Soup")).not.toBeInTheDocument();
    expect(screen.queryByText("Tiramisu")).not.toBeInTheDocument();
  });

  it("encodes item ids when opening the editor", async () => {
    searchParams = new URLSearchParams("category=cat-starters");

    render(<EntriesPage />);

    fireEvent.click(await screen.findByText(/Teciada di pesce in guazzetto/));

    expect(routerPushMock).toHaveBeenCalledWith(
      "/admin/items/edit?entry=003-teciada-di-pesce-in-guazzetto%09con-crostini&category=cat-starters",
    );
  });
});
