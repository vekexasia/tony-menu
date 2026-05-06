# Self-hosting TonyMenu

This guide walks through deploying your own copy on Cloudflare. Everything
here is free-tier-friendly; you only pay if traffic or AI chat usage grows.

---

## What you'll provision

| Service | Purpose | Free tier ok? |
|---|---|---|
| Cloudflare Workers | `menu-backend` API + `menu-chat` AI assistant | Yes (100k req/day) |
| Cloudflare Pages | Next.js frontend (`menu`) | Yes |
| Cloudflare D1 | SQLite database (settings, menus, entries, analytics) | Yes (5 GB) |
| Cloudflare R2 | Image uploads + catalog snapshot cache | Yes (10 GB) |
| Cloudflare KV | Chat menu cache | Yes |
| Cloudflare Access | Admin login (Google / GitHub / email OTP / SAML / OIDC) | Yes (≤50 users) |
| OpenAI API | Diner chat + admin translation helper | **Paid** (optional) |

**Heads up:** the AI chat is optional. If you do not set
`OPENAI_API_KEY` on the chat worker, you can disable the chat from the
admin UI (Settings → Chat AI) — the rest of the app runs fine.

---

## 1. Prerequisites

```bash
node >= 22
npm >= 10
git
npm i -g wrangler   # optional; the local devDep is also fine
```

You'll also need:

