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
  NormalizedModulesConfig,
  ModulesConfig,
  ImageUploadResponse,
  SubmitOrderBody,
  SubmitOrderLine,
  SubmitOrderResponse,
  UpdateOrderStatusBody,
  CreateOrderIntentBody,
  CreateOrderIntentResponse,
  OrderIntentReviewResponse,
  CreateStaffLinkBody,
  CreatedStaffLinkResponse,
  StaffLinkSummary,
  ConsumeStaffLinkResponse,
  CreateTableBody,
  UpdateTableBody,
  AdminTable,
  FloorTable,
  TableSessionDetail,
} from '@menu/schemas';

export type { CatalogResponse, MeResponse, AnalyticsResponse, ViewedItemRanked, MenuViewBreakdown, HourlyTotal };
export type { StaffLinkSummary, AdminTable, FloorTable, TableSessionDetail, ConsumeStaffLinkResponse } from '@menu/schemas';

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
  /** Attach the stored staff session token (waiter mode, #15). */
  staff?: boolean;
}

// ── Staff session (waiter mode, #15) ─────────────────────────────────

const STAFF_SESSION_KEY = 'tony-menu-staff-session';

export function getStaffSession(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STAFF_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setStaffSession(token: string): void {
  try {
    window.localStorage.setItem(STAFF_SESSION_KEY, token);
  } catch {
    // ignore
  }
}

export function clearStaffSession(): void {
  try {
    window.localStorage.removeItem(STAFF_SESSION_KEY);
  } catch {
    // ignore
  }
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, auth = false, staff = false } = options;

  if (staff) {
    const token = getStaffSession();
    if (token) headers['X-Staff-Session'] = token;
  }

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
    throw new ApiError(resp.status, (errorBody as Record<string, string>).error || resp.statusText, errorBody);
  }

  return resp.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Parsed error response body, e.g. { error: 'stale_items', staleEntryIds } */
    public body?: unknown,
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

/**
 * Submit an order (public, rate-limited, idempotent via idempotencyKey).
 * With a tableSessionId (waiter mode, #15) it also sends the staff session
 * header so the shared /orders route authenticates the waiter.
 */
export function submitOrder(body: SubmitOrderBody) {
  return apiFetch<SubmitOrderResponse>('/orders', { method: 'POST', body, staff: !!body.tableSessionId });
}

/** Create a waiter-handoff order intent (public); the token goes into the QR link. */
export function createOrderIntent(body: CreateOrderIntentBody) {
  return apiFetch<CreateOrderIntentResponse>('/orders/intents', { method: 'POST', body });
}

/** Load an order intent for waiter review (staff, #15). Lines reflect the current menu. */
export function fetchOrderIntent(token: string) {
  return apiFetch<OrderIntentReviewResponse>(`/staff/order-intents/${encodeURIComponent(token)}`, { staff: true });
}

/** Consume an intent into a real order (staff). 409: expired | consumed | stale_items. Optional table session + edited lines override. */
export function consumeOrderIntent(token: string, opts?: { tableSessionId?: string; lines?: SubmitOrderLine[] }) {
  const body: Record<string, unknown> = {};
  if (opts?.tableSessionId) body.tableSessionId = opts.tableSessionId;
  if (opts?.lines) body.lines = opts.lines;
  return apiFetch<SubmitOrderResponse>(`/staff/order-intents/${encodeURIComponent(token)}/consume`, {
    method: 'POST',
    body: Object.keys(body).length > 0 ? body : undefined,
    staff: true,
  });
}

// ── Staff / waiter mode (#15) ────────────────────────────────

/** Exchange a one-use link token for a session (public). */
export function consumeStaffLink(token: string) {
  return apiFetch<ConsumeStaffLinkResponse>('/staff/consume', { method: 'POST', body: { token } });
}

/** Verify the stored staff session is still valid. */
export function checkStaffSession() {
  return apiFetch<{ ok: true; name: string }>('/staff/session', { staff: true });
}

export function fetchFloor() {
  return apiFetch<{ tables: FloorTable[] }>('/staff/floor', { staff: true });
}

