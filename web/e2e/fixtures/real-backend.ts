import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API_URL = process.env.NEXT_PUBLIC_API_URL;
const API_BASE = API_URL ?? 'http://localhost:8787';
export const BRUSCHETTA_ID = 'demo-entry-bruschetta';
export const PROSECCO_ID = 'demo-entry-prosecco';

// Seeded demo fixtures (see backend/src/lib/demo-seed-data.ts). Restored by resetDemo.
export const SEEDED_TABLE = { id: 'demo-table-sala-1', name: 'Sala 1' };
export const SEEDED_CUCINA = { id: 'demo-dest-cucina', name: 'Cucina' };
export const SEEDED_BAR = { id: 'demo-dest-bar', name: 'Bar' };

let ip = 1;
export function e2eIp() {
  ip = (ip % 200) + 1;
  const n = Date.now();
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${ip}`;
}

export async function setE2eIp(page: Page) {
  await page.setExtraHTTPHeaders({ 'cf-connecting-ip': e2eIp() });
}

type Ordering = { enabled: boolean; mode: 'summary' | 'send'; submitMode: 'diner' | 'waiter' | 'both' };

export async function resetDemo(request: APIRequestContext) {
  const res = await request.post(`${API_BASE}/admin/demo/reset`);
  expect(res.ok()).toBeTruthy();
}

export async function setOrdering(request: APIRequestContext, ordering: Ordering) {
  const res = await request.put(`${API_BASE}/admin/modules`, {
    data: { ordering, ai: { enabled: false, voiceEnabled: false }, analytics: { enabled: true } },
  });
  expect(res.ok()).toBeTruthy();
}

export async function createStaffLink(request: APIRequestContext, name = `e2e waiter ${Date.now()}`) {
  const res = await request.post(`${API_BASE}/admin/staff-links`, { data: { name } });
  expect(res.ok()).toBeTruthy();
  return await res.json() as { ok: true; id: string; token: string };
}

export async function revokeStaffLink(request: APIRequestContext, id: string) {
  const res = await request.post(`${API_BASE}/admin/staff-links/${id}/revoke`);
  expect(res.ok()).toBeTruthy();
}

export async function createTable(request: APIRequestContext, name = `E2E Table ${Date.now()}`) {
  const res = await request.post(`${API_BASE}/admin/tables`, { data: { name, active: true } });
  expect(res.ok()).toBeTruthy();
  return { ...(await res.json() as { ok: true; id: string }), name };
}

export async function createDestination(request: APIRequestContext, name: string) {
  const res = await request.post(`${API_BASE}/admin/order-destinations`, { data: { name } });
  expect(res.ok()).toBeTruthy();
  return await res.json() as { ok: true; id: string };
}

export async function updateEntry(request: APIRequestContext, entryId: string, data: Record<string, unknown>) {
  const res = await request.put(`${API_BASE}/admin/entries/${entryId}`, { data });
  expect(res.ok()).toBeTruthy();
}

export async function submitLinesApi(request: APIRequestContext, lines: { entryId: string; quantity: number }[]) {
  const res = await request.post(`${API_BASE}/orders`, {
    headers: { 'cf-connecting-ip': e2eIp() },
    data: { idempotencyKey: crypto.randomUUID(), lines },
  });
  expect(res.ok()).toBeTruthy();
  return await res.json() as { ok: true; orderId: string; dailyNumber: number };
}

export async function submitOrderApi(request: APIRequestContext, entryId = BRUSCHETTA_ID, headers?: Record<string, string>, tableSessionId?: string) {
  const res = await request.post(`${API_BASE}/orders`, {
    headers: { 'cf-connecting-ip': e2eIp(), ...headers },
    data: {
      idempotencyKey: crypto.randomUUID(),
      lines: [{ entryId, quantity: 2 }],
      ...(tableSessionId ? { tableSessionId } : {}),
    },
  });
  expect(res.ok()).toBeTruthy();
  return await res.json() as { ok: true; orderId: string; dailyNumber: number };
}

export async function createIntentApi(request: APIRequestContext, entryId = BRUSCHETTA_ID) {
  const res = await request.post(`${API_BASE}/orders/intents`, {
    headers: { 'cf-connecting-ip': e2eIp() },
    data: { lines: [{ entryId, quantity: 2 }] },
  });
  expect(res.ok()).toBeTruthy();
  return await res.json() as { ok: true; token: string; expiresAt: number };
}

export async function consumeStaffLinkApi(request: APIRequestContext, token: string) {
  const res = await request.post(`${API_BASE}/staff/consume`, { headers: { 'cf-connecting-ip': e2eIp() }, data: { token } });
  expect(res.ok()).toBeTruthy();
  return await res.json() as { ok: true; sessionToken: string; name: string };
}

export async function consumeIntentApi(request: APIRequestContext, token: string, staffSession: string) {
  const res = await request.post(`${API_BASE}/staff/order-intents/${token}/consume`, {
    headers: { 'X-Staff-Session': staffSession },
  });
  expect(res.ok()).toBeTruthy();
  return await res.json() as { ok: true; orderId: string; dailyNumber: number };
}

export async function addBruschettaFromMenu(page: Page) {
  await page.goto('/it/menu');
  await page.waitForLoadState('domcontentloaded');
  await dismissPopups(page);
  await page.getByText(/bruschetta/i).first().click();
  await page.getByRole('button', { name: /aggiungi alla selezione/i }).click();
  await page.keyboard.press('Escape');
}

export async function dismissPopups(page: Page) {
  const modal = page.locator('.fixed.inset-0').first();
  await modal.waitFor({ state: 'attached', timeout: 3000 }).catch(() => undefined);
  const modalButton = modal.locator('button').first();
  if (await modalButton.count()) {
    await modalButton.click({ force: true });
    await expect(page.locator('.fixed.inset-0')).toHaveCount(0, { timeout: 3000 }).catch(() => undefined);
  }
}
