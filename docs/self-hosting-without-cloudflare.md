# Self-host without Cloudflare

This is the provider-independent deploy path for TonyMenu: Docker, Node, SQLite, local file storage, and Caddy. Cloudflare remains the recommended hosted path, but it is not required.

## What runs

| Service | Purpose |
|---|---|
| `proxy` | Caddy entrypoint on port 8080 |
| `web` | static Next.js export |
| `backend` | Hono API on Node |
| `chat` | chat worker on Node with in-memory cache/daily cap |
| `tony-data` | SQLite DB + uploaded assets |

Admin auth is delegated to the reverse proxy. The backend trusts `X-Forwarded-Email`, so never expose `backend:8787` directly to the internet.

## Quick start

```bash
cp .env.self-host.example .env

# Required by Caddy basic auth. Replace the plaintext password.
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'change-this-password'
# paste the output into ADMIN_PASSWORD_HASH in .env

docker compose up --build
```

Open the proxy on port 8080.

Admin is at `/admin`. Caddy protects `/admin*`, `/api/admin*`, and `/api/catalog/publish` with basic auth, then injects `X-Forwarded-Email` before proxying those API requests to the backend.

## Environment

Create `.env` from this template:

```bash
PUBLIC_URL=
ADMIN_USER=admin
ADMIN_EMAIL=admin@example.com
ADMIN_EMAILS=admin@example.com
ADMIN_PASSWORD_HASH=
ORDER_TIME_ZONE=UTC
ALLOWED_HOST_SUFFIXES=localhost

# Optional AI chat. Leave empty to disable provider calls until configured.
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
DAILY_AI_REQUEST_LIMIT=

# Required. Generate random values before public deploy.
CHAT_SESSION_SECRET=
REFRESH_SECRET=
```

`PUBLIC_URL` is used for uploaded image URLs (`/assets/...`). Set it to the public origin users open in their browser before uploading images.

## Data and backups

Data lives in the Docker volume `tony-data`:

- `/data/tony-menu.sqlite` — SQLite database
- `/data/bucket` — uploaded images and catalog assets

The chat worker's menu cache and daily AI cap are in-memory. They reset when the chat process restarts.

Backup:

```bash
docker compose exec backend sh -lc 'cp /data/tony-menu.sqlite /data/tony-menu.sqlite.bak'
docker run --rm -v risto-menu_tony-data:/data -v "$PWD":/backup alpine tar czf /backup/tony-data.tgz /data
```

Restore by stopping the stack and replacing the volume contents.

## Production notes

- Put TLS in front of Caddy or change `Caddyfile` to use your real site address.
- Keep `backend` and `chat` private. Only expose `proxy`.
- If you already use Authelia, Authentik, oauth2-proxy, or another SSO proxy, replace Caddy basic auth and keep forwarding a trusted email header as `X-Forwarded-Email`.
- SQLite is the supported non-Cloudflare database for this path. Add Postgres only if SQLite becomes a real limit.