export function openTableSession(tableId: string) {
  return apiFetch<{ ok: true; sessionId: string }>(`/staff/tables/${encodeURIComponent(tableId)}/session`, { method: 'POST', staff: true });
}

export function closeTableSession(sessionId: string) {
  return apiFetch<{ ok: true }>(`/staff/sessions/${encodeURIComponent(sessionId)}/close`, { method: 'POST', staff: true });
}

export function fetchTableSession(sessionId: string) {
  return apiFetch<TableSessionDetail>(`/staff/sessions/${encodeURIComponent(sessionId)}`, { staff: true });
}

export function serveStaffOrder(orderId: string) {
  return apiFetch<{ ok: true; status: string }>(`/staff/orders/${encodeURIComponent(orderId)}/serve`, { method: 'PATCH', staff: true });
}

// ── Admin: staff links + tables (#15) ────────────────────────

export function fetchStaffLinks() {
  return apiFetch<{ links: StaffLinkSummary[] }>('/admin/staff-links', { auth: true });
}

export function createStaffLink(data: CreateStaffLinkBody) {
  return apiFetch<CreatedStaffLinkResponse>('/admin/staff-links', { method: 'POST', body: data, auth: true });
}

export function revokeStaffLink(id: string) {
  return apiFetch(`/admin/staff-links/${encodeURIComponent(id)}/revoke`, { method: 'POST', auth: true });
}

export function fetchTables() {
  return apiFetch<{ tables: AdminTable[] }>('/admin/tables', { auth: true });
}

export function createTable(data: CreateTableBody) {
  return apiFetch<{ ok: true; id: string }>('/admin/tables', { method: 'POST', body: data, auth: true });
}

export function updateTable(id: string, data: UpdateTableBody) {
  return apiFetch(`/admin/tables/${encodeURIComponent(id)}`, { method: 'PATCH', body: data, auth: true });
}

export function deleteTable(id: string) {
  return apiFetch(`/admin/tables/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true });
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

export function fetchModules() {
  return apiFetch<{ modules: NormalizedModulesConfig }>(`/admin/modules`, { auth: true });
}

export function updateModules(data: ModulesConfig) {
  return apiFetch<{ ok: boolean; modules: NormalizedModulesConfig }>(`/admin/modules`, {
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

// ── Kitchen board / order destinations (#18) ────────────────────────

export interface AdminOrderItemDestination {
  id: string;
  destinationId: string | null;
  destinationName: string;
  printedAt: number | null;
}

export interface AdminOrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  destinations: AdminOrderItemDestination[];
}

export interface AdminOrder {
  id: string;
  dailyNumber: number;
  status: 'submitted' | 'ready' | 'served' | 'rejected';
  rejectReason: string | null;
  createdAt: number;
  updatedAt: number;
  tableName: string | null;
  submittedBy: string | null;
  items: AdminOrderItem[];
}

export function fetchAdminOrders(day?: number) {
  const qs = day ? `?day=${day}` : '';
  return apiFetch<{ day: number; orders: AdminOrder[] }>(`/admin/orders${qs}`, { auth: true });
}

export function updateOrderStatus(orderId: string, body: UpdateOrderStatusBody) {
  return apiFetch<{ ok: true; status: string }>(`/admin/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    body,
    auth: true,
  });
}

export function setDestinationPrinted(rowId: string, printed: boolean) {
  return apiFetch<{ ok: true; printedAt: number | null }>(`/admin/order-item-destinations/${encodeURIComponent(rowId)}/printed`, {
    method: 'PATCH',
    body: { printed },
    auth: true,
  });
}

export interface AdminOrderDestination {
  id: string;
  name: string;
  sortOrder: number;
}

export function fetchOrderDestinations() {
  return apiFetch<{ destinations: AdminOrderDestination[] }>(`/admin/order-destinations`, { auth: true });
}

export function createOrderDestination(name: string) {
  return apiFetch<CreatedEntryResponse>(`/admin/order-destinations`, { method: 'POST', body: { name }, auth: true });
}

export function updateOrderDestination(id: string, name: string) {
  return apiFetch(`/admin/order-destinations/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name }, auth: true });
}

export function deleteOrderDestination(id: string) {
  return apiFetch(`/admin/order-destinations/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true });
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
