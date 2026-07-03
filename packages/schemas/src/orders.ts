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
