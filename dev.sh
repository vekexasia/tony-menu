#!/usr/bin/env bash
# Start all three dev servers in separate wezterm tabs
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

start_pane() {
  local title="$1"
  local cwd="$2"
  local cmd="$3"
  local pane_id
  pane_id=$(wezterm.exe cli spawn --cwd "$cwd" -- bash -l)
  sleep 0.3
  wezterm.exe cli set-tab-title --pane-id "$pane_id" "$pane_id: $title"
  printf '%s; exec bash -l\r' "$cmd" | wezterm.exe cli send-text --pane-id "$pane_id" --no-paste
  echo "  [$pane_id] $title"
}

echo "Starting risto dev servers..."
start_pane "backend"     "$ROOT/backend"                        "npx wrangler dev --port 8787 --persist-to .wrangler/state"
start_pane "chat-worker" "$ROOT/web/workers/chat"         "npx wrangler dev --port 8788"
# Same-origin API/chat paths so the app works through the tunnel (next.config.ts dev rewrites).
start_pane "next-dev"    "$ROOT/web"                      "NEXT_PUBLIC_API_URL=/api NEXT_PUBLIC_CHAT_WORKER_URL=/chat npm run dev"
# TryCloudflare quick tunnel: everything (app + /api + /chat proxies) rides one tunnel to :3000.
start_pane "cf-tunnel"   "$ROOT"                          "cloudflared tunnel --url http://localhost:3000 2>&1 | tee /tmp/cf-tunnel.log | grep --line-buffered -o 'https://[a-z0-9-]*\\.trycloudflare\\.com'"
echo ""
echo "Services:"
echo "  Next.js  → http://localhost:3000/it/menu/?aiChat=1"
echo "  Backend  → http://localhost:8787"
echo "  Chat     → http://localhost:8788"
echo "  Tunnel   → see cf-tunnel tab for the public https://*.trycloudflare.com URL"
