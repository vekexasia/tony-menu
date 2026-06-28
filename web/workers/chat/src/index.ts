import type { Env } from './types';
import { handleChat } from './chat/handler';
import { getCorsHeaders, handleCorsPreFlight } from './middleware/cors';
import { invalidateCache, getMenuData } from './menu/cache';
import { checkSessionIssueRateLimit } from './middleware/rate-limit';
import { checkMenuForChat } from './middleware/menu-guard';
import { createSessionToken, verifySessionToken } from './middleware/session';

function json(data: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const corsResponse = await handleCorsPreFlight(request, env);
    if (corsResponse) return corsResponse;

    const corsHeaders = await getCorsHeaders(request, env);

    // Route: POST /session — creates a signed anonymous chat session token.
    // Issuance is gated by Cloudflare IP so opening the modal is cheap but
    // token churn still has friction.
    if (url.pathname === '/session' && request.method === 'POST') {
      const ip = request.headers.get('cf-connecting-ip') || 'local';
      const rateLimitResp = checkSessionIssueRateLimit(ip);
      if (rateLimitResp) {
        return new Response(rateLimitResp.body, {
          status: rateLimitResp.status,
          headers: { ...Object.fromEntries(rateLimitResp.headers.entries()), ...corsHeaders },
        });
      }

      const guardResult = await checkMenuForChat(env.DB);
      if (guardResult === 'draft') {
        return json({ error: 'Menu not available' }, 404, corsHeaders);
      }
      if (guardResult === 'chat_disabled') {
        return json({ error: 'Chat not available' }, 403, corsHeaders);
      }

      try {
        const { token, session } = await createSessionToken(env);
        return json({ token, expiresAt: session.exp }, 200, corsHeaders);
      } catch (err) {
        console.error('[SESSION] failed:', err);
        return json({ error: 'Session unavailable' }, 500, corsHeaders);
      }
    }

    // Route: POST /chat — requires a signed anonymous chat session token.
    if (url.pathname === '/chat' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return json({ error: 'Unauthorized' }, 401, corsHeaders);
      }

      try {
        const session = await verifySessionToken(env, authHeader.slice(7));
        return handleChat(request, env, corsHeaders, session, ctx);
      } catch (authErr) {
        console.warn(`[AUTH] 401 reason: ${authErr instanceof Error ? authErr.message : String(authErr)}`);
        return json({ error: 'Unauthorized' }, 401, corsHeaders);
      }
    }

    // Route: POST /refresh-menu — invalidates the KV/in-memory menu cache.
    if (url.pathname === '/refresh-menu' && request.method === 'POST') {
      let body: { secret?: string } = {};
      try {
        body = await request.json() as { secret?: string };
      } catch {
        return json({ error: 'Invalid JSON' }, 400, corsHeaders);
      }

      if (body.secret !== env.REFRESH_SECRET) {
        return json({ error: 'Unauthorized' }, 401, corsHeaders);
      }

      await invalidateCache(env);
      ctx.waitUntil(getMenuData(env).catch(() => {}));

      return json({ ok: true }, 200, corsHeaders);
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', service: 'menu-chat' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};

export default worker;
