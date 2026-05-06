# Secrets & Environment Variables

Complete reference for all secrets and environment variables across the stack.

For local setup, prefer `npm run initialize`. It creates `.tony-menu.local.json` as the single source of truth and generates the framework-specific files below. Edit `.tony-menu.local.json`, then run `npm run config:generate` instead of editing generated files directly.

## Backend — Cloudflare Worker (`menu-backend`)

### Secrets (via `wrangler secret put`)

```bash
cd backend
wrangler secret put OPENAI_API_KEY
```

| Secret | Required | Where to get it |
|---|---|---|
| `OPENAI_API_KEY` | Optional | Only needed for the admin translation helper. |

### Non-secret vars (`wrangler.toml` `[vars]` section)

| Variable | Example value | Notes |
|---|---|---|
| `APP_ENV` | `production` | Controls feature flags and logging |
| `ACCESS_TEAM_DOMAIN` | `https://yourteam.cloudflareaccess.com` | Cloudflare Access team domain. Required for admin auth. |
| `ACCESS_AUD` | `1a2b3c…` | The `AUD` tag shown on the Access application's Overview tab. Required. |
| `ADMIN_EMAILS` | `you@example.com,partner@example.com` | Comma-separated admin emails (case-insensitive). The Access JWT's `email` claim must match. |
| `R2_PUBLIC_URL` | `https://pub-xxx.r2.dev` | Public CDN URL for uploaded images |
| `ALLOWED_ORIGINS` | `https://your-domain.example` | Comma-separated CORS origins |
| `ALLOWED_HOST_SUFFIXES` | `.your-pages-project.pages.dev` | Optional. Hostname suffixes allowed over HTTPS (Pages preview deploys). |

`PUBLIC_MENU_BUCKET` is an R2 binding, not a string var. The repo's initializer/config generator emits the `[[r2_buckets]]` block in `backend/wrangler.toml` when `.tony-menu.local.json` includes an R2 bucket name.

---

## Chat Worker — Cloudflare Worker (`menu-chat`)

Runtime config lives in `web/workers/chat/wrangler.toml` for non-secrets and
Cloudflare Worker secrets for secrets. Local dev uses
`web/workers/chat/.dev.vars`.

### Secrets (via `wrangler secret put`)

```bash
cd web/workers/chat
wrangler secret put OPENAI_API_KEY
wrangler secret put CHAT_SESSION_SECRET
wrangler secret put REFRESH_SECRET
```

| Secret | Required | Notes |
|---|---|---|
| `OPENAI_API_KEY` | Yes when `LLM_PROVIDER=openai` | Used by the AI chat assistant |
| `ANTHROPIC_API_KEY` | Optional | Only needed if switching provider to Anthropic |
| `REFRESH_SECRET` | Yes for `/refresh-menu` and `/chat/debug` | Shared admin/debug secret |
| `CHAT_SESSION_SECRET` | Yes | HMAC secret for anonymous diner chat session tokens |

### Non-secret vars (`wrangler.toml` `[vars]` section)

| Variable | Example value | Notes |
|---|---|---|
| `LLM_PROVIDER` | `openai` | Provider selector |
| `ALLOWED_ORIGINS` | `https://your-domain.example` | Comma-separated origins allowed to call the chat worker. Localhost is allowed by default. |
| `ALLOWED_HOST_SUFFIXES` | `.your-pages-project.pages.dev` | Comma-separated hostname suffixes allowed over HTTPS. Useful for Pages preview deploys. |

The chat worker does not authenticate diners — it issues signed anonymous
session tokens (`POST /session`) gated by Cloudflare IP rate-limit.

---

## Frontend — Cloudflare Pages (`menu` by default)

Set in Pages dashboard → Settings → Environment variables (production) and
`web/.env.local` for local dev. If you build locally and `wrangler pages deploy`,
use `web/.env.production.local` (gitignored) instead — the dashboard env vars
only matter when Pages does the build itself.

### Required

| Variable | Local dev value | Production value |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8787` | `https://<your-backend-worker-url>` |
| `NEXT_PUBLIC_CHAT_WORKER_URL` | `http://localhost:8788` | `https://<your-chat-worker-url>` |

### Optional

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `en` | Default UI locale. One of: `it, en, de, fr, es, nl, ru, pt, vec`. |
| `CF_PAGES_PROJECT` | `menu` | Cloudflare Pages project name used by `npm run deploy:cf`. |

The frontend has **no auth-related env vars**. Cloudflare Access manages the
admin login flow entirely; once a user is authenticated, their identity is
sent via the `Cf-Access-Jwt-Assertion` header to the backend.

---

## Local-only files

These files may contain real secrets and must stay out of git history:

- `.tony-menu.local.json`
- `backend/.dev.vars`
- `backend/wrangler.toml`
- `web/.env.local`
- `web/.env.production.local`
- `web/workers/chat/.dev.vars`
- `web/workers/chat/wrangler.toml`
- `backend/backups/`
- `backend/exports/`
- generated outputs: `.next/`, `.open-next/`, `out/`, `.wrangler/`

## Deployment checklist

1. Apply D1 migration:
   ```bash
   cd backend && npx wrangler d1 migrations apply menu-db --remote
   ```

2. Set up Cloudflare Access apps for the Pages project + the backend Worker
   (Zero Trust → Access → Applications). Copy the AUD tag into `.tony-menu.local.json`,
   then run `npm run config:generate`.

3. Set Worker secrets (see above).

4. Set Pages environment variables from `web/.env.local` or configure them in the Pages dashboard.

5. If you use `.github/workflows/deploy-demo.yml`, also set GitHub Actions repository/org variables:
   - `DEMO_D1_DATABASE_ID`
   - `DEMO_R2_BUCKET_NAME`
   - `DEMO_R2_PUBLIC_URL`
   and secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DEMO_CHAT_SESSION_SECRET`.

6. Build/deploy:
   ```bash
   cd backend && npm run deploy
   cd ../web/workers/chat && npm run deploy
   cd ../.. && CF_PAGES_PROJECT=menu npm run deploy:cf
   ```
