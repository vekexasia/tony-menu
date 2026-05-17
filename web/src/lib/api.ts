/**
 * API client for the single-tenant Cloudflare backend.
 *
 * Environment variable: NEXT_PUBLIC_API_URL (defaults to localhost:8787 for dev).
 *
 * Authentication is handled by Cloudflare Access in front of both the frontend
 * and the backend worker. Requests against `/admin/*` ride along with the
 * `Cf-Access-Jwt-Assertion` header that Access adds; the backend verifies it.
 * `auth: true` on a fetch is now just a marker that this route requires Access
 * — the underlying request always sends `credentials: 'include'` so the
 * Access cookie travels cross-origin.
 */

import type {
  UpdateSettingsBody,
  UpdateHoursBody,
  UpdateCategoryBody,
  CreateEntryBody,
  UpdateEntryBody,
  CreateMenuBody,
  UpdateMenuBody,
  CreateLabelBody,
  UpdateLabelBody,
  CatalogResponse,
  MeResponse,
  AnalyticsResponse,
  ViewedItemRanked,
  MenuViewBreakdown,
  HourlyTotal,
  TranslateResponse,
  CreatedEntryResponse,
  ImageUploadResponse,
} from '@menu/schemas';

export type { CatalogResponse, MeResponse, AnalyticsResponse, ViewedItemRanked, MenuViewBreakdown, HourlyTotal };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';
const WEB_COMMIT_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA || 'dev';
const API_TIMEOUT_MS = 8000;

interface HealthResponse {
  commitSha?: string;
}

export interface DeploymentInfo {
  webCommitSha: string;
  apiCommitSha: string;
}

