import { test, expect } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const PUBLISHING = "/admin/settings/publishing";

test.describe("Admin publish toggle", () => {
  test.skip(!API_URL, "Skipped: NEXT_PUBLIC_API_URL not set");

  test("publishing settings toggles via the real backend", async ({ page, request }) => {
    const settingsRes = await request.get(`${API_URL}/admin/settings`);
    expect(settingsRes.ok()).toBeTruthy();
    const wasPublished = ((await settingsRes.json()) as { publicationState: string }).publicationState === "published";

    try {
      await page.goto(PUBLISHING);
      await page.waitForLoadState("networkidle");

      const toggle = page.getByRole("button", { name: /publish menu|hide menu|pubblica menu|nascondi menu/i });
      await expect(toggle).toBeVisible({ timeout: 15000 });
      const initial = (await toggle.textContent())?.trim() ?? "";

      const putRequest = page.waitForRequest(
        (req) => req.url().includes("/admin/publication") && req.method() === "PUT",
        { timeout: 15000 },
      );
      await toggle.click();
      expect((await putRequest).method()).toBe("PUT");

      await expect(page.getByRole("button", { name: /publish menu|hide menu|pubblica menu|nascondi menu/i })).not.toHaveText(initial);
    } finally {
      await request.put(`${API_URL}/admin/publication`, { data: { published: wasPublished } });
    }
  });
});
