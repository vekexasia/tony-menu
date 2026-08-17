# TonyMenu

[![CodSpeed](https://img.shields.io/endpoint?url=https://codspeed.io/badge.json)](https://app.codspeed.io/maksimtech/tony-menu?utm_source=badge)

Self-hostable digital restaurant menu, built on Next.js. Cloudflare is the recommended hosted target; Docker + SQLite is available when you do not want a Cloudflare account. Diners scan a QR code, browse a localized menu, and can ask an optional AI assistant for recommendations.

Restaurant owners manage the menu from `/admin`. QR codes should point to `/`; the app detects the locale and redirects diners to the localized menu.

## Live demo

Try the public demo: **https://demo.tonymenu.app**

- Public menu: https://demo.tonymenu.app
- Admin: https://demo.tonymenu.app/admin

The demo is editable and public. Data resets automatically, so do not enter real customer data.
Tony, the menu assistant, is enabled with a daily usage cap for the demo.

<table>
  <tr>
    <td><img src="docs/assets/demo-mobile-menu.jpg" alt="Mobile menu" width="180" /></td>
    <td><img src="docs/assets/demo-mobile-item.jpg" alt="Mobile item detail" width="180" /></td>
    <td><img src="docs/assets/demo-mobile-tony.jpg" alt="Tony chat" width="180" /></td>
  </tr>
  <tr>
    <td colspan="3"><img src="docs/assets/demo-admin-desktop.jpg" alt="Desktop admin" width="560" /></td>
  </tr>
</table>

## What it does

- Public QR menu from `/`, with locale detection and localized category and item content.
- Admin SPA at `/admin` for settings, categories, entries, variants, extras, images, opening hours, publishing, and translations.
- Optional AI chat assistant that can recommend items from the current menu.
- Privacy-safe catalog view tracking for basic analytics.
- Cloudflare Access admin auth, so there is no in-app password system to run.

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for personal, non-commercial,
academic, charity, and government use.

**Commercial use** (running it for a paying restaurant, hosting it as a
service, embedding it in a paid product) requires a separate license. See
[COMMERCIAL.md](COMMERCIAL.md).

## Stack

| Component | What |
|---|---|
| `web/` | Next.js 16 (App Router), deployed to Cloudflare Pages or static Docker |
| `backend/` | Hono API on Cloudflare Workers/D1 or Node/SQLite |
| `web/workers/chat/` | Chat service on Cloudflare Workers or Node, with SSE streaming and tool calls |
| `packages/schemas/` | Shared Zod schemas (`@menu/schemas`) |
| Auth | Cloudflare Access, or trusted reverse-proxy header in Docker |
| Storage | R2/KV on Cloudflare, or filesystem uploads + in-memory chat cache in Docker |

## Self-hosting

- Cloudflare walkthrough: **[docs/self-hosting.md](docs/self-hosting.md)**.
- No-Cloudflare Docker walkthrough: **[docs/self-hosting-without-cloudflare.md](docs/self-hosting-without-cloudflare.md)**.

Cloudflare prerequisites: Node 22+, npm 10+, Git, and a Cloudflare account with Zero Trust enabled.

No-Cloudflare quick start:

```bash
cp .env.self-host.example .env
# set ADMIN_PASSWORD_HASH; see docs/self-hosting-without-cloudflare.md
docker compose up --build
```

Then open the proxy on port 8080.

Quick local setup:
```bash
git clone https://github.com/vekexasia/tony-menu.git
cd tony-menu

npm ci
cd web/workers/chat && npm ci && cd -

# Create .tony-menu.local.json and generated local config files
npm run initialize

# If you accepted placeholder IDs, provision Cloudflare resources, update
# .tony-menu.local.json, then regenerate
# (also create an R2 bucket if you want image uploads/catalog snapshots)
(cd backend && npx wrangler d1 create menu-db)
(cd web/workers/chat && npx wrangler kv namespace create MENU_CACHE)
(cd backend && npx wrangler r2 bucket create menu-public)
npm run config:generate

# Apply local migrations
(cd backend && npx wrangler d1 migrations apply menu-db --local)

# Terminal 1: backend API
cd backend && npm run dev

# Terminal 2: chat worker
cd web/workers/chat && npm run dev

# Terminal 3: frontend
cd web && npm run dev
```

Open the frontend dev server's root path for the diner menu.

`/admin` should be protected by Cloudflare Access. In local dev, point `NEXT_PUBLIC_API_URL` at a backend that can authenticate you, or run the backend with `DEMO_MODE=true` for demo-only access. The first migration seeds a `settings` row named "My Restaurant"; change it from `/admin?s=settings`.

## Common commands

```bash
# Frontend
cd web && npm run dev
cd web && npm run build
cd web && npm run test:run
cd web && npm run deploy:cf      # CF_PAGES_PROJECT defaults to "menu"

# Backend API
cd backend && npm run dev
cd backend && npm run check
cd backend && npm run test:run
cd backend && npm run deploy

# Chat worker
cd web/workers/chat && npm run dev
cd web/workers/chat && npm run test:run
cd web/workers/chat && npm run deploy

# Performance benchmarks (tracked on CodSpeed)
npm run bench                             # all workspaces
npm --workspace backend run bench         # catalog endpoint, analytics, uploads
npm --workspace web run bench             # menu search, i18n, locale detection
npm --workspace packages/schemas run bench # zod validation of API payloads
```

## Upgrading

When pulling a new version of TonyMenu into an existing self-hosted deployment:

```bash
git pull
npm install

# 1. Apply any new D1 migrations on the remote database BEFORE deploying
#    new worker code. Drizzle skips already-applied migrations automatically.
(cd backend && npx wrangler d1 migrations apply menu-db --remote)

# 2. Deploy the backend (and chat worker if changed).
(cd backend && npm run deploy)
(cd web/workers/chat && npm run deploy)

# 3. Deploy the frontend.
(cd web && npm run deploy:cf)
```

There is a brief window during step 2 where the migrated DB is being served by
the previous worker revision. For low-traffic deployments this is invisible;
for high-traffic ones, expect a few seconds of 5xx until the new revision
propagates.

Per-release migration notes (data backfill rules, breaking API shape changes,
admin UI changes that require operator action) live in [CHANGELOG.md](CHANGELOG.md).

## Documentation

- [Changelog](CHANGELOG.md) — per-release notes including upgrade hints
- [Cloudflare self-hosting guide](docs/self-hosting.md) — deploy your own copy on Cloudflare
- [Docker self-hosting guide](docs/self-hosting-without-cloudflare.md) — deploy without Cloudflare
- [Secrets & env vars](docs/secrets-and-env-vars.md) — full reference
- [Architecture & coding conventions](CLAUDE.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

## Contact

- Issues / bugs / features → GitHub issues
- Security → see [SECURITY.md](SECURITY.md)
- Commercial licensing → see [COMMERCIAL.md](COMMERCIAL.md)
