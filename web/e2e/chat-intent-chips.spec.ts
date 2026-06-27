import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Tests for the AI chat intent chips.
 *
 * Chips appear before the first message is sent and send a pre-canned message
 * when tapped. They're localized in IT / EN / DE.
 */

function buildSSE(
  events: Array<{ event: string; data: Record<string, unknown> }>
): string {
  return (
    events
      .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n`)
      .join("\n") +
    "\nevent: done\ndata: {}\n\n"
  );
}

async function mockChatSession(page: Page) {
  await page.route("**/session", async (route: Route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ token: "e2e-test-token", expiresAt: Date.now() + 3600_000 }),
      });
    } else if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    } else {
      await route.continue();
    }
  });
}

async function mockChatEndpoint(page: Page) {
  await mockChatSession(page);
  await page.route("**/chat", async (route: Route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" },
        body: buildSSE([{ event: "text", data: { text: "Risposta del menu." } }]),
      });
    } else if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    } else {
      await route.continue();
    }
  });
}

async function openChat(page: Page) {
  const fab = page.locator('button[aria-label="Open chat"]');
  await expect(fab).toBeVisible({ timeout: 8000 });
  await fab.dispatchEvent("click");
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
}

async function dismissOverlays(page: Page) {
  const okBtn = page.locator('button:text-is("OK")');
  if (await okBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await okBtn.click();
  }
  await page.waitForTimeout(300);
}

test.describe("Chat intent chips", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem("promo_seen_demo-restaurant", "1");
    });
    await mockChatEndpoint(page);
    await page.goto("/it/menu?aiChat=1");
    await dismissOverlays(page);
    await openChat(page);
  });

  test("all 6 chips are visible before first message", async ({ page }) => {
    const container = page.locator('[data-testid="intent-chips"]');
    await expect(container).toBeVisible();

    const chips = container.locator("button");
    await expect(chips).toHaveCount(6);
  });

  test("chips are hidden after sending a message", async ({ page }) => {
    // Send a message via the text input
    const input = page.getByPlaceholder("Chiedi a Tony del menu...");
    await input.fill("Ciao");
    await page.keyboard.press("Enter");

    // Wait for the assistant reply so streaming is complete
    await expect(page.locator("text=Risposta del menu.")).toBeVisible({ timeout: 5000 });

    // Chips should be gone
    await expect(page.locator('[data-testid="intent-chips"]')).toHaveCount(0);
  });

  test("tapping a chip sends the chip label as a message", async ({ page }) => {
    const chip = page.locator('[data-testid="chip-vegetarian"]');
    await expect(chip).toBeVisible();

    const chipLabel = await chip.textContent();
    await chip.dispatchEvent("click");

    // The chip label should appear as a user bubble
    await expect(
      page.locator('[class*="bg-primary"]').filter({ hasText: chipLabel! })
    ).toBeVisible({ timeout: 5000 });
  });

  test("chips are hidden after a chip is tapped", async ({ page }) => {
    const chip = page.locator('[data-testid="chip-winePairing"]');
    await chip.dispatchEvent("click");

    // Wait for streaming to finish
    await expect(page.locator("text=Risposta del menu.")).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="intent-chips"]')).toHaveCount(0);
  });

  test("Italian chips have correct localized labels", async ({ page }) => {
    // Already on /it/menu, so Italian labels apply
    await expect(page.locator('[data-testid="chip-whatIsLocal"]')).toHaveText("Cosa c'è di locale?");
    await expect(page.locator('[data-testid="chip-winePairing"]')).toHaveText("Abbinamento vino");
    await expect(page.locator('[data-testid="chip-vegetarian"]')).toHaveText("Vegetariano");
    await expect(page.locator('[data-testid="chip-noDairy"]')).toHaveText("Senza latticini");
    await expect(page.locator('[data-testid="chip-quickLunch"]')).toHaveText("Pranzo veloce");
    await expect(page.locator('[data-testid="chip-bestForKids"]')).toHaveText("Per bambini");
  });
});

test.describe("Chat intent chips — locale variants", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem("promo_seen_demo-restaurant", "1");
    });
    await mockChatEndpoint(page);
  });

  test("English chips have correct labels", async ({ page }) => {
    await page.goto("/en/menu?aiChat=1");
    await dismissOverlays(page);
    await openChat(page);

    await expect(page.locator('[data-testid="chip-whatIsLocal"]')).toHaveText("What is local?");
    await expect(page.locator('[data-testid="chip-winePairing"]')).toHaveText("Wine pairing");
    await expect(page.locator('[data-testid="chip-vegetarian"]')).toHaveText("Vegetarian");
    await expect(page.locator('[data-testid="chip-noDairy"]')).toHaveText("No dairy");
    await expect(page.locator('[data-testid="chip-quickLunch"]')).toHaveText("Quick lunch");
    await expect(page.locator('[data-testid="chip-bestForKids"]')).toHaveText("Best for kids");
  });

  test("German chips have correct labels", async ({ page }) => {
    await page.goto("/de/menu?aiChat=1");
    await dismissOverlays(page);
    await openChat(page);

    await expect(page.locator('[data-testid="chip-whatIsLocal"]')).toHaveText("Was ist regional?");
    await expect(page.locator('[data-testid="chip-winePairing"]')).toHaveText("Weinempfehlung");
    await expect(page.locator('[data-testid="chip-vegetarian"]')).toHaveText("Vegetarisch");
    await expect(page.locator('[data-testid="chip-noDairy"]')).toHaveText("Ohne Milchprodukte");
    await expect(page.locator('[data-testid="chip-quickLunch"]')).toHaveText("Schnelles Mittagessen");
    await expect(page.locator('[data-testid="chip-bestForKids"]')).toHaveText("Für Kinder");
  });
});
