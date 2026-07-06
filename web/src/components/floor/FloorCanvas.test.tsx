import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FloorCanvas, tileVisual, type FloorTile } from "./FloorCanvas";

const base: FloorTile = { id: "t1", name: "1", x: 100, y: 100, shape: "rect" };
const NOW = 1_000 * 60 * 60; // arbitrary fixed clock

describe("tileVisual", () => {
  it("gray with no open session", () => {
    expect(tileVisual({ ...base, sessionId: null }, NOW)).toEqual({ color: "gray", minutes: null });
  });

  it("green with an open session but no submitted orders", () => {
    expect(tileVisual({ ...base, sessionId: "s", oldestSubmittedAt: null }, NOW)).toEqual({ color: "green", minutes: null });
  });

  it("amber when the oldest submitted order is under 15 minutes", () => {
    const v = tileVisual({ ...base, sessionId: "s", oldestSubmittedAt: NOW - 12 * 60000 }, NOW);
    expect(v).toEqual({ color: "amber", minutes: 12 });
  });

  it("red at or beyond 15 minutes", () => {
    expect(tileVisual({ ...base, sessionId: "s", oldestSubmittedAt: NOW - 15 * 60000 }, NOW).color).toBe("red");
    expect(tileVisual({ ...base, sessionId: "s", oldestSubmittedAt: NOW - 40 * 60000 }, NOW).minutes).toBe(40);
  });
});

describe("FloorCanvas", () => {
  it("renders the elapsed minutes label for amber/red tiles", () => {
    render(<FloorCanvas editable={false} now={NOW} tiles={[{ ...base, sessionId: "s", oldestSubmittedAt: NOW - 12 * 60000 }]} />);
    expect(screen.getByTestId("table-mins-t1")).toHaveTextContent("12m");
  });

  it("shows no minutes label for green/gray tiles", () => {
    render(<FloorCanvas editable={false} now={NOW} tiles={[{ ...base, sessionId: "s", oldestSubmittedAt: null }]} />);
    expect(screen.queryByTestId("table-mins-t1")).toBeNull();
  });
});
