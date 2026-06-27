import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";

// Translator that exercises the {name} interpolation path used by the modal.
const t = (key: string) => {
  const map: Record<string, string> = {
    "entries.delete.title": "Delete entry",
    "entries.delete.confirm": "Really delete {name}? This cannot be undone.",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.deleting": "Deleting...",
  };
  return map[key] ?? key;
};

describe("ConfirmDeleteModal", () => {
  it("interpolates and bolds the name inside the confirm copy", () => {
    render(<ConfirmDeleteModal name="Bruschetta" deleting={false} onCancel={() => {}} onConfirm={() => {}} t={t} />);
    expect(screen.getByText("Delete entry")).toBeInTheDocument();
    const bold = screen.getByText("Bruschetta");
    expect(bold.tagName).toBe("STRONG");
    // surrounding copy is preserved on both sides of the placeholder
    expect(screen.getByText(/Really delete/)).toBeInTheDocument();
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
  });

  it("fires onCancel and onConfirm from the respective buttons", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmDeleteModal name="X" deleting={false} onCancel={onCancel} onConfirm={onConfirm} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons and shows the deleting label while deleting", () => {
    render(<ConfirmDeleteModal name="X" deleting={true} onCancel={() => {}} onConfirm={() => {}} t={t} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    const confirm = screen.getByRole("button", { name: "Deleting..." });
    expect(confirm).toBeDisabled();
  });

  it("renders the name verbatim even when it contains no placeholder matches in copy", () => {
    // A name that itself contains '{name}' must not be re-interpolated.
    render(<ConfirmDeleteModal name="{name}" deleting={false} onCancel={() => {}} onConfirm={() => {}} t={t} />);
    expect(screen.getByText("{name}").tagName).toBe("STRONG");
  });
});
