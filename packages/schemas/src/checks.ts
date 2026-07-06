import { z } from 'zod';
import type { StaffOrder, TableShape } from './staff.js';

// ── Checks (conto, #15 follow-up) ───────────────────────────────────
//
// A check is a frozen snapshot of a table session's non-rejected orders plus
// an optional discount and a list of manual adjustments. All money is integer
// cents. Totals are always COMPUTED (never stored) via computeCheckTotals so
// the client and server agree.

export type CheckStatus = 'open' | 'settled' | 'voided';
export type PaymentMethod = 'cash' | 'card' | 'other';

export interface CheckLine {
  name: string;
  quantity: number;
  /** Frozen unit price in integer cents. */
  unitPrice: number;
}

export type CheckDiscount =
  | { type: 'percent'; value: number } // 0..100
  | { type: 'amount'; value: number }; // cents

export interface CheckAdjustment {
  label: string;
  /** Signed cents (negative = discount-like, positive = surcharge). */
  amount: number;
}

export interface CheckDTO {
  id: string;
  status: CheckStatus;
  lines: CheckLine[];
  discount: CheckDiscount | null;
  adjustments: CheckAdjustment[];
  /** Computed: sum(line qty * unitPrice). */
  subtotal: number;
  /** Computed: subtotal - discount + sum(adjustments), clamped >= 0. */
  total: number;
  createdAt: number;
  settledAt: number | null;
  paymentMethod: PaymentMethod | null;
  note: string | null;
  voidedAt: number | null;
}

/**
 * The single source of truth for check money math. Percent discounts round to
 * the nearest cent; the final total is clamped to zero so adjustments/discounts
 * can never make a check negative.
 */
export function computeCheckTotals(
  lines: CheckLine[],
  discount: CheckDiscount | null,
  adjustments: CheckAdjustment[],
): { subtotal: number; total: number } {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  let discountCents = 0;
  if (discount) {
    discountCents = discount.type === 'percent'
      ? Math.round((subtotal * discount.value) / 100)
      : discount.value;
  }
  const adjTotal = adjustments.reduce((sum, a) => sum + a.amount, 0);
  const total = Math.max(0, subtotal - discountCents + adjTotal);
  return { subtotal, total };
}

const DiscountSchema = z.union([
  z.object({ type: z.literal('percent'), value: z.number().int().min(0).max(100) }),
  z.object({ type: z.literal('amount'), value: z.number().int().min(0) }),
]);

const AdjustmentSchema = z.object({
  label: z.string().trim().min(1).max(80),
  amount: z.number().int().refine((n) => n !== 0, 'amount must be non-zero'),
});

/** PATCH /admin/checks/:id — edit discount and/or replace the adjustments list. */
export const UpdateCheckBodySchema = z.object({
  discount: DiscountSchema.nullable().optional(),
  adjustments: z.array(AdjustmentSchema).max(20).optional(),
});
export type UpdateCheckBody = z.infer<typeof UpdateCheckBodySchema>;

export const SettleCheckBodySchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'other']),
  note: z.string().trim().max(120).optional(),
});
export type SettleCheckBody = z.infer<typeof SettleCheckBodySchema>;

// ── Admin table detail (#15 follow-up) ──────────────────────────────

export interface AdminTableSessionOrders {
  sessionId: string;
  openedAt: number;
  orders: StaffOrder[];
  check: CheckDTO | null;
  /** Sum of non-rejected order line totals (cents), live. */
  provisionalTotal: number;
}

export interface AdminTableHistoryEntry {
  sessionId: string;
  openedAt: number;
  closedAt: number | null;
  check: CheckDTO | null;
}

export interface AdminTableDetail {
  table: { id: string; name: string; areaName: string | null; active: boolean; shape: TableShape };
  currentSession: AdminTableSessionOrders | null;
  history: AdminTableHistoryEntry[];
}
