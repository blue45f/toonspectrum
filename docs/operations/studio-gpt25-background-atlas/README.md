# GPT Image 2.5 background atlas

## Status

The incomplete transfer from `feat/studio-gpt25-2d-background-atlas-20260916`
was not a recoverable source archive. `overlay.tar.gz` was truncated and
`parts/part00`–`part09` did not form a valid gzip stream.

That transfer payload and its one-off diagnostic workflow have been removed
from the current tree after the work was reconstructed and merged in PR #1548.
The original bytes remain available in Git history through PR #1547 for
forensic comparison, but they are not a product input or a recovery source.

## Canonical pipeline

The maintained implementation is recipe-driven:

- recipe catalog: `scripts/data/studio-2d-background-atlas-v1.json`
- catalog contract: `scripts/studio-2d-background-atlas-recipes.test.mjs`
- dry-run/BYOK generator: `scripts/generate-studio-2d-background-atlas.mjs`
- installed-asset audit: `scripts/audit-studio-2d-background-atlas.mjs`
- generated manifest: `apps/web/src/domains/creator/studio-2d-generated-scene-manifest.json`
- runtime adapter: `apps/web/src/domains/creator/studio-2d-generated-backgrounds.ts`

Safe local checks:

```bash
node scripts/studio-2d-background-atlas-recipes.test.mjs
node scripts/generate-studio-2d-background-atlas.mjs --limit 2
node scripts/audit-studio-2d-background-atlas.mjs
```

The generator defaults to a dry run. Provider requests require an explicit
`--execute` flag and a local `TOONSTUDIO_IMAGE_API_KEY`:

```bash
TOONSTUDIO_IMAGE_API_KEY=... \
  node scripts/generate-studio-2d-background-atlas.mjs --execute --limit 8
```

Newly generated assets stay `recommended: false` until full-frame manual
review and audit are complete.
