# Security Policy

## Supported versions

TonyMenu does not currently issue numbered releases. Security fixes land on
the `main` branch and are deployed to the canonical hosted instance.
Self-hosters should track `main`.

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

Email **vekexasia@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- The impact you believe it has
- Any proposed remediation

Please give the maintainer a reasonable window to respond before disclosing
publicly. We aim to acknowledge reports within 5 business days.

## Scope

In scope:

- The `backend/` Cloudflare Worker (Hono API)
- The `web/workers/chat/` Cloudflare Worker
- The `web/` Next.js app
- The shared `packages/schemas/` package

Out of scope:

- Third-party services we depend on (Cloudflare, OpenAI) — report those upstream.
- Bugs in self-hosters' Cloudflare configurations.
- Denial-of-service via uncapped resource consumption on a self-hosted
  instance — operators should configure their own rate limits.

## What we care about

- Authentication / authorization bypass on `/admin/*` routes
- Tenant isolation breaches across `restaurant_memberships`
- SQL / prompt-injection against the chat worker
- Token / session secret exposure
- Public-catalog leaks of unpublished menus
