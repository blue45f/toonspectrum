# Character Platform V2 foundation — 2026-09-07

## Scope

This increment implements the first mergeable slice of the Character Shaper quality roadmap. It is
intentionally smaller than the complete multi-release programme: the existing VRM workshop remains
operational while a renderer-neutral document, command, capability, operation, and export-planning
foundation is added beside it.

## Delivered

1. A serializable `CharacterDocumentV2` and strict parser.
2. Lossless projection from the current 15-slot recipe, including separate accessory and left/right
   hand selections.
3. Stable path-level document diffing.
4. A pure revision-checked command dispatcher and immutable command receipt.
5. Shared/exclusive resource leases for document, render, paint, ink, pose-preview, and export work.
6. An evidence-based compatibility grade derived from the existing model capability profile.
7. PSD/PNG export preflight with pass availability, memory estimation, and a 4K tile-worker route.
8. A current Character Shaper host-to-document projection seam.
9. Slot-rail support indicators that expose partial, unavailable, and unknown catalogue support
   without hiding those slots.

## Validation in the implementation environment

- Strict TypeScript compilation of the new pure modules against a contract-compatible type stub:
  successful.
- TypeScript transpilation diagnostics for all changed TS/TSX files: zero.
- Standalone runtime assertions against the compiled foundation: 33 checks passed.
- Full repository lint, typecheck, Vitest, browser Character Shaper verification, and production
  build are delegated to the protected pull-request CI because the local environment does not carry
  the repository dependency installation or its required Node 24/pnpm 11 toolchain.

## Honest remaining work

The foundation does not mark the complete SHAPER-level roadmap as finished. Runtime model
thumbnails, part-preset persistence UI, Canonical authored assets, Pose V2, skinned 3D ink, semantic
render passes, and the tile-based PSD worker remain follow-on increments. The purpose of this merge
is to give those features one versioned document and one transaction boundary instead of adding
more direct host mutations.
