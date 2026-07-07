import type {
  CreatedEntryResponse,
  CreateOrderIntentBody,
  CreateOrderIntentResponse,
  OrderIntentReviewResponse,
  SubmitOrderBody,
  SubmitOrderLine,
  SubmitOrderResponse,
  UpdateOrderStatusBody,
} from '@menu/schemas';
import { apiFetch } from '@/lib/api';

export type { SubmitOrderLine };

export function submitOrder(body: SubmitOrderBody) {
  return apiFetch<SubmitOrderResponse>('/orders', { method: 'POST', body, staff: !!body.tableSessionId });
}

export function createOrderIntent(body: CreateOrderIntentBody) {
  return apiFetch<CreateOrderIntentResponse>('/orders/intents', { method: 'POST', body });
}

export function fetchOrderIntent(token: string) {
  return apiFetch<OrderIntentReviewResponse>(`/staff/order-intents/${encodeURIComponent(token)}`, { staff: true });
}

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
