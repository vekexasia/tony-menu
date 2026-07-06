import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

const apiMocks = vi.hoisted(() => ({
  ApiError: class ApiError extends Error { status = 500; constructor(status: number) { super(); this.status = status; } },
  fetchAreas: vi.fn(),
  fetchTables: vi.fn(),
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
const tables = [
  { id: "t1", name: "1", active: true, sortOrder: 0, areaId: "a1", x: 50, y: 50, shape: "rect" as const },
  { id: "t2", name: "2", active: true, sortOrder: 1, areaId: "a2", x: 50, y: 50, shape: "circle" as const },
];

beforeEach(() => {
  for (const m of Object.values(apiMocks)) if (typeof m === "function" && "mockReset" in m) (m as ReturnType<typeof vi.fn>).mockReset();
  apiMocks.fetchAreas.mockResolvedValue({ areas });
  apiMocks.fetchTables.mockResolvedValue({ tables });
});

describe("TablesPage", () => {
  it("renders an area tab per area and shows the active area's tables", async () => {
    render(<TablesPage />);
    await screen.findByTestId("area-tab-a1");
    expect(screen.getByTestId("area-tab-a2")).toBeInTheDocument();
    // First area active by default: its table "1" shows on the canvas.
    expect(screen.getByTestId("table-t1")).toBeInTheDocument();
    expect(screen.queryByTestId("table-t2")).toBeNull();
  });

  it("switches the visible tables when another area tab is clicked", async () => {
    render(<TablesPage />);
    await screen.findByTestId("area-tab-a2");
    fireEvent.click(screen.getByTestId("area-tab-a2"));
    expect(await screen.findByTestId("table-t2")).toBeInTheDocument();
    expect(screen.queryByTestId("table-t1")).toBeNull();
  });

  it("creates a table with the active area id and selected shape", async () => {
    apiMocks.createTable.mockResolvedValue({ ok: true, id: "t3" });
    render(<TablesPage />);
    await screen.findByTestId("area-tab-a1");
    fireEvent.change(screen.getByPlaceholderText("tables.namePlaceholder"), { target: { value: "9" } });
    fireEvent.click(screen.getByText("tables.add"));
    await waitFor(() => expect(apiMocks.createTable).toHaveBeenCalledWith({ name: "9", areaId: "a1", shape: "rect" }));
  });

  it("surfaces the has_tables message when area deletion is blocked (409)", async () => {
    apiMocks.deleteArea.mockRejectedValue(new apiMocks.ApiError(409));
    window.confirm = () => true;
    render(<TablesPage />);
    await screen.findByTestId("area-tab-a1");
    fireEvent.click(screen.getAllByLabelText("common.delete")[0]);
    expect(await screen.findByTestId("tables-error")).toHaveTextContent("tables.areaHasTables");
  });
});
