import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

const fetchAdminOrdersMock = vi.fn();
const updateOrderStatusMock = vi.fn();
const setDestinationPrintedMock = vi.fn();
const fetchOrderDestinationsMock = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchAdminOrders: (...args: unknown[]) => fetchAdminOrdersMock(...args),
  updateOrderStatus: (...args: unknown[]) => updateOrderStatusMock(...args),
  setDestinationPrinted: (...args: unknown[]) => setDestinationPrintedMock(...args),
  fetchOrderDestinations: (...args: unknown[]) => fetchOrderDestinationsMock(...args),
  createOrderDestination: vi.fn(),
  updateOrderDestination: vi.fn(),
  deleteOrderDestination: vi.fn(),
}));

import KitchenBoardPage from "./KitchenBoardPage";
import { useRestaurantStore } from "@/stores/restaurantStore";
import type { RestaurantData } from "@/lib/types";

function setStore(orderingEnabled: boolean) {
  useRestaurantStore.setState({
    data: {
      id: "r",
      name: "R",
      menus: [],
      categories: [],
      features: { ordering: { enabled: orderingEnabled, mode: "send", submitMode: "diner" } },
    } as unknown as RestaurantData,
    isLoading: false,
    error: null,
    loadRestaurant: vi.fn(),
  } as never);
}

const ORDER = {
  id: "order-1",
  dailyNumber: 7,
  status: "submitted" as const,
  rejectReason: null,
  createdAt: Date.now(),
  items: [
    {
      id: "item-1",
      name: "Pizza",
      price: 1000,
      quantity: 1,
      destinations: [
        { id: "oid-a", destinationId: "dest-a", destinationName: "Kitchen", printedAt: null },
        { id: "oid-b", destinationId: "dest-b", destinationName: "Bar", printedAt: null },
      ],
    },
  ],
};

describe("KitchenBoardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAdminOrdersMock.mockResolvedValue({ day: 20260703, orders: [ORDER] });
    fetchOrderDestinationsMock.mockResolvedValue({
      destinations: [
        { id: "dest-a", name: "Kitchen", sortOrder: 0 },
        { id: "dest-b", name: "Bar", sortOrder: 1 },
      ],
    });
    updateOrderStatusMock.mockResolvedValue({ ok: true, status: "ready" });
    setDestinationPrintedMock.mockResolvedValue({ ok: true, printedAt: 123 });
  });

  it("shows the disabled message and fetches nothing when ordering is off", async () => {
    setStore(false);
    render(<KitchenBoardPage />);
    expect(await screen.findByTestId("kitchen-disabled")).toBeInTheDocument();
    expect(fetchAdminOrdersMock).not.toHaveBeenCalled();
  });

  it("renders orders and sends the ready transition", async () => {
    setStore(true);
    render(<KitchenBoardPage />);
    expect(await screen.findByText("#7")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "kitchen.markReady" }));
    await waitFor(() =>
      expect(updateOrderStatusMock).toHaveBeenCalledWith("order-1", { status: "ready" }),
    );
    // After ready, the served action appears.
    expect(await screen.findByRole("button", { name: "kitchen.markServed" })).toBeInTheDocument();
  });

  it("requires a reason to reject and sends it", async () => {
    setStore(true);
    render(<KitchenBoardPage />);
    fireEvent.click(await screen.findByRole("button", { name: "kitchen.reject" }));

    const confirm = screen.getByRole("button", { name: "kitchen.confirmReject" });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("kitchen.rejectReasonPlaceholder"), {
      target: { value: "No flour" },
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(updateOrderStatusMock).toHaveBeenCalledWith("order-1", { status: "rejected", rejectReason: "No flour" }),
    );
  });

  it("toggles only the selected department's row", async () => {
    setStore(true);
    render(<KitchenBoardPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Kitchen" }));

    fireEvent.click(await screen.findByRole("checkbox"));
    // Optimistic: checked immediately, before the PATCH resolves.
    expect(screen.getByRole("checkbox")).toBeChecked();
    await waitFor(() =>
      expect(setDestinationPrintedMock).toHaveBeenCalledWith("oid-a", true),
    );
    expect(setDestinationPrintedMock).not.toHaveBeenCalledWith("oid-b", true);

    // Bar's own row is still unchecked.
    fireEvent.click(screen.getByRole("button", { name: "Bar" }));
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
  });
});
