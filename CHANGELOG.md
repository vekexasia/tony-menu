# Changelog

All notable changes to TonyMenu.

The project does not currently publish versioned releases — each entry is dated
and corresponds to a deploy of `main`. If you fork and tag, switch to the
[Keep-a-Changelog](https://keepachangelog.com) `[X.Y.Z]` heading style.

Each release entry includes a **Notes for AI agents** subsection. Those notes
are written for LLM coding assistants picking up this codebase in a future
session: they call out file moves, schema invariants, and gotchas that aren't
obvious from the diff but matter when extending the feature.


## 2026-05-14 — Voice dictation admin toggle

### Added

- `ai_voice_enabled` setting and migration `0008_ai_voice_enabled.sql`.
- Admin Chat AI sub-toggle for Tony voice dictation, shown only when AI chat is enabled.
- Public catalog `features.aiVoice` flag used by the frontend to show or hide the microphone and dictation language picker.

### Changed

- Turning off Tony AI chat also turns off voice dictation.
- Demo reset enables voice dictation alongside Tony chat.

### Breaking changes

None. Existing deployments default voice dictation to disabled until the owner enables it.

### Upgrade actions

```bash
git pull
(cd backend && npx wrangler d1 migrations apply risto-menu-demo-db --remote --config wrangler.demo.toml)
(cd backend && npm run deploy)
(cd web && npm run deploy:cf)
```

### Notes for AI agents

- Voice dictation is intentionally a sub-feature of `aiChat`: API responses coerce `aiVoice` false when `aiChat` is false.
- Keep backend schema, `packages/schemas`, web API types, and `RestaurantData.features` in sync when adding feature flags.
## 2026-05-04 — Day-of-week menu scheduling

### Added

- `menus.availableDays` — optional list of weekday codes (`mon`, `tue`,
  `wed`, `thu`, `fri`, `sat`, `sun`) on each menu, alongside the existing
  `availableFrom`/`availableTo` time window. A diner only sees the menu on
  days included in the list. `null` (or omitted) means every day.
- 7 weekday toggle chips in the admin menu edit modal, plus a pill in the
  menu list row showing which days the menu is restricted to.

### Changed

- `isMenuAvailableNow` (web/src/lib/menu-schedule.ts) now takes an optional
  `availableDays` field and applies **anchor-to-start-day** semantics for
  overnight windows: a Fri 22:00 → 02:00 schedule with `availableDays=['fri']`
  is active Fri 22:00–24:00 AND Sat 00:00–02:00, because the wrap belongs
  to Friday's slot. The day check uses the diner's local time (same
  convention as the existing time-of-day check).
- The admin `PATCH /admin/menus/:menuId` payload accepts `availableDays`.
  All-7-days and empty arrays are normalized to `null` server-side so we
  don't store two equivalent representations of "every day".

### Breaking changes

None. Existing menus default to `availableDays = null` (every day) and
catalog consumers that ignore the new field continue to work.

### Upgrade actions

```bash
git pull
(cd backend && npx wrangler d1 migrations apply menu-db --remote)
(cd backend && npm run deploy)
(cd web && npm run deploy:cf)
```

### Migrations

- `0006_menu_available_days.sql` — adds nullable `available_days TEXT`
  (JSON array) to `menus`. Backfill is implicit (existing rows get `NULL`).

### Notes for AI agents

- Storage is a JSON text column matching the `customLocales`/`allergens`
  pattern, not a bitmask. Keep that consistent if you add more multi-value
  fields to menus.
- The validator (`UpdateMenuBodySchema` in `packages/schemas/src/admin.ts`)
  rejects empty arrays and duplicates. The admin route additionally
  collapses a 7-element array to `null` before writing.
- The predicate's anchor-to-start-day rule for overnight windows means
  you cannot derive the active day from `now.getDay()` alone — you must
  consult `availableFrom`/`availableTo` first to decide whether `now` is
  in the wrap-around portion (which belongs to *yesterday*'s slot).
- `Date.getDay()` returns 0=Sun..6=Sat; the predicate maps via
  `WEEKDAY_BY_INDEX` to the schema's `mon..sun` codes. Keep that mapping
  in sync with `WEEKDAYS` in `packages/schemas/src/catalog.ts`.

## 2026-05-01 — Language flags and custom flag uploads

### Added

- Real SVG flags for standard locales (it / en / de / fr / es / nl / ru / pt)
  via the `country-flag-icons` package, replacing emoji that rendered as
  letter pairs on Windows. The flags appear in the public LanguagePicker,
  the admin translation tabs, and the Lingue settings page.
- Custom locales (e.g. `vec`) gain an optional `flagUrl`. Admins can
  upload a per-locale flag image from the Lingue settings page; the
  upload reuses the existing R2 image pipeline (JPEG/PNG/WebP, 5 MB cap)
  and stores objects under `images/settings/flag-<code>-*.{ext}`. Old
  keys are deleted on re-upload and on remove.
- New backend endpoints: `POST /admin/locale-flag/:code` and
  `DELETE /admin/locale-flag/:code`.
- New shared UI primitive `<Flag>` (in `web/src/components/ui/Flag.tsx`)
  that renders, in order: a custom uploaded URL → bundled SVG for known
  locales → uppercase code-chip fallback.

### Changed

- `customLocales[]` items gain an optional `flagUrl` field in both
  `UpdateSettingsBodySchema` and the public catalog `features.customLocales`.
  Optional and backwards-compatible — existing rows continue to work.

### Breaking changes

None. Existing catalog consumers ignore the new `flagUrl` field.

### Upgrade actions

```bash
git pull
(cd backend && npx wrangler d1 migrations apply menu-db --remote)
(cd backend && npm run deploy)
(cd web && npm run deploy:cf)
```

No DB migrations in this release. `customLocales[*].flagUrl` lives inside
the existing `settings.custom_locales` JSON column.

### Migrations

- _none in this release_

### Notes for AI agents

- `country-flag-icons` SVG strings are imported per-file
  (`country-flag-icons/string/3x2/<CC>`) and converted to data URLs in
  `web/src/lib/locale-flags.ts`. The barrel `country-flag-icons/react/3x2`
  pulls every flag — keep imports per-file.
- `web/src/types/country-flag-icons.d.ts` declares the per-file subpath
  modules; the package only ships types for the index.
- Custom-flag uploads deliberately do not accept SVG (parser-level XSS).
  If that ever changes, sanitize before storing.
- `Flag` accepts a `decorative` prop. Use it whenever the locale label
  text is rendered next to the flag (tabs, dropdown rows) — otherwise
  the accessible name double-includes the language and breaks
  testing-library `getByRole("button", { name: ... })` lookups.

## 2026-05-01 — Multi-menu and standard icons

### Added

- Arbitrary user-defined menus replace the rigid `seated`/`takeaway` split.
  Each menu has a code (URL slug), title (with i18n), `published` toggle,
  drag-orderable position, and a curated standard icon. Owners create and
  rename menus from a new top-level admin page (`?s=menus`).
- Many-to-many entry membership: a single dish can appear on any subset of
  menus via the new `menu_entry_memberships(menu_id, entry_id)` join table.
- Per-entry `hidden` flag (independent of per-menu draft) for owner-only
  items that should disappear from the public catalog without being deleted.
- Items admin page gains a menu filter (`All` / `<each menu>` / `No menu`)
  and a "Show hidden" toggle so orphans from the migration are findable.
- Curated set of inline-SVG icons rendered by `<MenuIcon>`: `utensils`,
  `lunch`, `dinner`, `breakfast`, `wine`, `beer`, `cocktail`, `coffee`,
  `pizza`, `burger`, `dessert`, `salad`, `fish`, `bread`. Picker grid in
  the Menus admin modal.
- New backend endpoints: `GET/POST /admin/menus`, `PATCH/DELETE /admin/menus/:id`,
  `PATCH /admin/menus/reorder`. `POST /admin/categories` was missing entirely
  before — also added.

### Changed

- Catalog response shape: `categories[]` is now top-level (with entries that
  carry `menuIds[]` and `hidden`); `menus[]` carries metadata only
  (`id`, `code`, `title`, `i18n`, `published`, `sortOrder`, `icon`).
- `OpeningSchedule` is a single `WorkingHours` (no `seated`/`takeaway`
  split). The Hours admin page collapsed accordingly.
- `MenuEntry` admin form: visibility radio replaced with a per-menu chip
  multi-select + a separate "Hidden" toggle.
- Public route is `/[locale]/menu` driven by `?type=<menu-code>`.
  `?type=drinks` aliases to a `drinks`- or `takeaway`-coded menu so old
  QR codes from the seated/takeaway era keep working.

### Removed

- `MenuVisibilitySchema` (`'all' | 'seated' | 'takeaway' | 'hidden'`) and the
  `MenuSelection` enum. `menuVisibility` is gone from `MenuEntry`.
- `RestaurantMessages.onCartSeated` / `onCartTakeaway` (no cart flow exists).
- `web/src/stores/menuSelectionStore.{ts,test.ts}` and the
  `useIsSeated` / `useIsTakeaway` / `useHasSelection` hooks.

### Migrations

- **0001_multi_menu.sql** — schema rewrite + data backfill:
  - drops `menu_categories.menu_id` (categories become flat),
  - drops `menu_entries.visibility`, adds `menu_entries.hidden`,
  - adds `menus.published`, `menus.sort_order`,
  - creates `menu_entry_memberships`,
  - seeds memberships from the legacy visibility flag (`'all'` → all menus,
    `'<code>'` → menu with that code, `'hidden'` → no memberships +
    `hidden=1`),
  - assigns `menus.sort_order` (seated=0, takeaway=1, others 2),
  - collapses `settings.opening_schedule` from `{seated, takeaway}` to a
    single `WorkingHours`, preferring `seated`.
- **0002_menu_icon.sql** — adds `menus.icon` `TEXT NOT NULL DEFAULT 'utensils'`.

### Upgrade actions for operators

- Apply migrations: `npx wrangler d1 migrations apply menu-db --remote`.
- After deploy, sign in to `/admin?s=menus` and rename the legacy `seated`
  / `takeaway` codes to whatever fits the restaurant (e.g. `food`,
  `drinks`, `lunch`, `wines`).
- Pick a standard icon for each menu — every menu defaulted to `utensils`.
- Use the Items page filter `All menus → No menu` plus "Show hidden" to
  find any entries the migration orphaned (these will be entries that had
  `visibility='hidden'` in the old model). Re-attach to a menu or delete.

### Notes for AI agents

- The membership table is the single source of truth for which menu an entry
  belongs to. Categories are flat (no `menuId` parent). Do not reintroduce
  a category→menu hierarchy — see `docs/adr/` if a decision record is added
  later.
- The `?type=` query param is intentional. Static export (`output: "export"`
  in `next.config.ts`) forbids runtime dynamic route segments, so a
  `/menu/[code]` route would require enumerating every menu code at build
  time — but codes are user-defined in D1. Keep menu routing query-based.
- `MENU_ICONS` lives in **two** places: `packages/schemas/src/catalog.ts`
  (zod enum, used to validate writes) and
  `web/src/components/menu/MenuIcon.tsx` (renderer + admin picker). They
  must stay in sync. Re-exporting from `@menu/schemas` to the web package
  was tried and currently breaks Turbopack barrel resolution at SSR; if
  you fix that, you can collapse the two lists.
- `<MenuIcon>` falls back to `utensils` for unknown kinds, so adding a new
  icon kind is forward-compat (DB writes can land before the frontend
  ships the SVG case).
- Public layout (`web/src/app/[locale]/layout.tsx`) does NOT load Font
  Awesome — only the admin layout does. Public-facing icons must be
  inline SVG. If you add an admin-only feature, FA classes are fine.
- `setEntryMemberships()` in `backend/src/routes/admin.ts` is
  delete-then-insert. It is **not** transactional across the two
  statements. D1 doesn't support multi-statement transactions; if you
  refactor, keep the contract that the memberships set is fully
  replaced (not merged).
- Backend tests use seed helpers in `backend/src/__tests__/helpers/db.ts`:
  `seedMenu(db, id, code, title?, {published?, sortOrder?})`,
  `seedCategory(db, id, name?, sortOrder?)` (no `menuId` arg —
  categories are flat), `seedEntry(db, id, categoryId, {hidden?, ...})`,
  `seedMembership(db, menuId, entryId)`.
- Drizzle-kit's interactive `generate` was bypassed via a tiny Python
  PTY wrapper to feed Enter for the rename-vs-create-column prompt
  (we wanted "create"). If you regenerate migrations and don't have a
  TTY, do the same or write the SQL by hand and update `meta/_journal.json`
  + `meta/<n>_snapshot.json`.
- The git-shield pre-push hook flags drizzle snapshot UUIDs as secrets and
  Italian dish names as PII. The narrow allowlist regexes live in
  `.pii-allowlist`. New Italian fixtures may need additions.
