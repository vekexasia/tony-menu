import type { Page } from '@playwright/test';
import { MOCK_RESTAURANT } from './admin-mock';

export function restaurantWithSelection(selection: boolean) {
  return {
    ...MOCK_RESTAURANT,
    features: { ...(MOCK_RESTAURANT.features ?? {}), selection, aiChat: false, aiVoice: false },
  };
}

export async function setupPublicMenuSelectionEnv(page: Page, selection: boolean) {
  await page.addInitScript((restaurant) => {
    window.__playwright_restaurant__ = restaurant;
    window.localStorage.clear();
  }, restaurantWithSelection(selection));
}

export async function setupMockAdminSettingsRoutes(page: Page, selectionEnabled: boolean) {
  let current = selectionEnabled;

  await page.route('**/health', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ commitSha: 'test' }),
  }));

  await page.route('**/admin/settings', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          chatAgentPrompt: '',
          aiChatEnabled: false,
          aiVoiceEnabled: false,
          selectionEnabled: current,
          promotionAlert: null,
          publicationState: 'published',
          primaryLocale: 'it',
          enabledLocales: null,
          disabledLocales: [],
          customLocales: [],
        }),
      });
    }

    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { selectionEnabled?: boolean };
      current = body.selectionEnabled ?? current;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }

    return route.continue();
  });
}
