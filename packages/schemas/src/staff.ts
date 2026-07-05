import { z } from 'zod';

// ── Staff links (admin) ─────────────────────────────────────────────

export const CreateStaffLinkBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export type CreateStaffLinkBody = z.infer<typeof CreateStaffLinkBodySchema>;

export interface StaffLinkSummary {
  id: string;
  name: string;
  createdAt: number;
  consumedAt: number | null;
  lastSeenAt: number | null;
  revokedAt: number | null;
}

/** Returned once on creation — the token is only ever shown here. */
export interface CreatedStaffLinkResponse {
  ok: true;
  id: string;
  token: string;
}

/** Exchange one-use token → session token (public). */
export const ConsumeStaffLinkBodySchema = z.object({
  token: z.string().min(1),
});
export type ConsumeStaffLinkBody = z.infer<typeof ConsumeStaffLinkBodySchema>;

export interface ConsumeStaffLinkResponse {
  ok: true;
  sessionToken: string;
  name: string;
}

// ── Tables (admin CRUD) ─────────────────────────────────────────────

export const CreateTableBodySchema = z.object({
  name: z.string().trim().min(1).max(50),
  active: z.boolean().optional(),
});
export type CreateTableBody = z.infer<typeof CreateTableBodySchema>;

export const UpdateTableBodySchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  active: z.boolean().optional(),
});
export type UpdateTableBody = z.infer<typeof UpdateTableBodySchema>;

export interface AdminTable {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

// ── Table sessions + floor view (staff) ─────────────────────────────

/** One table's at-a-glance state on the floor view. */
export interface FloorTable {
  id: string;
  name: string;
  sessionId: string | null;
  openedAt: number | null;
  orderCount: number;
  readyCount: number;
}

export interface StaffOrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface StaffOrderEvent {
  status: string;
  actor: string | null;
  at: number;
}

export interface StaffOrder {
  id: string;
  dailyNumber: number;
  status: 'submitted' | 'ready' | 'served' | 'rejected';
  createdAt: number;
  items: StaffOrderItem[];
  /** Lifecycle changelog, oldest first: submitted → ready → served/rejected. */
  events: StaffOrderEvent[];
}

export interface TableSessionDetail {
  tableId: string;
  tableName: string;
  sessionId: string;
  openedAt: number;
  orders: StaffOrder[];
}
