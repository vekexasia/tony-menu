import { z } from 'zod';

// ── Public order submit ─────────────────────────────────────────────

export const SubmitOrderLineSchema = z.object({
  entryId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});
export type SubmitOrderLine = z.infer<typeof SubmitOrderLineSchema>;

export const SubmitOrderBodySchema = z.object({
  /** Client-generated key: retries of the same submit return the same order. */
  idempotencyKey: z.string().min(8).max(128),
  lines: z.array(SubmitOrderLineSchema).min(1).max(100),
  /** Optional table session (#15): set when a waiter orders for a table. */
  tableSessionId: z.string().min(1).optional(),
});
export type SubmitOrderBody = z.infer<typeof SubmitOrderBodySchema>;

export interface SubmitOrderResponse {
  ok: true;
  orderId: string;
  dailyNumber: number;
}

/** 409 payload when the selection contains hidden/out-of-stock/deleted items. */
export interface StaleItemsErrorResponse {
  error: 'stale_items';
  staleEntryIds: string[];
}

// ── Order lifecycle (kitchen board, #18) ────────────────────────────

export const ORDER_STATUSES = ['submitted', 'ready', 'served', 'rejected'] as const;
export const OrderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/** Legal whole-order transitions: submitted → ready → served, or reject. */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  submitted: ['ready', 'rejected'],
  ready: ['served', 'rejected'],
  served: [],
  rejected: [],
};

export const UpdateOrderStatusBodySchema = z
  .object({
    status: z.enum(['ready', 'served', 'rejected']),
    rejectReason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((b) => b.status !== 'rejected' || !!b.rejectReason, {
    message: 'rejectReason is required when rejecting',
  });
export type UpdateOrderStatusBody = z.infer<typeof UpdateOrderStatusBodySchema>;

/** Toggle a per-item-per-destination row's printed/done state. */
export const SetDestinationPrintedBodySchema = z.object({ printed: z.boolean() });
export type SetDestinationPrintedBody = z.infer<typeof SetDestinationPrintedBodySchema>;

// ── Order destinations CRUD (admin) ─────────────────────────────────

export const CreateOrderDestinationBodySchema = z.object({
  name: z.string().trim().min(1).max(50),
});
export type CreateOrderDestinationBody = z.infer<typeof CreateOrderDestinationBodySchema>;

export const UpdateOrderDestinationBodySchema = z.object({
  name: z.string().trim().min(1).max(50),
});
export type UpdateOrderDestinationBody = z.infer<typeof UpdateOrderDestinationBodySchema>;

// ── Waiter QR handoff: order intents (#19) ───────────────────

export const CreateOrderIntentBodySchema = z.object({
  lines: z.array(SubmitOrderLineSchema).min(1).max(100),
});
export type CreateOrderIntentBody = z.infer<typeof CreateOrderIntentBodySchema>;

export interface CreateOrderIntentResponse {
  ok: true;
  /** Opaque token — the QR encodes a link to the admin review page for it. */
  token: string;
  /** Unix ms expiry (30 minutes from creation). */
  expiresAt: number;
}

/** One intent line resolved against the CURRENT menu at review time. */
export interface OrderIntentReviewLine {
  entryId: string;
  quantity: number;
  /** Current entry name, or null when the entry was deleted. */
  name: string | null;
  /** Current price in cents, or null when the entry was deleted. */
  price: number | null;
  /** Hidden, out of stock, or deleted — blocks submit until removed by the diner. */
  unavailable: boolean;
}

export interface OrderIntentReviewResponse {
  token: string;
  status: 'pending' | 'expired' | 'consumed';
  expiresAt: number;
  consumedAt: number | null;
  lines: OrderIntentReviewLine[];
}

/**
 * Consume body (staff): required table binding plus optional lines override.
 * When `lines` is present the waiter's edited selection is created instead of
 * the frozen intent snapshot (the intent row itself stays immutable).
 */
export const ConsumeOrderIntentBodySchema = z.object({
  tableSessionId: z.string().min(1),
  lines: z.array(SubmitOrderLineSchema).min(1).max(100).optional(),
});
export type ConsumeOrderIntentBody = z.infer<typeof ConsumeOrderIntentBodySchema>;

/** 409 payloads from the consume endpoint. */
export interface IntentConsumeErrorResponse {
  error: 'expired' | 'consumed';
}