- A Cloudflare account (free) with **Zero Trust** enabled (free up to 50 users).
- An admin email address (you'll list it in `ADMIN_EMAILS`). Cloudflare Access
  will accept it via Google / email OTP / GitHub / your IdP of choice.
- (Optional) An OpenAI API key with a small monthly cap.

---

## 2. Clone and install

```bash
git clone https://github.com/vekexasia/tony-menu.git
cd tony-menu

npm ci
cd web/workers/chat && npm ci && cd -
```

---

## 3. Cloudflare resources

```bash
npx wrangler login
```

### 3.1 D1 database

```bash
cd backend
npx wrangler d1 create menu-db
```

Copy the returned `database_id`.

### 3.2 KV namespace (chat worker menu cache)

```bash
cd ../web/workers/chat
npx wrangler kv namespace create MENU_CACHE
```

Copy the returned `id`.

### 3.3 R2 bucket (optional but recommended for image uploads)

```bash
cd ../../../backend
npx wrangler r2 bucket create menu-public
```

Enable public access on the bucket in the Cloudflare dashboard and copy the
`pub-XXXX.r2.dev` URL (or attach a custom domain). You will store both the
public URL and the bucket name in `.tony-menu.local.json` so `config:generate`
can emit the `PUBLIC_MENU_BUCKET` binding automatically.

### 3.4 Generate config files

Run the initializer from the repo root:

```bash
cd ..
npm run initialize
```

It creates `.tony-menu.local.json`, which is the source of truth for local setup and is gitignored because it may contain secrets. It then generates the runtime files required by Next.js and Wrangler:

- `backend/wrangler.toml`
- `backend/.dev.vars`
- `web/.env.local`
- `web/workers/chat/wrangler.toml`
- `web/workers/chat/.dev.vars`

Do not edit the generated files directly. Edit `.tony-menu.local.json`, then regenerate:

```bash
npm run config:generate
```

The script asks for your D1/KV IDs, URLs, R2 bucket name/public URL, Cloudflare Access values, admin emails, and chat provider. If you do not have the IDs yet, accept the placeholders, create the resources above, update `.tony-menu.local.json`, then run `npm run config:generate`.

---

## 4. Cloudflare Access

Admin auth is handled by Cloudflare Access — no Firebase, no password. Access
sits in front of `/admin/*` and the backend Worker, redirects unauthenticated
visitors to a Cloudflare-hosted login page (Google, GitHub, email OTP, SAML,
OIDC — your choice), and forwards authenticated requests with a verifiable
`Cf-Access-Jwt-Assertion` header.

In **Cloudflare dashboard → Zero Trust → Settings**, set your team domain
(e.g. `yourteam.cloudflareaccess.com`) if you haven't already. The free tier
covers up to 50 users — way more than enough for a single restaurant admin.

Then create two Access applications under **Zero Trust → Access → Applications**:

1. **Pages frontend** — Application type "Self-hosted", domain
   `your-pages-project.pages.dev` (or your custom domain), path
   `/admin/*`. Add an Access policy: e.g. "Emails ending with @yourcompany.com"
   or "Emails in: you@example.com, partner@example.com".
2. **Backend Worker** — Application type "Self-hosted", domain
   `<your-backend-worker>.workers.dev` (or custom domain), path `/admin/*`.
   Same policy as above.

Each app's **Overview** tab shows an `AUD` tag (a hex string). Copy it into:
- `backend/wrangler.toml` → `ACCESS_AUD`
- Set `ACCESS_TEAM_DOMAIN = https://<your-team>.cloudflareaccess.com` in the same file

Add the admin email(s) to `backend/wrangler.toml` → `ADMIN_EMAILS`.

The backend verifies the JWT against `<team-domain>/cdn-cgi/access/certs` —
fully self-contained, no service accounts.

---

## 5. Frontend env

`npm run initialize` creates `web/.env.local` with:

- `NEXT_PUBLIC_API_URL` — your backend Worker URL, or `http://localhost:8787` for dev
- `NEXT_PUBLIC_CHAT_WORKER_URL` — your chat Worker URL, or `http://localhost:8788`
- `NEXT_PUBLIC_DEFAULT_LOCALE` — default UI language (`en`, `it`, `de`, …)

The frontend has no auth env vars — Cloudflare Access manages the login flow entirely.

---

## 6. Secrets

`npm run initialize` generates local secrets in `.dev.vars` for development.

For production, set secrets in Cloudflare before deploy:

```bash
# Backend (only needed if you use the admin translation helper)
cd backend
npx wrangler secret put OPENAI_API_KEY

# Chat worker
cd ../web/workers/chat
npx wrangler secret put OPENAI_API_KEY        # if LLM_PROVIDER=openai
npx wrangler secret put ANTHROPIC_API_KEY     # if LLM_PROVIDER=anthropic
npx wrangler secret put CHAT_SESSION_SECRET
npx wrangler secret put REFRESH_SECRET
```

---

## 7. Apply database migrations

```bash
cd backend

# Local D1 (created on first dev run)
npx wrangler d1 migrations apply menu-db --local

# Remote D1 (production)
npx wrangler d1 migrations apply menu-db --remote
```

The initial migration creates all tables and seeds a singleton `settings` row
with name "My Restaurant". You'll edit that from `/admin` later.

---

## 8. Run locally

Three terminals:

```bash
# 1. Backend API
cd backend && npm run dev          # → http://localhost:8787

# 2. Chat worker
cd web/workers/chat && npm run dev # → http://localhost:8788

# 3. Frontend
cd web && npm run dev              # → http://localhost:3000
```

Open <http://localhost:3000/admin>. In local dev, Cloudflare Access isn't
in the loop — `requireAuth` returns 503 because `ACCESS_TEAM_DOMAIN` /
`ACCESS_AUD` aren't set. To bypass during dev, either point at the deployed
backend (`NEXT_PUBLIC_API_URL` in `.env.local`) or use the Playwright admin
bypass that injects a fake user into `window.__playwright_admin__` (see
`web/src/app/admin/AdminContent.tsx`).

---

## 9. Deploy

```bash
# Backend
cd backend && npm run deploy

# Chat worker
cd ../web/workers/chat && npm run deploy

# Frontend (Cloudflare Pages)
cd ../.. && CF_PAGES_PROJECT=menu npm run deploy:cf
```

For Pages, set the same `NEXT_PUBLIC_*` vars in the Pages dashboard
(Settings → Environment variables) so production builds pick them up — or,
if you build locally, put them in `web/.env.production.local` (gitignored).

---

## 10. Custom domain

Point your domain at the Pages project:

1. Cloudflare Pages → your project → **Custom domains** → add your domain.
2. Add the same domain to `ALLOWED_ORIGINS` in `backend/wrangler.toml` and
   `web/workers/chat/wrangler.toml`. Re-deploy both workers.
3. In `web/.env.production.local`, set `NEXT_PUBLIC_API_URL` and
   `NEXT_PUBLIC_CHAT_WORKER_URL` to your worker URLs and re-build / re-deploy
   the frontend.
4. Update the Cloudflare Access apps (Zero Trust → Access) to cover the new
   custom domain too — add it to the application's hostnames list.

That's it.

---

## Cost notes

- Cloudflare free tier covers a small restaurant comfortably.
- OpenAI usage scales with chat traffic. Set a hard monthly cap.
- If you do not need AI chat, skip step 6's chat-worker secrets and disable
  `ai_chat_enabled` from `/admin?s=settings-chat-ai`.

---

## Troubleshooting

- **`wrangler.toml not found`** — copy from `wrangler.toml.example`.
- **403 on `/admin`** — your email isn't in `ADMIN_EMAILS` on the backend
  worker. Add it and `npx wrangler deploy`.
- **401 / 503 on `/admin`** — Cloudflare Access isn't in front of the route, or
  `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` aren't set on the backend Worker. Re-check
  the Access app config in Zero Trust and the wrangler vars.
- **CORS errors** — your frontend origin isn't in `ALLOWED_ORIGINS`. Update
  both backend and chat worker `wrangler.toml`, redeploy, and double-check
  Pages build-time env vars match what the workers know about.
- **Empty menu / `Menu not published`** — go to `/admin?s=settings-publishing`
  and toggle the menu to Published.
- **Chat returns 503 / 403** — `OPENAI_API_KEY` not set on the chat worker, or
  `ai_chat_enabled` is false. Both are configurable in the admin UI.
