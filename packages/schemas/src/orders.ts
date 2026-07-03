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

/** 409 payloads from the consume endpoint. */
export interface IntentConsumeErrorResponse {
  error: 'expired' | 'consumed';
}
