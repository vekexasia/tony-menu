import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api";

const apiMocks = vi.hoisted(() => ({
  fetchOrderIntent: vi.fn(),
  consumeOrderIntent: vi.fn(),
  fetchFloor: vi.fn(),
  openTableSession: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, ...apiMocks };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("token=tok-123"),
}));

vi.mock("@/lib/i18n", () => ({
  useTranslations: () => (key: string) => ({
    "orderReview.unavailable": "No longer available",
    "orderReview.submit": "Submit order",
    "orderReview.submitting": "Submitting...",
    "orderReview.expired": "This prepared order has expired.",
    "orderReview.consumed": "This prepared order was already submitted.",
    "orderReview.notFoundTitle": "Order not found",
    "orderReview.notFoundText": "This QR code does not match any prepared order.",
  }[key] ?? key),
}));

import OrderReviewPage from "./OrderReviewPage";

const PENDING_INTENT = {
  token: "tok-123",
  status: "pending" as const,
  expiresAt: Date.now() + 1_800_000,
  consumedAt: null,
  lines: [
    { entryId: "e1", quantity: 2, name: "Bruschetta", price: 750, unavailable: false },
    { entryId: "e2", quantity: 1, name: "Pasta", price: 1200, unavailable: false },
  ],
};

beforeEach(() => {
  apiMocks.fetchOrderIntent.mockReset();
  apiMocks.consumeOrderIntent.mockReset();
  apiMocks.fetchFloor.mockReset();
  apiMocks.openTableSession.mockReset();
  apiMocks.fetchFloor.mockResolvedValue({ tables: [] });
});

describe("OrderReviewPage", () => {
  it("loads the intent by token and submits it, showing the daily number", async () => {
    apiMocks.fetchOrderIntent.mockResolvedValue(PENDING_INTENT);
    apiMocks.consumeOrderIntent.mockResolvedValue({ ok: true, orderId: "o1", dailyNumber: 9 });

    render(<OrderReviewPage />);

    expect(await screen.findByText("Bruschetta")).toBeInTheDocument();
    expect(screen.getByText("27.00 €")).toBeInTheDocument(); // total 2×7.50 + 12.00
    fireEvent.click(screen.getByRole("button", { name: /submit order/i }));

    expect(await screen.findByTestId("order-daily-number")).toHaveTextContent("#9");
    expect(apiMocks.consumeOrderIntent).toHaveBeenCalledWith("tok-123", undefined);
  });

  it("blocks submit while items became unavailable after intent creation", async () => {
    apiMocks.fetchOrderIntent.mockResolvedValue({
      ...PENDING_INTENT,
      lines: [{ entryId: "e1", quantity: 1, name: "Bruschetta", price: 750, unavailable: true }],
    });

    render(<OrderReviewPage />);

    expect(await screen.findByText("No longer available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit order/i })).toBeDisabled();
  });

  it("shows a clear error for an expired intent (no submit button)", async () => {
    apiMocks.fetchOrderIntent.mockResolvedValue({ ...PENDING_INTENT, status: "expired" });

    render(<OrderReviewPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/expired/i);
    expect(screen.queryByRole("button", { name: /submit order/i })).not.toBeInTheDocument();
  });

  it("shows a clear error for an already-consumed intent", async () => {
    apiMocks.fetchOrderIntent.mockResolvedValue({ ...PENDING_INTENT, status: "consumed", consumedAt: Date.now() });

    render(<OrderReviewPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/already submitted/i);
    expect(screen.queryByRole("button", { name: /submit order/i })).not.toBeInTheDocument();
  });

  it("handles a consume race: 409 consumed refreshes the view into the consumed state", async () => {
    apiMocks.fetchOrderIntent
      .mockResolvedValueOnce(PENDING_INTENT)
      .mockResolvedValueOnce({ ...PENDING_INTENT, status: "consumed", consumedAt: Date.now() });
    apiMocks.consumeOrderIntent.mockRejectedValue(new ApiError(409, "consumed", { error: "consumed" }));

    render(<OrderReviewPage />);

    fireEvent.click(await screen.findByRole("button", { name: /submit order/i }));

    await waitFor(() => expect(screen.queryByRole("button", { name: /submit order/i })).not.toBeInTheDocument());
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(/already submitted/i);
  });

  it("shows not-found for an unknown token", async () => {
    apiMocks.fetchOrderIntent.mockRejectedValue(new ApiError(404, "Not Found"));

    render(<OrderReviewPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/not found|does not match/i);
  });
});
