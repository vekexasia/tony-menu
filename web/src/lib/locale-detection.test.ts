import { describe, it, expect } from "vitest";
import { resolveInitialLocale } from "./locale-detection";

const locales = ["it", "en", "de", "fr"] as const;
const defaultLocale = "it";

describe("resolveInitialLocale", () => {
  it("returns stored when it is a valid locale", () => {
    expect(
      resolveInitialLocale({ stored: "en", preferredLanguages: [], locales, defaultLocale })
    ).toBe("en");
  });

  it("ignores invalid stored and falls through to browser languages", () => {
    expect(
      resolveInitialLocale({
        stored: "zz",
        preferredLanguages: ["de-DE", "de"],
        locales,
        defaultLocale,
      })
    ).toBe("de");
  });

  it("matches first preferredLanguage whose base subtag is a locale", () => {
    expect(
      resolveInitialLocale({
        stored: null,
        preferredLanguages: ["de-DE", "fr"],
        locales,
        defaultLocale,
      })
    ).toBe("de");
  });

  it("prefers stored over preferredLanguages when both valid", () => {
    expect(
      resolveInitialLocale({
        stored: "en",
        preferredLanguages: ["de-DE", "fr"],
        locales,
        defaultLocale,
      })
    ).toBe("en");
  });

  it("returns defaultLocale when nothing matches", () => {
    expect(
      resolveInitialLocale({
        stored: "",
        preferredLanguages: ["ja-JP", "ko"],
        locales,
        defaultLocale,
      })
    ).toBe("it");
  });
});
