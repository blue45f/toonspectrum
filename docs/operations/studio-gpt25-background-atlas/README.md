# GPT Image 2.5 background atlas transfer

## Historical transfer payload

The bytes preserved from `feat/studio-gpt25-2d-background-atlas-20260916` are
kept only for forensic comparison so the abandoned branch can remain deleted
without losing its original payload.

- `overlay.tar.gz` is a truncated gzip (`invalid distance` / incomplete stream).
- `parts/part00`–`part09` are staged transfer chunks, but they do not form a
  valid gzip stream and have no suffix/prefix overlap of at least 8 bytes.
- These files are **not** the maintained source of the Studio background atlas
  and should not be copied into product code or treated as installable assets.

The manual workflow `Diagnose studio GPT Image 2.5 background atlas transfer`
remains available through `workflow_dispatch` for diagnostics only. It does not
run on pushes or pull requests.

## Current maintained implementation

The intended atlas work was reconstructed against current `main` and merged in
PR #1548. Recovery no longer depends on repairing the truncated archive or
finding the original kit.

The canonical recipe-driven pipeline is:

- recipe catalog: `scripts/data/studio-2d-background-atlas-v1.json`
- recipe contract: `scripts/studio-2d-background-atlas-recipes.test.mjs`
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

The generator defaults to a dry run. Provider requests require both an explicit
`--execute` flag and a locally supplied `TOONSTUDIO_IMAGE_API_KEY`:

```bash
TOONSTUDIO_IMAGE_API_KEY=... \
  node scripts/generate-studio-2d-background-atlas.mjs --execute --limit 8
```

Newly generated assets remain `recommended: false` until full-frame manual
review and the installed-asset audit are complete.
