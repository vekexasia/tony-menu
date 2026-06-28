import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { I18nProvider } from "@/lib/i18n";
import { TranslationTabs, type TranslationField } from "./TranslationTabs";

const apiMocks = vi.hoisted(() => ({ translateText: vi.fn() }));
vi.mock("@/lib/api", () => apiMocks);

// Controlled parent: mirrors how the admin pages own the i18n state. This is
// what makes the stale-closure path observable — onI18nChange updates state and
// re-renders, but an in-flight translate-all closes over the i18n it started with.
function Harness({ fields }: { fields: TranslationField[] }) {
  const [i18n, setI18n] = useState<Record<string, Record<string, string>>>({});
  return (
    <I18nProvider locale="en">
      <TranslationTabs
        activeTab="en"
        onTabChange={() => {}}
        primaryLocale="it"
        fields={fields}
        i18n={i18n}
        onI18nChange={setI18n}
      >
        <div>primary</div>
      </TranslationTabs>
    </I18nProvider>
  );
}

beforeEach(() => {
  apiMocks.translateText.mockReset();
});

describe("TranslationTabs translate-all stale-closure guard", () => {
  it("writes ALL translated fields, not just the last (regresses if setValue is called per-await)", async () => {
    // Each field resolves to a distinct value so a lost write is visible.
    apiMocks.translateText.mockImplementation((_src: string, _loc: string, field: string) =>
      Promise.resolve({ translatedText: `${field}-EN` }),
    );

    const fields: TranslationField[] = [
      { key: "name", label: "Name", sourceValue: "Pane" },
      { key: "desc", label: "Desc", sourceValue: "Pane tostato" },
    ];

    render(<Harness fields={fields} />);

    // The "Translate everything to English" button drives translateAllFields.
    fireEvent.click(screen.getByText(/Translate everything/i));

    // Both translated inputs must end up populated. Under the stale-closure bug
    // the first write (name) is overwritten by the second (desc), so name stays empty.
    await waitFor(() => {
      expect(screen.getByDisplayValue("name-EN")).toBeInTheDocument();
      expect(screen.getByDisplayValue("desc-EN")).toBeInTheDocument();
    });
  });
});
