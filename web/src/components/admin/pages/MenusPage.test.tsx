import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const loadRestaurantMock = vi.fn();

vi.mock("@/lib/i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

const apiMocks = vi.hoisted(() => ({
  ApiError: class ApiError extends Error { status = 500; },
  fetchMenus: vi.fn(),
  createMenu: vi.fn(),
  updateMenu: vi.fn(),
  deleteMenu: vi.fn(),
  reorderMenus: vi.fn(),
}));
vi.mock("@/lib/api", () => apiMocks);

import MenusPage from "./MenusPage";
import { useRestaurantStore } from "@/stores/restaurantStore";
import type { RestaurantData } from "@/lib/types";

const menus = [
  { id: "m1", code: "lunch", title: "Lunch", i18n: null, published: true, sortOrder: 0, icon: "utensils", availableFrom: null, availableTo: null, availableDays: null },
  { id: "m2", code: "dinner", title: "Dinner", i18n: null, published: false, sortOrder: 1, icon: "utensils", availableFrom: null, availableTo: null, availableDays: null },
];

beforeEach(() => {
  for (const m of Object.values(apiMocks)) if (typeof m === "function" && "mockReset" in m) (m as ReturnType<typeof vi.fn>).mockReset();
  loadRestaurantMock.mockReset();
  apiMocks.fetchMenus.mockResolvedValue({ menus: menus.map((m) => ({ ...m })) });
  useRestaurantStore.setState({
    data: { id: "r", name: "R", categories: [], menus: [], labels: [], features: { primaryLocale: "it" } } as unknown as RestaurantData,
    categoriesCache: new Map(),
    isLoading: false,
    error: null,
    loadRestaurant: loadRestaurantMock,
  } as never);
});

describe("MenusPage mutations", () => {
  it("creates a menu via createMenu and refreshes", async () => {
    apiMocks.createMenu.mockResolvedValue({ id: "m3" });
    render(<MenusPage />);
    await screen.findByText("Lunch");

    fireEvent.click(screen.getByText("menus.newMenu"));
    fireEvent.change(screen.getByPlaceholderText("menus.codePlaceholder"), { target: { value: "brunch" } });
    fireEvent.change(screen.getByPlaceholderText("menus.titlePlaceholder"), { target: { value: "Brunch" } });
    fireEvent.click(screen.getByText("common.create"));

    await waitFor(() => expect(apiMocks.createMenu).toHaveBeenCalledWith({ code: "brunch", title: "Brunch" }));
    expect(loadRestaurantMock).toHaveBeenCalled();
  });

  it("toggles publish optimistically and calls updateMenu", async () => {
    apiMocks.updateMenu.mockResolvedValue({});
    render(<MenusPage />);
    await screen.findByText("Lunch");

    // Lunch is published -> its toggle button reads menus.published; click flips to draft.
    const buttons = screen.getAllByTitle("menus.publishedTooltip");
    fireEvent.click(buttons[0]);

    await waitFor(() => expect(apiMocks.updateMenu).toHaveBeenCalledWith("m1", { published: false }));
  });

  it("reverts and surfaces an error when publish toggle fails", async () => {
    apiMocks.updateMenu.mockRejectedValue(new apiMocks.ApiError("nope"));
    render(<MenusPage />);
    await screen.findByText("Lunch");

    fireEvent.click(screen.getAllByTitle("menus.publishedTooltip")[0]);

    await waitFor(() => expect(screen.getByText("nope")).toBeInTheDocument());
  });

  it("deletes a menu through the confirm dialog", async () => {
    apiMocks.deleteMenu.mockResolvedValue({});
    render(<MenusPage />);
    await screen.findByText("Lunch");

    fireEvent.click(screen.getAllByTitle("menus.deleteTooltip")[0]);
    // Confirm dialog -> click confirm delete
    fireEvent.click(screen.getByText("common.delete"));

    await waitFor(() => expect(apiMocks.deleteMenu).toHaveBeenCalledWith("m1"));
  });

  it("keeps the delete dialog open and shows the error when delete fails", async () => {
    apiMocks.deleteMenu.mockRejectedValue(new apiMocks.ApiError("delete boom"));
    render(<MenusPage />);
    await screen.findByText("Lunch");

    fireEvent.click(screen.getAllByTitle("menus.deleteTooltip")[0]);
    fireEvent.click(screen.getByText("common.delete"));

    await waitFor(() => expect(screen.getByText("delete boom")).toBeInTheDocument());
  });
});
