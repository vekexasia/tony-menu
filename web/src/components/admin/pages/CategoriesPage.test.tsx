import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/i18n", () => ({
  useTranslations: () => (key: string) => key,
  locales: ["it", "en", "de", "fr", "es", "nl", "ru", "pt", "hu", "vec"],
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const apiMocks = vi.hoisted(() => ({
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
  updateCategory: vi.fn(),
  reorderCategories: vi.fn(),
  translateText: vi.fn(),
}));
vi.mock("@/lib/api", () => apiMocks);

import CategoriesPage from "./CategoriesPage";
import { useRestaurantStore } from "@/stores/restaurantStore";
import type { MenuCategory, RestaurantData } from "@/lib/types";

const categories = [
  { id: "c1", path: "menuEntries/c1", name: "Starters", order: 0, entries: [], variantPaths: [], extraPaths: [], i18n: {} },
] as MenuCategory[];

const loadRestaurantMock = vi.fn();

function resetStore() {
  useRestaurantStore.setState({
    data: { id: "r", name: "R", categories, menus: [], labels: [], features: { primaryLocale: "it" } } as unknown as RestaurantData,
    categoriesCache: new Map(categories.map((c) => [c.path, c])),
    isLoading: false,
    error: null,
    loadRestaurant: loadRestaurantMock,
    reset: () => {},
  } as never);
}

beforeEach(() => {
  for (const m of Object.values(apiMocks)) (m as ReturnType<typeof vi.fn>).mockReset();
  loadRestaurantMock.mockReset();
  resetStore();
});

describe("CategoriesPage mutations", () => {
  it("creates a category via createCategory", async () => {
    apiMocks.createCategory.mockResolvedValue({ id: "c2" });
    render(<CategoriesPage />);
    await screen.findByText("categories.newCategory");

    fireEvent.click(screen.getByText("categories.newCategory"));
    // The create modal autofocuses the name input.
    const nameInput = document.activeElement as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Desserts" } });
    fireEvent.click(screen.getByText("categories.modal.creating"));

    await waitFor(() => expect(apiMocks.createCategory).toHaveBeenCalledWith({ name: "Desserts" }));
  });

  it("deletes a category through the ConfirmDeleteModal (no native confirm)", async () => {
    apiMocks.deleteCategory.mockResolvedValue({});
    render(<CategoriesPage />);
    await screen.findByText("categories.newCategory");

    fireEvent.click(screen.getByTitle("categories.row.actionDelete"));
    // Modal is open; confirm.
    fireEvent.click(screen.getByText("common.delete"));

    await waitFor(() => expect(apiMocks.deleteCategory).toHaveBeenCalledWith("c1"));
  });

  it("shows an inline error in the modal when delete fails (instead of alert)", async () => {
    apiMocks.deleteCategory.mockRejectedValue(new Error("boom"));
    render(<CategoriesPage />);
    await screen.findByText("categories.newCategory");

    fireEvent.click(screen.getByTitle("categories.row.actionDelete"));
    fireEvent.click(screen.getByText("common.delete"));

    await waitFor(() => expect(screen.getByText("categories.deleteFailed")).toBeInTheDocument());
  });
});
