import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Helper: build an SSE response body from events.
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

/**
 * Mock POST /session so the client gets an anonymous token without the real
 * worker. Must be installed before navigation (ChatPanel calls this on mount).
 */
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

/**
 * Mock the chat worker endpoint with a canned SSE response.
 */
async function mockChatEndpoint(page: Page, sseBody: string) {
  await mockChatSession(page);
  await page.route("**/chat", async (route: Route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        },
        body: sseBody,
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

/**
 * Dismiss the allergen notice that appears on load.
 * The promotion popup is skipped via sessionStorage (set in beforeEach).
 */
async function dismissOverlays(page: Page) {
  const okBtn = page.locator('button:text-is("OK")');
  if (await okBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await okBtn.click();
  }
  // Wait for framer-motion animations to settle
  await page.waitForTimeout(500);
}

/**
 * Open the chat panel by clicking the FAB.
 */
async function openChat(page: Page) {
  const fab = page.locator('button[aria-label="Open chat"]');
  await expect(fab).toBeVisible({ timeout: 5000 });
  // Use dispatchEvent because headlessui portal root may intercept pointer events
  await fab.dispatchEvent("click");
  // The open panel has a Close control in its header; assert on that rather than
  // the bot name, which now also appears in the footer ("Powered by TonyMenu").
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
}

/**
 * Send a chat message via the input.
 */
async function sendMessage(page: Page, text: string) {
  const input = page.getByPlaceholder("Chiedi a Tony del menu...");
  await input.focus();
  await input.pressSequentially(text, { delay: 10 });
  await page.keyboard.press("Enter");
}

test.describe("Chat", () => {
  test.beforeEach(async ({ page }) => {
    // Suppress promotion popup before the page loads
    await page.addInitScript(() => {
      sessionStorage.setItem("promo_seen_demo-restaurant", "1");
    });
    // Mock the anonymous session token BEFORE navigation: ChatPanel fires
    // ensureChatSession() on mount and caches the in-flight promise in a
    // module singleton, so the token must be mocked before the page loads or
    // sendMessage will reuse a real (hanging) session call.
    await mockChatSession(page);
    // Enable chat panel via dev override (?aiChat=1)
    await page.goto("/it/menu?aiChat=1");
    await dismissOverlays(page);
  });

  test("FAB is visible on menu page", async ({ page }) => {
    const fab = page.locator('button[aria-label="Open chat"]');
    await expect(fab).toBeVisible({ timeout: 5000 });
  });

  test("clicking FAB opens chat panel with welcome message", async ({
    page,
  }) => {
    await openChat(page);

    // Welcome text should be visible
    await expect(
      page.getByText(/Ciao, sono Tony/)
    ).toBeVisible();

    // Input should exist
    await expect(
      page.getByPlaceholder("Chiedi a Tony del menu...")
    ).toBeVisible();
  });

  test("closing chat panel shows FAB again", async ({ page }) => {
    await openChat(page);

    await page.locator('button[aria-label="Close"]').dispatchEvent("click");

    // FAB should reappear after exit animation
    const fab = page.locator('button[aria-label="Open chat"]');
    await expect(fab).toBeVisible({ timeout: 5000 });
  });

  test("sending message shows user bubble", async ({ page }) => {
    await mockChatEndpoint(
      page,
      buildSSE([
        { event: "text", data: { text: "Ecco i nostri migliori piatti!" } },
      ])
    );

    await openChat(page);
    await sendMessage(page, "Cosa mi consigli?");

    await expect(page.locator("text=Cosa mi consigli?")).toBeVisible();
  });

  test("assistant text response appears", async ({ page }) => {
    await mockChatEndpoint(
      page,
      buildSSE([
        {
          event: "text",
          data: { text: "Ti consiglio la Tagliata di manzo, ottima scelta!" },
        },
      ])
    );

    await openChat(page);
    await sendMessage(page, "Cosa mi consigli?");

    await expect(
      page.locator("text=Ti consiglio la Tagliata di manzo")
    ).toBeVisible();
  });

  test("show_items tool call renders item cards", async ({ page }) => {
    await mockChatEndpoint(
      page,
      buildSSE([
        {
          event: "tool_call",
          data: {
            name: "show_items",
            params: {
              item_ids: ["demo-entry-spaghetti", "demo-entry-burrata"],
            },
          },
        },
        {
          event: "text",
          data: { text: "Ecco due piatti che ti consiglio!" },
        },
      ])
    );

    await openChat(page);
    await sendMessage(page, "Cosa avete di buono?");

    // Text should appear
    await expect(
      page.locator("text=Ecco due piatti che ti consiglio!")
    ).toBeVisible();

    // Item cards render by looking the IDs up in the loaded catalog.
    const cards = page.locator(
      'button[class*="bg-gray-50"][class*="rounded-xl"]'
    );
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
  });

  test("error response shows error message", async ({ page }) => {
    await mockChatEndpoint(
      page,
      buildSSE([
        {
          event: "error",
          data: { message: "Something went wrong" },
        },
      ])
    );

    await openChat(page);
    await sendMessage(page, "test");

    await expect(
      page.locator("text=Error: Something went wrong")
    ).toBeVisible();
  });

  test("send button is disabled when input is empty", async ({ page }) => {
    await openChat(page);

    const sendBtn = page.locator('button[aria-label="Send"]');
    await expect(sendBtn).toBeDisabled();
  });

  test("input is disabled while streaming", async ({ page }) => {
    // Hold the route to simulate in-progress streaming
    let resolveRoute: (() => void) | null = null;
    const routeReady = new Promise<void>((resolve) => {
      resolveRoute = resolve;
    });

    await page.route("**/chat", async (route: Route) => {
      if (route.request().method() === "POST") {
        await routeReady;
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: buildSSE([
            { event: "text", data: { text: "Done!" } },
          ]),
        });
      } else {
        await route.continue();
      }
    });

    await openChat(page);
    await sendMessage(page, "Test streaming");

    // Input should be disabled while waiting
    const input = page.getByPlaceholder("Chiedi a Tony del menu...");
    await expect(input).toBeDisabled();

    // Release the response
    resolveRoute!();

    // After response, input should be enabled again
    await expect(input).toBeEnabled({ timeout: 5000 });
  });

  test("show_choices renders interactive choice buttons", async ({ page }) => {
    await mockChatEndpoint(
      page,
      buildSSE([
        {
          event: "tool_call",
          data: {
            name: "show_choices",
            params: {
              prompt: "Che tipo di piatto preferisci?",
              choices: ["Pesce", "Carne", "Pizza"],
              mode: "single",
            },
          },
        },
        {
          event: "text",
          data: { text: "Scegli una delle opzioni!" },
        },
      ])
    );

    await openChat(page);
    await sendMessage(page, "Non so cosa mangiare");

    // Prompt text should appear
    await expect(
      page.locator("text=Che tipo di piatto preferisci?")
    ).toBeVisible();

    // Choice buttons should render
    await expect(page.locator('button:text-is("Pesce")')).toBeVisible();
    await expect(page.locator('button:text-is("Carne")')).toBeVisible();
    await expect(page.locator('button:text-is("Pizza")')).toBeVisible();
  });

  test("clicking single choice sends it as message", async ({ page }) => {
    let callCount = 0;
    await page.route("**/chat", async (route: Route) => {
      if (route.request().method() === "POST") {
        callCount++;
        const body =
          callCount === 1
            ? buildSSE([
                {
                  event: "tool_call",
                  data: {
                    name: "show_choices",
                    params: {
                      prompt: "Pesce o Carne?",
                      choices: ["Pesce", "Carne"],
                      mode: "single",
                    },
                  },
                },
                { event: "text", data: { text: "Scegli!" } },
              ])
            : buildSSE([
                { event: "text", data: { text: "Ottimo, ecco i piatti di pesce!" } },
              ]);
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body,
        });
      } else {
        await route.continue();
      }
    });

    await openChat(page);
    await sendMessage(page, "Non so cosa mangiare");

    // Wait for choices to appear
    const pesceBtn = page.locator('button:text-is("Pesce")');
    await expect(pesceBtn).toBeVisible();

    // Click a choice (dispatchEvent to bypass headlessui portal overlay)
    await pesceBtn.dispatchEvent("click");

    // The selection should appear as a user message
    await expect(page.locator('[class*="bg-primary"]').filter({ hasText: "Pesce" })).toBeVisible();

    // Assistant responds to the choice
    await expect(
      page.locator("text=Ottimo, ecco i piatti di pesce!")
    ).toBeVisible();
  });

  test("multiple messages maintain conversation", async ({ page }) => {
    let callCount = 0;
    await page.route("**/chat", async (route: Route) => {
      if (route.request().method() === "POST") {
        callCount++;
        const body =
          callCount === 1
            ? buildSSE([
                { event: "text", data: { text: "Prima risposta!" } },
              ])
            : buildSSE([
                { event: "text", data: { text: "Seconda risposta!" } },
              ]);
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body,
        });
      } else {
        await route.continue();
      }
    });

    await openChat(page);

    // First exchange
    await sendMessage(page, "Primo messaggio");
    await expect(page.locator("text=Prima risposta!")).toBeVisible();

    // Second exchange
    await sendMessage(page, "Secondo messaggio");
    await expect(page.locator("text=Seconda risposta!")).toBeVisible();

    // All messages visible
    await expect(page.locator("text=Primo messaggio")).toBeVisible();
    await expect(page.locator("text=Secondo messaggio")).toBeVisible();
  });
});
