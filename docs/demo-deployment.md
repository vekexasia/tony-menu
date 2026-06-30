# Demo deployment

The public demo is deployed by `.github/workflows/deploy-demo.yml`.

## URLs

- Public menu: `https://demo.tonymenu.app/it/menu/`
- Admin: `https://demo.tonymenu.app/admin`
- API: `https://api.tonymenu.app`

## Cloudflare resources

Use resources separate from production:

- Worker: `risto-menu-demo-api`
- Pages project: `risto-menu-demo`
- D1 database: `risto-menu-demo-db`

The backend runs with `DEMO_MODE=true`. This bypasses Cloudflare Access only for the demo deployment, exposes the public admin, and resets demo data hourly through a Worker cron trigger.

## Required GitHub secrets and variables

Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Variables:

- `DEMO_D1_DATABASE_ID`

## One-time Cloudflare setup

1. Create the D1 database `risto-menu-demo-db` and store its ID in `DEMO_D1_DATABASE_ID`.
2. Add `api.tonymenu.app` as a Worker custom domain for `risto-menu-demo-api`.
3. Add `demo.tonymenu.app` as a custom domain for the Pages project `risto-menu-demo`.
4. Ensure DNS for both hostnames is managed by Cloudflare.

After that, pushes to `main` or manual workflow dispatches deploy the demo and seed it.
