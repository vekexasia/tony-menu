# Menu Selection Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Build the frontend-only Menu selection feature behind an admin/catalog setting.

**Architecture:** Add one D1-backed `selection_enabled` setting surfaced through admin settings and public catalog. Add a localStorage-backed Zustand selection store on the web side. Render selection controls only when `restaurant.features.selection` is true, and resolve all displayed line data from the current catalog.

**Tech Stack:** Cloudflare Workers, Hono, Drizzle/D1 migrations, shared Zod schemas, Next.js App Router, React, Zustand, Vitest/Testing Library.

---

### Task 1: Setting and catalog contract

**Files:**
- Modify: `backend/drizzle/0007_selection_enabled.sql`
- Modify: `backend/src/db/schema.ts`
- Modify: `packages/schemas/src/admin.ts`
- Modify: `packages/schemas/src/catalog.ts`
- Modify: `backend/src/routes/admin.ts`
- Modify: `backend/src/routes/catalog.ts`
- Test: `backend/src/__tests__/admin-crud.test.ts`
- Test: `backend/src/__tests__/catalog.test.ts`

**Steps:**
1. Write failing backend tests for default false, admin update/read, and catalog `restaurant.features.selection`.
2. Run focused backend tests and confirm they fail because the field is missing.
3. Add migration, Drizzle schema column, shared schemas, admin route read/write, and catalog builder field.
4. Run focused backend tests and typecheck.
5. Commit `feat: add menu selection setting`.

### Task 2: Selection local store

**Files:**
- Create: `web/src/stores/selectionStore.ts`
- Test: `web/src/stores/selectionStore.test.ts`

**Steps:**
1. Write failing tests for add, increment/decrement, remove-at-one, clear, restaurant mismatch, and 12-hour expiry.
2. Run focused test and confirm it fails because the store is missing.
3. Implement localStorage-backed Zustand store with `version`, `restaurantId`, `updatedAt`, `lines`.
4. Run focused tests.
5. Commit `feat: add menu selection store`.

### Task 3: Item detail and menu header UI

**Files:**
- Modify: `web/src/components/menu/MenuItemDetail.tsx`
- Modify: `web/src/app/[locale]/menu/MenuPageClient.tsx`
- Test: `web/src/app/[locale]/menu/MenuPageClient.test.tsx`

**Steps:**
1. Write failing component tests for hidden controls when disabled, visible Add when enabled, quantity controls after add, remove at one, and header button only when count > 0.
2. Run focused test and confirm failure.
3. Add `selectionEnabled` support in the menu page and detail modal, with sticky modal footer.
4. Add header selection link near the search area when count > 0.
5. Run focused tests.
6. Commit `feat: add menu selection controls`.

### Task 4: Selection page

**Files:**
- Create: `web/src/app/[locale]/selection/page.tsx`
- Create: `web/src/app/[locale]/selection/SelectionPageClient.tsx`
- Test: `web/src/app/[locale]/selection/SelectionPageClient.test.tsx`

**Steps:**
1. Write failing component tests for grouping by category, no prices, quantity controls, unavailable lines, and clear-all confirmation.
2. Run focused test and confirm failure.
3. Implement selection page resolving lines from current catalog.
4. Run focused tests.
5. Commit `feat: add menu selection page`.

### Task 5: Admin UI and final verification

**Files:**
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/components/admin/pages/SettingsPage.tsx`
- Modify translations as needed.

**Steps:**
1. Write/update tests where existing coverage requires API/type shape.
2. Add admin setting state, payload field, and publishing card toggle copy.
3. Run `npm run health` from the worktree root.
4. Commit `feat: expose menu selection admin toggle`.
