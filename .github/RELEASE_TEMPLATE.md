<!--
GitHub Release body template. Copy this whole file into the "Describe this
release" textarea when drafting a release on GitHub, OR pass it via
  gh release create vX.Y.Z --notes-file .github/RELEASE_TEMPLATE.md
and edit the body before publishing.

Drop sections that don't apply, but DO NOT drop "Breaking changes" or
"Upgrade actions" — leave them with "None." if there are none. Self-hosters
read these first.

Source material: every PR merged since the previous tag carries one or more
`release:` labels. PRs labelled `release: breaking`, `release: migration`,
or `release: upgrade-action` have prefilled prose under their respective
template sections — copy/aggregate those into the body below. PRs labelled
only `release: internal` are skipped.

  LAST=$(git describe --tags --abbrev=0)
  gh pr list --state merged \
    --search "merged:>$(git log -1 --format=%cI "$LAST")" \
    --label "release: breaking" --label "release: migration" \
    --label "release: upgrade-action" \
    --json number,title,body,labels
-->

## Summary

<!-- 1-3 sentences on what shipped and why an operator should care. -->

## Breaking changes

<!--
List anything that requires action from a self-hoster:
- API/catalog response shape changes that break old frontends
- Schema fields removed or renamed
- Admin UI workflows that changed
- Public route changes (/menu URL pattern, etc.)
- Env var renames or removals

Use "None." if there genuinely are no breaking changes.
-->

None.

## Upgrade actions

<!--
Concrete commands and clicks an operator runs after `git pull` to land this
release. Always include the migration step even if there are no migrations
in this release — it's a no-op in that case and the muscle memory is worth
preserving.

Example:

```bash
(cd backend && npx wrangler d1 migrations apply menu-db --remote)
(cd backend && npm run deploy)
(cd web/workers/chat && npm run deploy)  # if changed
(cd web && npm run deploy:cf)
```

Then list any post-deploy admin steps:
- Sign in to /admin?s=menus and ...
- Visit ... and confirm ...
-->

```bash
git pull
(cd backend && npx wrangler d1 migrations apply menu-db --remote)
(cd backend && npm run deploy)
(cd web && npm run deploy:cf)
```

## Migrations

<!--
For each new file under backend/drizzle/*.sql, one bullet. Mention any
data backfill, not just schema. Skip the section if no migrations changed.
-->

- _none in this release_

## What changed

<!-- Optional. Mirror the matching CHANGELOG.md entry. -->

### Added
-

### Changed
-

### Removed
-

## Notes for AI agents

<!--
Optional but encouraged for any release that lands non-obvious decisions.
Things to record:
- Why a particular shape was chosen over an alternative we tried.
- Files that have an invariant worth preserving (e.g. two lists that must
  stay in sync, a delete-then-insert pattern that's intentional).
- Workarounds for tooling quirks (e.g. Turbopack barrel issue, drizzle-kit
  interactive prompts).

These notes carry over into CHANGELOG.md so future LLM sessions get the
context without having to dig through commits.
-->

_none_

---

Full diff: https://github.com/vekexasia/tony-menu/compare/PREV_TAG...THIS_TAG
Changelog entry: [CHANGELOG.md](https://github.com/vekexasia/tony-menu/blob/main/CHANGELOG.md)
