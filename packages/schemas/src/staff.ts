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

// ── Areas (admin) ───────────────────────────────────────────────────

export const CreateAreaBodySchema = z.object({
  name: z.string().trim().min(1).max(50),
});
export type CreateAreaBody = z.infer<typeof CreateAreaBodySchema>;

export const UpdateAreaBodySchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateAreaBody = z.infer<typeof UpdateAreaBodySchema>;

export interface Area {
  id: string;
  name: string;
  sortOrder: number;
}

// ── Tables (admin CRUD) ─────────────────────────────────────────────

export type TableShape = 'rect' | 'circle';

export const CreateTableBodySchema = z.object({
  name: z.string().trim().min(1).max(50),
  active: z.boolean().optional(),
  areaId: z.string().min(1),
  shape: z.enum(['rect', 'circle']),
});
export type CreateTableBody = z.infer<typeof CreateTableBodySchema>;

export const UpdateTableBodySchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  active: z.boolean().optional(),
});
export type UpdateTableBody = z.infer<typeof UpdateTableBodySchema>;

/** Drag-end position update; coordinates clamped to the 1000x700 virtual canvas. */
export const UpdateTablePositionBodySchema = z.object({
  x: z.number().int().min(0).max(1000),
  y: z.number().int().min(0).max(700),
});
export type UpdateTablePositionBody = z.infer<typeof UpdateTablePositionBodySchema>;

export interface AdminTable {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  areaId: string | null;
  x: number;
  y: number;
  shape: TableShape;
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
  areaId: string | null;
  x: number;
  y: number;
  shape: TableShape;
  /** createdAt of the oldest 'submitted' order in the open session; null if none. */
  oldestSubmittedAt: number | null;
}

/** Admin floor state: a FloorTable that also carries the active flag (inactive tables show dimmed). */
export interface AdminFloorTable extends FloorTable {
  active: boolean;
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
  actorName: string | null;
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
