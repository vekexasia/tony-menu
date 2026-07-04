import { test, expect } from "@playwright/test";
import type { NormalizedModulesConfig } from "@menu/schemas";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

test.describe("Admin modules — ordering setting", () => {
  test.skip(!API_URL, "Skipped: NEXT_PUBLIC_API_URL not set");

  test("shows the ordering module and saves enabled state", async ({ page, request }) => {
    const initialRes = await request.get(`${API_URL}/admin/modules`);
    expect(initialRes.ok()).toBeTruthy();
    const initial = ((await initialRes.json()) as { modules: NormalizedModulesConfig }).modules;

    try {
      await page.goto("/admin/modules");
      await page.waitForLoadState("domcontentloaded");

      const orderingCard = page.locator("section", { has: page.getByRole("heading", { name: "Ordering" }) });
      await expect(orderingCard).toBeVisible({ timeout: 10000 });
      const toggle = orderingCard.getByRole("checkbox").first();
      await expect(toggle).toBeChecked({ checked: initial.ordering.enabled });

      const putRequest = page.waitForRequest(
        (req) => req.url().includes("/admin/modules") && req.method() === "PUT",
      );
      await toggle.setChecked(!initial.ordering.enabled);

      const requestBody = (await putRequest).postDataJSON() as NormalizedModulesConfig;
      expect(requestBody.ordering.enabled).toBe(!initial.ordering.enabled);
      await expect(toggle).toBeChecked({ checked: !initial.ordering.enabled });
    } finally {
      await request.put(`${API_URL}/admin/modules`, { data: initial });
    }
  });
});
