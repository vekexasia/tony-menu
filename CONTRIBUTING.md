# Contributing to TonyMenu

Thanks for your interest. This project is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE) — anyone may read, fork,
self-host, and contribute back for noncommercial use. Commercial use requires
a separate license (see [COMMERCIAL.md](COMMERCIAL.md)).

## Ground rules

- By submitting a pull request, you agree that your contribution is licensed
  under the same terms as the rest of the project (PolyForm Noncommercial 1.0.0)
  and that the maintainer may also relicense it under a commercial license.
- Be civil. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Security issues: do **not** open a public issue. See [SECURITY.md](SECURITY.md).

## Development setup

1. Fork the repo and clone your fork.
2. Install dependencies:
   ```bash
   npm ci
   cd web/workers/chat && npm ci
   ```
3. Copy the example env files and fill in values:
   ```bash
   cp backend/wrangler.toml.example backend/wrangler.toml
   cp backend/.dev.vars.example backend/.dev.vars
   cp web/.env.local.example web/.env.local
   cp web/workers/chat/wrangler.toml.example web/workers/chat/wrangler.toml
   cp web/workers/chat/.dev.vars.example web/workers/chat/.dev.vars
   ```
4. Follow [docs/self-hosting.md](docs/self-hosting.md) to provision Cloudflare
   resources (D1, KV, R2) and Cloudflare Access apps.

## Workflow

1. Create a topic branch off `main`.
2. Run the relevant test suites locally:
   ```bash
   cd backend && npm run check && npm run test:run
   cd web && npm run test:run && npm run build
   cd web/workers/chat && npx tsc --noEmit && npm run test:run
   ```
3. Open a pull request describing the change and the motivation.
4. CI must pass before review.

## Style

- TypeScript strict mode everywhere.
- Reuse existing components — see [CLAUDE.md](CLAUDE.md) for project conventions.
- Tailwind for styling.
- One feature/fix per PR. Keep diffs small.

## Release impact labels

Every PR must carry at least one `release:` label so the next release can be
assembled from merged PRs without re-reading every diff:

- `release: breaking` — public API shape, admin workflow, or DB schema change
  requiring an upgrade action.
- `release: migration` — adds a file under `backend/drizzle/*.sql`.
- `release: upgrade-action` — operators must run a manual step on upgrade.
- `release: internal` — no user-visible impact (refactor, tests, docs, CI).

A single PR can carry several. Use `release: internal` as the default for PRs
that genuinely don't affect users — that signals "consider me, then skip me"
rather than "I forgot to label". The PR template in
[.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) prompts
the author to fill in details for each non-internal label they tick; that text
flows into the release body verbatim.

## Releasing

1. Find the previous tag: `LAST=$(git describe --tags --abbrev=0 2>/dev/null
   || git rev-list --max-parents=0 HEAD)`.
2. List PRs that need release-note coverage:
   ```bash
   gh pr list --state merged --search "merged:>$(git log -1 --format=%cI "$LAST")" \
     --json number,title,labels,body \
     --label "release: breaking" --label "release: migration" --label "release: upgrade-action"
   ```
   Each of these contributes a paragraph to the release body — copy the
   "Breaking change details" / "Migration & upgrade actions" sections from
   each PR description.
3. Add a new dated entry at the top of [CHANGELOG.md](CHANGELOG.md). Always
   keep **Breaking changes**, **Migrations**, and **Upgrade actions**
   subsections — write "None." rather than dropping them.
4. Tag the release commit (`git tag vYYYY.MM.DD && git push --tags`).
5. Draft the GitHub release body from
   [.github/RELEASE_TEMPLATE.md](.github/RELEASE_TEMPLATE.md):
   `gh release create <tag> --notes-file .github/RELEASE_TEMPLATE.md` and
   edit the resulting body. Paste the labelled PR content into the matching
   sections.

The release body should be self-contained — operators should not need to
click through to CHANGELOG.md or individual PRs to find out whether they
have work to do.

## Reporting bugs

Open an issue with a clear repro, expected vs. actual behaviour, and your
deployment context (self-hosted / dev / version).
