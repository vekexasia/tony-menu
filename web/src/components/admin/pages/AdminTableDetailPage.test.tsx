import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

const apiMocks = vi.hoisted(() => ({
  ApiError: class ApiError extends Error { status = 500; constructor(status: number) { super(); this.status = status; } },
  fetchAdminTableDetail: vi.fn(),
  createCheck: vi.fn(),
  updateCheck: vi.fn(),
  settleCheck: vi.fn(),
  voidCheck: vi.fn(),
  adminCloseSession: vi.fn(),
}));
vi.mock("@/lib/api", () => apiMocks);

import AdminTableDetailPage from "./AdminTableDetailPage";

const order = {
  id: "o1", dailyNumber: 1, status: "served" as const, createdAt: 1,
  items: [{ id: "i1", name: "Bruschetta", price: 750, quantity: 2 }],
  events: [],
};

const sessionNoCheck = {
  table: { id: "t1", name: "1", areaName: "Sala", active: true, shape: "rect" as const },
  currentSession: { sessionId: "s1", openedAt: 1, orders: [order], check: null, provisionalTotal: 1500 },
  history: [],
};

const openCheck = {
  id: "c1", status: "open" as const,
  lines: [{ name: "Bruschetta", quantity: 2, unitPrice: 750 }],
  discount: null, adjustments: [],
  subtotal: 1500, total: 1500, createdAt: 1, settledAt: null, voidedAt: null,
};

beforeEach(() => {
  for (const m of Object.values(apiMocks)) if (typeof m === "function" && "mockReset" in m) (m as ReturnType<typeof vi.fn>).mockReset();
  apiMocks.fetchAdminTableDetail.mockResolvedValue(sessionNoCheck);
});

describe("AdminTableDetailPage", () => {
  it("renders the session with orders and provisional total", async () => {
    render(<AdminTableDetailPage tableId="t1" />);
    expect(await screen.findByTestId("order-1")).toBeInTheDocument();
    expect(screen.getByTestId("provisional-total")).toHaveTextContent("15,00");
  });

  it("creates a check via the create button", async () => {
    apiMocks.createCheck.mockResolvedValue(openCheck);
    render(<AdminTableDetailPage tableId="t1" />);
    fireEvent.click(await screen.findByTestId("create-check"));
    await waitFor(() => expect(apiMocks.createCheck).toHaveBeenCalledWith("s1"));
  });

  it("shows the check card and recomputes total from the server response after a discount edit", async () => {
    apiMocks.fetchAdminTableDetail.mockResolvedValue({ ...sessionNoCheck, currentSession: { ...sessionNoCheck.currentSession, check: openCheck } });
    // Server applies 10% -> total 1350.
    apiMocks.updateCheck.mockResolvedValue({ ...openCheck, discount: { type: "percent", value: 10 }, total: 1350 });
    apiMocks.fetchAdminTableDetail.mockResolvedValueOnce({ ...sessionNoCheck, currentSession: { ...sessionNoCheck.currentSession, check: openCheck } });
    render(<AdminTableDetailPage tableId="t1" />);
    const card = await screen.findByTestId("check-card");
    expect(card).toBeInTheDocument();
    expect(screen.getByTestId("check-total")).toHaveTextContent("15,00");

    // After refresh the mock returns the discounted check.
    apiMocks.fetchAdminTableDetail.mockResolvedValue({ ...sessionNoCheck, currentSession: { ...sessionNoCheck.currentSession, check: { ...openCheck, discount: { type: "percent", value: 10 }, total: 1350 } } });
    const input = screen.getByTestId("discount-value");
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.blur(input);
    await waitFor(() => expect(apiMocks.updateCheck).toHaveBeenCalledWith("c1", { discount: { type: "percent", value: 10 } }));
    await waitFor(() => expect(screen.getByTestId("check-total")).toHaveTextContent("13,50"));
  });

  it("settles the check behind an inline confirm", async () => {
    apiMocks.fetchAdminTableDetail.mockResolvedValue({ ...sessionNoCheck, currentSession: { ...sessionNoCheck.currentSession, check: openCheck } });
    apiMocks.settleCheck.mockResolvedValue({ ...openCheck, status: "settled", settledAt: 2 });
    render(<AdminTableDetailPage tableId="t1" />);
    fireEvent.click(await screen.findByTestId("settle"));
    fireEvent.click(await screen.findByTestId("settle-confirm"));
    await waitFor(() => expect(apiMocks.settleCheck).toHaveBeenCalledWith("c1"));
  });

  it("shows the free empty state when there is no open session", async () => {
    apiMocks.fetchAdminTableDetail.mockResolvedValue({ ...sessionNoCheck, currentSession: null });
    render(<AdminTableDetailPage tableId="t1" />);
    expect(await screen.findByTestId("table-free")).toBeInTheDocument();
  });
});
