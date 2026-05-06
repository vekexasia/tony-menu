# TonyMenu backend

Cloudflare Worker REST API for TonyMenu.

## Stack

- Hono HTTP app
- Drizzle ORM over Cloudflare D1/SQLite
- Cloudflare R2 for uploaded images and catalog snapshots when bound
- Cloudflare Access JWT verification via JWKS
- Shared request/response schemas from `@menu/schemas`

## Main route groups

- `GET /`, `GET /health`, `GET /ready` — service checks
- `GET /catalog` — public published catalog with Cache API/R2/live-D1 fallback
- `POST /catalog/view` — privacy-safe menu item analytics
- `POST /catalog/publish` — admin-only catalog snapshot refresh
- `GET /admin/me` — authenticated profile with admin flag
- `/admin/...` — admin CRUD for settings, categories, entries, hours, analytics, uploads, translations, and catalog refresh

## Commands

```bash
cd backend
npm install
npm run dev          # wrangler dev
npm run check        # tsc --noEmit
npm run test:run     # Vitest
npm run deploy       # wrangler deploy
```

Apply D1 migrations:

```bash
cd backend
npx wrangler d1 migrations apply menu-db --remote
```

Import from a legacy backup JSON:

```bash
cd backend
npm run import:backup -- --file backups/<file>.json
```

## Configuration

Local development uses `.dev.vars` for uncommitted values. Production/staging
non-secret Worker vars and bindings live in `wrangler.toml`; secrets must be set
with `wrangler secret put`.

Important bindings/vars:

- `DB` — Cloudflare D1 database binding.
- `PUBLIC_MENU_BUCKET` — optional R2 bucket binding. Without it, catalog/image
  routes fall back or return a clear 503 where R2 is required.
- `R2_PUBLIC_URL` — public base URL for R2 images.
- `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` — Cloudflare Access JWT verification.
- `ALLOWED_ORIGINS` — comma-separated CORS allowlist.
- `OPENAI_API_KEY` — secret used by translation and OpenAI chat flows.

See `docs/secrets-and-env-vars.md` for the full reference.
