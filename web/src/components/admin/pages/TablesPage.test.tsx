import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

const apiMocks = vi.hoisted(() => ({
  ApiError: class ApiError extends Error { status = 500; constructor(status: number) { super(); this.status = status; } },
  fetchAdminFloor: vi.fn(),
  createArea: vi.fn(),
  updateArea: vi.fn(),
  deleteArea: vi.fn(),
  createTable: vi.fn(),
  updateTable: vi.fn(),
  deleteTable: vi.fn(),
  updateTablePosition: vi.fn(),
}));
vi.mock("@/lib/api", () => apiMocks);

import TablesPage from "./TablesPage";

const areas = [
  { id: "a1", name: "Sala", sortOrder: 0 },
  { id: "a2", name: "Terrazza", sortOrder: 1 },
];
const base = { openedAt: null, orderCount: 0, readyCount: 0 };
const tables = [
  // t1: green (open, no submitted); t2 lives in another area.
  { id: "t1", name: "1", active: true, areaId: "a1", x: 50, y: 50, shape: "rect" as const, sessionId: "s1", oldestSubmittedAt: null, ...base },
  { id: "t2", name: "2", active: true, areaId: "a2", x: 50, y: 50, shape: "circle" as const, sessionId: null, oldestSubmittedAt: null, ...base },
];

beforeEach(() => {
  for (const m of Object.values(apiMocks)) if (typeof m === "function" && "mockReset" in m) (m as ReturnType<typeof vi.fn>).mockReset();
  apiMocks.fetchAdminFloor.mockResolvedValue({ areas, tables });
});

async function enableEdit() {
  fireEvent.click(await screen.findByTestId("edit-layout-toggle"));
}

describe("TablesPage", () => {
  it("renders an area tab per area and colour-codes the active area's tiles", async () => {
    render(<TablesPage />);
    await screen.findByTestId("area-tab-a1");
    expect(screen.getByTestId("area-tab-a2")).toBeInTheDocument();
    // First area active: its table "1" renders on the canvas, coloured green (open session).
    const tile = screen.getByTestId("table-t1");
    expect(tile).toBeInTheDocument();
    expect(tile.className).toContain("bg-green-100");
    expect(screen.queryByTestId("table-t2")).toBeNull();
  });

  it("switches the visible tables when another area tab is clicked", async () => {
    render(<TablesPage />);
    await screen.findByTestId("area-tab-a2");
    fireEvent.click(screen.getByTestId("area-tab-a2"));
    expect(await screen.findByTestId("table-t2")).toBeInTheDocument();
    expect(screen.queryByTestId("table-t1")).toBeNull();
  });

  it("navigates to the table page on tap in default (view) mode", async () => {
    render(<TablesPage />);
    const tile = await screen.findByTestId("table-t1");
    fireEvent.click(tile);
    expect(routerPush).toHaveBeenCalledWith("/admin/tables/detail?tableId=t1");
  });

  it("hides the edit UI by default and reveals it via the toggle", async () => {
    render(<TablesPage />);
    await screen.findByTestId("area-tab-a1");
    // Add-table form + area edit buttons are hidden in view mode.
    expect(screen.queryByPlaceholderText("tables.namePlaceholder")).toBeNull();
    expect(screen.queryByLabelText("common.delete")).toBeNull();
    await enableEdit();
    expect(screen.getByPlaceholderText("tables.namePlaceholder")).toBeInTheDocument();
    expect(screen.getAllByLabelText("common.delete").length).toBeGreaterThan(0);
  });

  it("creates a table with the active area id and selected shape (edit mode)", async () => {
    apiMocks.createTable.mockResolvedValue({ ok: true, id: "t3" });
    render(<TablesPage />);
    await screen.findByTestId("area-tab-a1");
    await enableEdit();
    fireEvent.change(screen.getByPlaceholderText("tables.namePlaceholder"), { target: { value: "9" } });
    fireEvent.click(screen.getByText("tables.add"));
    await waitFor(() => expect(apiMocks.createTable).toHaveBeenCalledWith({ name: "9", areaId: "a1", shape: "rect" }));
  });

  it("surfaces the has_tables message when area deletion is blocked (409)", async () => {
    apiMocks.deleteArea.mockRejectedValue(new apiMocks.ApiError(409));
    window.confirm = () => true;
    render(<TablesPage />);
    await screen.findByTestId("area-tab-a1");
    await enableEdit();
    fireEvent.click(screen.getAllByLabelText("common.delete")[0]);
    expect(await screen.findByTestId("tables-error")).toHaveTextContent("tables.areaHasTables");
  });

  it("opens an action panel on tap and renames the table through it (edit mode)", async () => {
    apiMocks.updateTable.mockResolvedValue({ ok: true });
    render(<TablesPage />);
    await screen.findByTestId("area-tab-a1");
    await enableEdit();
    const tile = await screen.findByTestId("table-t1");
    // A tap = pointer down then up with no movement.
    fireEvent.pointerDown(tile, { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(tile, { clientX: 100, clientY: 100 });
    const panel = await screen.findByTestId("table-panel");
    expect(panel).toBeInTheDocument();
    const input = screen.getByLabelText("tables.renamePrompt");
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.click(screen.getByText("common.save"));
    await waitFor(() => expect(apiMocks.updateTable).toHaveBeenCalledWith("t1", { name: "42" }));
  });

  it("deletes a table through an inline confirm in the panel (edit mode)", async () => {
    apiMocks.deleteTable.mockResolvedValue({ ok: true });
    render(<TablesPage />);
    await screen.findByTestId("area-tab-a1");
    await enableEdit();
    const tile = await screen.findByTestId("table-t1");
    fireEvent.pointerDown(tile, { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(tile, { clientX: 100, clientY: 100 });
    await screen.findByTestId("table-panel");
    // First delete click asks for confirmation; the confirm button then fires the API.
    fireEvent.click(screen.getByText("common.delete"));
    fireEvent.click(screen.getByTestId("table-delete-confirm"));
    await waitFor(() => expect(apiMocks.deleteTable).toHaveBeenCalledWith("t1"));
  });
});
