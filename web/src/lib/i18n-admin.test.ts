import { describe, expect, it } from "vitest";
import { sanitizeI18nData } from "./i18n-admin";

describe("sanitizeI18nData", () => {
  it("keeps locales with a non-empty name or desc", () => {
    expect(sanitizeI18nData({ en: { name: "Bread", desc: "Toasted" } })).toEqual({
      en: { name: "Bread", desc: "Toasted" },
    });
  });

  it("drops null and missing fields", () => {
    expect(sanitizeI18nData({ en: { name: "Bread", desc: null } })).toEqual({
      en: { name: "Bread" },
    });
  });

  it("drops whitespace-only fields", () => {
    expect(sanitizeI18nData({ en: { name: "   ", desc: "Real" } })).toEqual({
      en: { desc: "Real" },
    });
  });

  it("removes a locale entirely when it has no usable fields", () => {
    expect(sanitizeI18nData({ en: { name: "", desc: null }, de: { name: "Brot" } })).toEqual({
      de: { name: "Brot" },
    });
  });

  it("preserves the original value (no trimming of inner content)", () => {
    expect(sanitizeI18nData({ en: { name: " Bread " } })).toEqual({
      en: { name: " Bread " },
    });
  });

  it("returns an empty object for null/undefined input", () => {
    expect(sanitizeI18nData(null)).toEqual({});
    expect(sanitizeI18nData(undefined)).toEqual({});
  });

  it("ignores non-string field types", () => {
    expect(sanitizeI18nData({ en: { name: 5 as unknown as string } })).toEqual({});
  });
});