interface FetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, auth = false } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const fetchOptions: RequestInit = {
    method,
    headers: { ...headers },
    // Send cookies cross-origin so the Cloudflare Access session rides along
    // for /admin/* routes. Public routes don't need it but it's harmless.
    credentials: auth ? 'include' : 'same-origin',
    signal: controller.signal,
  };

  if (body !== undefined) {
    if (body instanceof ArrayBuffer) {
      fetchOptions.body = body;
      headers['Content-Type'] = headers['Content-Type'] || 'application/octet-stream';
    } else if (body instanceof Uint8Array) {
      fetchOptions.body = body.buffer as ArrayBuffer;
      headers['Content-Type'] = headers['Content-Type'] || 'application/octet-stream';
    } else {
      fetchOptions.body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
  }

  fetchOptions.headers = headers;

  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}${path}`, fetchOptions);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resp.ok) {
    const errorBody = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new ApiError(resp.status, (errorBody as Record<string, string>).error || resp.statusText);
  }

  return resp.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Public API ───────────────────────────────────────────────────────

/** Fetch the full public catalog. Cache-bust so admin edits are visible immediately. */
export function getCatalog() {
  return apiFetch<CatalogResponse>(`/catalog?t=${Date.now()}`);
}

/** Fetch an authenticated admin catalog preview, including draft/hidden items. */
export function getAdminCatalog() {
  return apiFetch<CatalogResponse>(`/admin/catalog`, { auth: true });
}

/** Get the current user's profile + admin status. */
export function getMe() {
  return apiFetch<MeResponse>('/admin/me', { auth: true });
}

export async function getDeploymentInfo(): Promise<DeploymentInfo> {
  try {
    const health = await apiFetch<HealthResponse>('/health');
    return {
      webCommitSha: WEB_COMMIT_SHA,
      apiCommitSha: health.commitSha || 'unknown',
    };
  } catch {
    return {
      webCommitSha: WEB_COMMIT_SHA,
      apiCommitSha: 'unknown',
    };
  }
}

// ── Admin API ────────────────────────────────────────────────────────

export interface CustomLocale {
  code: string;
  name: string;
}

export interface RestaurantSettingsResponse {
  chatAgentPrompt: string;
  aiChatEnabled: boolean;
  aiVoiceEnabled: boolean;
  selectionEnabled: boolean;
  promotionAlert: Record<string, unknown> | null;
  publicationState: string;
  primaryLocale: string;
  enabledLocales: string[] | null;
  disabledLocales: string[];
  customLocales: CustomLocale[];
}

export function fetchRestaurantSettings() {
  return apiFetch<RestaurantSettingsResponse>(`/admin/settings`, { auth: true });
}

export function updateRestaurantSettings(data: UpdateSettingsBody) {
  return apiFetch(`/admin/settings`, {
    method: 'PUT',
    body: data,
    auth: true,
  });
}

export function setMenuPublished(published: boolean) {
  return apiFetch(`/admin/publication`, {
    method: 'PUT',
    body: { published },
    auth: true,
  });
}

export function updateOpeningHours(openingSchedule: UpdateHoursBody['openingSchedule']) {
  return apiFetch(`/admin/hours`, {
    method: 'PUT',
    body: { openingSchedule },
    auth: true,
  });
}

// ── Menus ────────────────────────────────────────────────────────────

export interface AdminMenu {
  id: string;
  code: string;
  title: string;
  i18n: Record<string, Record<string, string>> | null;
  published: boolean;
  sortOrder: number;
  icon: string;
  availableFrom: string | null;
  availableTo: string | null;
  availableDays: Weekday[] | null;
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export function fetchMenus() {
  return apiFetch<{ menus: AdminMenu[] }>(`/admin/menus`, { auth: true });
}

export function createMenu(data: CreateMenuBody) {
  return apiFetch<CreatedEntryResponse>(`/admin/menus`, {
    method: 'POST',
    body: data,
    auth: true,
  });
}

export function updateMenu(menuId: string, data: UpdateMenuBody) {
  return apiFetch(`/admin/menus/${menuId}`, {
    method: 'PATCH',
    body: data,
    auth: true,
  });
}

export function deleteMenu(menuId: string) {
  return apiFetch(`/admin/menus/${menuId}`, {
    method: 'DELETE',
    auth: true,
  });
}

// ── Labels ────────────────────────────────────────────────────────────

export interface AdminLabel {
  id: string;
  name: string;
  color: 'primary' | 'green' | 'amber' | 'red' | 'gray';
  sortOrder: number;
  i18n: Record<string, Record<string, string>> | null;
}

export function fetchLabels() {
  return apiFetch<{ labels: AdminLabel[] }>(`/admin/labels`, { auth: true });
}

export function createLabel(data: CreateLabelBody) {
  return apiFetch<CreatedEntryResponse>(`/admin/labels`, {
    method: 'POST',
    body: data,
    auth: true,
  });
}

export function updateLabel(labelId: string, data: UpdateLabelBody) {
  return apiFetch(`/admin/labels/${labelId}`, {
    method: 'PATCH',
    body: data,
    auth: true,
  });
}

export function deleteLabel(labelId: string) {
  return apiFetch(`/admin/labels/${labelId}`, {
    method: 'DELETE',
    auth: true,
  });
}

export function reorderLabels(items: { id: string; order: number }[]) {
  return apiFetch(`/admin/labels/reorder`, {
    method: 'PATCH',
    body: { items },
    auth: true,
  });
}

export function reorderMenus(items: { id: string; order: number }[]) {
  return apiFetch(`/admin/menus/reorder`, {
    method: 'PATCH',
    body: { items },
    auth: true,
  });
}

// ── Categories / Entries ─────────────────────────────────────────────

export function createCategory(data: { name: string }) {
  return apiFetch<{ id: string }>(`/admin/categories`, {
    method: 'POST',
    body: data,
    auth: true,
  });
}

export function updateCategory(categoryId: string, data: UpdateCategoryBody) {
  return apiFetch(`/admin/categories/${categoryId}`, {
    method: 'PUT',
    body: data,
    auth: true,
  });
}

export function deleteCategory(categoryId: string) {
  return apiFetch(`/admin/categories/${categoryId}`, {
    method: 'DELETE',
    auth: true,
  });
}

export function reorderCategories(items: { id: string; order: number }[]) {
  return apiFetch(`/admin/categories/reorder`, {
    method: 'PATCH',
    body: { items },
    auth: true,
  });
}

export function createEntry(categoryId: string, data: CreateEntryBody) {
  return apiFetch<CreatedEntryResponse>(`/admin/categories/${categoryId}/entries`, {
    method: 'POST',
    body: data,
    auth: true,
  });
}

export function updateEntry(entryId: string, data: UpdateEntryBody) {
  const encodedEntryId = encodeURIComponent(entryId);
  return apiFetch(`/admin/entries/${encodedEntryId}`, {
    method: 'PUT',
    body: data,
    auth: true,
  });
}

export function reorderEntries(items: { id: string; order: number }[]) {
  return apiFetch(`/admin/entries/reorder`, {
    method: 'PATCH',
    body: { items },
    auth: true,
  });
}

export function deleteEntry(entryId: string) {
  const encodedEntryId = encodeURIComponent(entryId);
  return apiFetch(`/admin/entries/${encodedEntryId}`, {
    method: 'DELETE',
    auth: true,
  });
}

export function moveEntry(entryId: string, targetCategoryId: string) {
  const encodedEntryId = encodeURIComponent(entryId);
  return apiFetch(`/admin/entries/${encodedEntryId}/move`, {
    method: 'POST',
    body: { targetCategoryId },
    auth: true,
  });
}

export function uploadEntryImage(entryId: string, imageData: ArrayBuffer) {
  const encodedEntryId = encodeURIComponent(entryId);
  return apiFetch<ImageUploadResponse>(`/admin/entries/${encodedEntryId}/image`, {
    method: 'POST',
    body: imageData,
    headers: { 'Content-Type': 'image/jpeg' },
    auth: true,
  });
}

export function deleteEntryImage(entryId: string) {
  const encodedEntryId = encodeURIComponent(entryId);
  return apiFetch(`/admin/entries/${encodedEntryId}/image`, {
    method: 'DELETE',
    auth: true,
  });
}

export function uploadHeaderImage(imageData: ArrayBuffer) {
  return apiFetch<ImageUploadResponse>(`/admin/header-image`, {
    method: 'POST',
    body: imageData,
    headers: { 'Content-Type': 'image/jpeg' },
    auth: true,
  });
}

export function uploadPromotionImage(imageData: ArrayBuffer) {
  return apiFetch<ImageUploadResponse>(`/admin/promotion-image`, {
    method: 'POST',
    body: imageData,
    headers: { 'Content-Type': 'image/jpeg' },
    auth: true,
  });
}

export function uploadLocaleFlag(code: string, imageData: ArrayBuffer) {
  return apiFetch<{ ok: true; flagUrl: string }>(`/admin/locale-flag/${encodeURIComponent(code)}`, {
    method: 'POST',
    body: imageData,
    headers: { 'Content-Type': 'image/jpeg' },
    auth: true,
  });
}

export function deleteLocaleFlag(code: string) {
  return apiFetch<{ ok: true }>(`/admin/locale-flag/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    auth: true,
  });
}

export function publishCatalog() {
  return apiFetch(`/catalog/publish`, {
    method: 'POST',
    auth: true,
  });
}

// ── Analytics ────────────────────────────────────────────────────────

export function getAnalytics(
  period: '24h' | '7d' | '30d' | 'all' = '7d',
  limit = 10,
) {
  return apiFetch<AnalyticsResponse>(
    `/admin/analytics?period=${period}&limit=${limit}`,
    { auth: true },
  );
}

export function translateText(
  sourceText: string,
  targetLocale: string,
  field: string,
): Promise<TranslateResponse> {
  return apiFetch<TranslateResponse>(`/admin/translate`, {
    method: 'POST',
    body: { sourceText, targetLocale, field },
    auth: true,
  });
}

export async function downloadMenuExport(): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const resp = await fetch(`${API_BASE}/admin/export`, {
    credentials: 'include',
  });
  if (!resp.ok) throw new ApiError(resp.status, resp.statusText);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `menu-export-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function recordView(entryId: string): Promise<void> {
  // Returns a promise that resolves on success and rejects on failure.
  // Callers are responsible for adding a .catch() if they want fire-and-forget behavior.
  return apiFetch(`/catalog/view`, {
    method: 'POST',
    body: { entryId },
  }).then(() => {});
}
