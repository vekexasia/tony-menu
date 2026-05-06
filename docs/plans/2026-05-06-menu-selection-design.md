# Menu selection design

- Status: draft
- Date: 2026-05-06
- Related: GitHub issue #11

## Product scope

This feature is **Menu selection**, not cart, checkout, ordering, or self-ordering.

It lets diners save menu items in a local list they can show or read to staff. Nothing is submitted. No backend diner write happens. No kitchen board exists. No notifications are sent.

Out of scope for this iteration:

- Orders
- KDS
- Web Push
- SSE
- Payments
- Status lifecycle
- Waiter QR handoff
- Variants, extras, and notes
- Prices and totals in the selection UI

## Admin setting

Add one setting:

```ts
settings.selection_enabled boolean default false
```

Admin UI:

```text
Menu selection
Let diners save items in a local list they can show to staff. This does not send orders or notifications.
```

The setting belongs near public menu/publishing settings. Avoid naming it ordering-related.

Backend/catalog impact:

- Add `selection_enabled` to `settings`.
- Include it in admin settings read/update.
- Include it in public catalog response as `restaurant.features.selection: boolean`.
- If false or missing, the frontend hides all selection UI.

No public submit endpoints, `orders` tables, `carts` table, Turnstile, rate limits, Web Push, KDS, or order ADR are needed.

## Public UX

When disabled, the public menu remains unchanged.

When enabled:

1. Diner opens a menu.
2. Diner taps an item card.
3. Item detail modal opens.
4. If the item is available, the modal shows a sticky footer button: `Add to selection`.
5. After adding, the modal stays open and the footer changes to quantity controls: `-  1  +`.
6. Pressing `-` at quantity 1 removes the item.
7. No `View selection` button appears in the modal.
8. Once selection count is greater than 0, a header/top button appears.
9. Header button opens `/{locale}/selection`.
10. Selection page shows grouped item quantities and names, no prices or totals.

Only the item detail modal can add items. There are no direct `+` controls on list cards.

The floating chat button remains unchanged. There is no bottom dock.

## Selection page

Route:

```text
/{locale}/selection
```

The page is editable and readable enough to show to staff. There is no separate staff/read-only mode.

Content:

- Heading: `My selection`
- Helper text: `Show this list to staff or use it while ordering.`
- Items grouped by category
- Lines preserve added order inside each category
- Each line shows quantity and item name
- Per-line quantity controls
- Unavailable marker when the item cannot currently be resolved or used
- `Clear selection` button at the bottom with confirmation

No prices, totals, checkout wording, submit button, or order wording.

## Persistence

Selection is frontend-only and stored in `localStorage` with a 12-hour expiry.

Shape:

```ts
{
  version: 1,
  restaurantId: string,
  updatedAt: number,
  lines: [
    {
      entryId: string,
      quantity: number,
      addedAt: number
    }
  ]
}
```

Rules:

- Persist across refresh and browser restarts.
- Clear if `updatedAt` is older than 12 hours.
- Clear if `restaurantId` changes.
- Store only ids and quantities.
- Resolve names, categories, availability, and localized text from the current catalog.
- Shared selection spans all menus for the restaurant.
- If an entry no longer exists, is hidden, or is out of stock, keep the line visible on the summary page as unavailable and let the diner remove it.
- Unavailable or out-of-stock items do not show `Add to selection` on menu pages.

## Testing

Backend/shared schema:

- Migration defaults `selection_enabled` to false.
- Admin can enable/disable `selection_enabled`.
- Public catalog includes `restaurant.features.selection`.

Frontend:

- Item detail hides selection controls when disabled.
- Item detail shows `Add to selection` when enabled and item is available.
- Add keeps the detail modal open and shows quantity controls.
- `-` at quantity 1 removes the line.
- Header selection button appears only when count is greater than 0.
- Selection persists locally and expires after 12 hours.
- Selection page groups by category.
- Selection page does not render prices or totals.
