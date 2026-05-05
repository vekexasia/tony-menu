import { describe, expect, it } from "vitest";
import { getBundledFlagSvg, svgToDataUrl } from "./locale-flags";

describe("locale-flags", () => {
  it("returns SVG strings for standard locales", () => {
    for (const code of ["it", "en", "de", "fr", "es", "nl", "ru", "pt", "hu"]) {
      const svg = getBundledFlagSvg(code);
      expect(svg, `missing flag for ${code}`).toBeTruthy();
      expect(svg).toMatch(/^<svg/);
    }
  });

  it("returns null for unknown locales", () => {
    expect(getBundledFlagSvg("vec")).toBeNull();
    expect(getBundledFlagSvg("zz")).toBeNull();
  });

  it("converts SVG to a data URL", () => {
    const url = svgToDataUrl("<svg/>");
    expect(url.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    expect(url).toContain(encodeURIComponent("<svg/>"));
  });
});
