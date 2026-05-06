# TonyMenu

Self-hostable digital restaurant menu, built on Next.js and Cloudflare. Diners scan a QR code, browse a localized menu, and can ask an optional AI assistant for recommendations.

Restaurant owners manage the menu from `/admin`. QR codes should point to `/`; the app detects the locale and redirects diners to the localized menu.

## Live demo

Try the public demo: **https://risto-menu.andreabaccega.com**

- Public menu: https://risto-menu.andreabaccega.com
- Admin: https://risto-menu.andreabaccega.com/admin

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
| `web/` | Next.js 16 (App Router), deployed to Cloudflare Pages |
| `backend/` | Hono API on Cloudflare Workers, Drizzle ORM over Cloudflare D1 |
| `web/workers/chat/` | Separate Cloudflare Worker for the AI chat assistant with SSE streaming and tool calls |
| `packages/schemas/` | Shared Zod schemas (`@menu/schemas`) |
| Auth | Cloudflare Access with backend JWT verification |
| Storage | Cloudflare R2 for images and catalog snapshots, Cloudflare KV for the chat menu cache |

## Self-hosting

Full walkthrough: **[docs/self-hosting.md](docs/self-hosting.md)**.

Prerequisites: Node 22+, npm 10+, Git, and a Cloudflare account with Zero Trust enabled.

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

`/admin` should be protected by Cloudflare Access. In local dev, either point `NEXT_PUBLIC_API_URL` at a deployed backend or use the Playwright admin bypass described in [docs/self-hosting.md](docs/self-hosting.md#8-run-locally). The first migration seeds a `settings` row named "My Restaurant"; change it from `/admin?s=settings`.

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
- [Self-hosting guide](docs/self-hosting.md) — deploy your own copy
- [Secrets & env vars](docs/secrets-and-env-vars.md) — full reference
- [Architecture & coding conventions](CLAUDE.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

## Contact

- Issues / bugs / features → GitHub issues
- Security → see [SECURITY.md](SECURITY.md)
- Commercial licensing → see [COMMERCIAL.md](COMMERCIAL.md)
