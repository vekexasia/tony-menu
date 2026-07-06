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
  openAdminTableSession: vi.fn(),
  createAdminSessionOrder: vi.fn(),
  getAdminCatalog: vi.fn(),
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
  subtotal: 1500, total: 1500, createdAt: 1, settledAt: null, paymentMethod: null, note: null, voidedAt: null,
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

  it("requires payment method in a settlement sheet before settling", async () => {
    apiMocks.fetchAdminTableDetail.mockResolvedValue({ ...sessionNoCheck, currentSession: { ...sessionNoCheck.currentSession, check: openCheck } });
    apiMocks.settleCheck.mockResolvedValue({ ...openCheck, status: "settled", settledAt: 2, paymentMethod: "card", note: "Visa" });
    render(<AdminTableDetailPage tableId="t1" />);
    fireEvent.click(await screen.findByTestId("settle"));
    const confirm = await screen.findByTestId("settle-confirm");
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByTestId("payment-method-card"));
    fireEvent.change(screen.getByTestId("payment-note"), { target: { value: "Visa" } });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(apiMocks.settleCheck).toHaveBeenCalledWith("c1", { paymentMethod: "card", note: "Visa" }));
  });

  it("shows the free empty state when there is no open session", async () => {
    apiMocks.fetchAdminTableDetail.mockResolvedValue({ ...sessionNoCheck, currentSession: null });
    render(<AdminTableDetailPage tableId="t1" />);
    expect(await screen.findByTestId("table-free")).toBeInTheDocument();
  });

  it("adds items with searchable sellable inventory only", async () => {
    apiMocks.getAdminCatalog.mockResolvedValue({
      categories: [
        { id: "c1", name: "Antipasti", sortOrder: 0, i18n: null, entries: [
          { id: "bruschetta", name: "Bruschetta", description: null, internalCode: null, price: 7.5, priceUnit: null, imageUrl: null, outOfStock: false, frozen: false, sortOrder: 0, hidden: false, menuIds: [], labelIds: [], destinationIds: [], allergens: null, i18n: null, metadata: null },
          { id: "hidden", name: "Hidden wine", description: null, internalCode: null, price: 9, priceUnit: null, imageUrl: null, outOfStock: false, frozen: false, sortOrder: 1, hidden: true, menuIds: [], labelIds: [], destinationIds: [], allergens: null, i18n: null, metadata: null },
        ] },
        { id: "c2", name: "Bar", sortOrder: 1, i18n: null, entries: [
          { id: "prosecco", name: "Prosecco", description: null, internalCode: null, price: 6, priceUnit: null, imageUrl: null, outOfStock: false, frozen: false, sortOrder: 0, hidden: false, menuIds: [], labelIds: [], destinationIds: [], allergens: null, i18n: null, metadata: null },
          { id: "sold", name: "Sold out beer", description: null, internalCode: null, price: 5, priceUnit: null, imageUrl: null, outOfStock: true, frozen: false, sortOrder: 1, hidden: false, menuIds: [], labelIds: [], destinationIds: [], allergens: null, i18n: null, metadata: null },
        ] },
      ],
    });
    render(<AdminTableDetailPage tableId="t1" />);
    fireEvent.click(await screen.findByTestId("add-order"));
    expect(await screen.findByRole("heading", { name: "tableDetail.addItems" })).toBeInTheDocument();
    expect(screen.queryByText("Hidden wine")).toBeNull();
    expect(screen.queryByText("Sold out beer")).toBeNull();

    fireEvent.click(screen.getByTestId("admin-item-plus-bruschetta"));
    fireEvent.change(screen.getByTestId("admin-item-search"), { target: { value: "bar" } });
    expect(screen.queryByText("Bruschetta")).toBeNull();
    expect(screen.getByText("Prosecco")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("admin-item-search"), { target: { value: "brus" } });
    expect(screen.getByTestId("admin-item-qty-bruschetta")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("submit-admin-order"));
    await waitFor(() => expect(apiMocks.createAdminSessionOrder).toHaveBeenCalledWith("s1", [{ entryId: "bruschetta", quantity: 1 }]));
  });

  it("blocks adding items while a check is open and offers check actions", async () => {
    apiMocks.fetchAdminTableDetail.mockResolvedValue({ ...sessionNoCheck, currentSession: { ...sessionNoCheck.currentSession, check: openCheck } });
    render(<AdminTableDetailPage tableId="t1" />);
    expect(await screen.findByTestId("check-card")).toBeInTheDocument();
    expect(screen.queryByTestId("add-order")).toBeNull();
    expect(screen.getByTestId("add-items-blocked")).toHaveTextContent("tableDetail.checkOpenAddItemsBlocked");
    fireEvent.click(screen.getByTestId("blocked-settle"));
    expect(await screen.findByTestId("settlement-sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("blocked-void"));
    expect(await screen.findByTestId("void-confirm")).toBeInTheDocument();
  });

  it("shows payment method in settled history", async () => {
    apiMocks.fetchAdminTableDetail.mockResolvedValue({
      ...sessionNoCheck,
      currentSession: null,
      history: [{ sessionId: "h1", openedAt: 1, closedAt: 2, check: { ...openCheck, status: "settled", settledAt: 2, paymentMethod: "cash" } }],
    });
    render(<AdminTableDetailPage tableId="t1" />);
    expect(await screen.findByTestId("history-payment-h1")).toHaveTextContent("tableDetail.paymentMethod.cash");
  });
});
