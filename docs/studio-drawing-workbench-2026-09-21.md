# Drawing workbench implementation — 2026-09-21

Status: implementation and release validation. A merge is not a production deployment.

## Implemented behavior

The desktop editor now places the actual brush catalogue beside the tool rail. Search, favorites, recent brushes, material categories, rendered stroke previews and the expanded catalogue reuse the existing selection and persistence paths. Selecting a brush keeps the dock open. The dock does not steal canvas focus, consume Escape or close on an outside pointer. Its expanded view replaces the dock's catalogue rather than mounting a duplicate interactive catalogue.

New workspaces start in the existing lineart profile with a visible brush dock and a collapsed page navigator. Previously saved profiles are not renamed or silently converted: an absent dock preference normalizes to closed. The dock preference participates in workspace equality, SQLite persistence, device layout capture and strict portable workspace import/export. Late brush preference hydration cannot overwrite a user's search or category edits. Paint/erase browsing is scoped to its operation and owner.

Selection, transform, pen, eraser, fill, rectangular selection and lasso are safe first-run recommendations. Explicit saved configurations may contain any supported 1/27/35 tools in the user's order, including hiding recommended tools. Hidden tools remain executable through All Tools without changing their pinned state. Transform keeps a consistent name; saved order takes precedence over the original recommended placement. Desktop contextual selection and mobile selection actions enter the same host command. That command reveals the existing numerical geometry panel and retains its original document/history authority. Locked selections and incomplete multi-selections fail closed.

Desktop brush and selection options share a stable top band instead of covering the bottom of the canvas. The desktop module is loaded only on desktop; the existing mobile dock remains the mobile authority. Initial quick-start coaching begins as an expandable hint rather than a large mandatory card.

Restoring the drawing layout changes only UI layout. It preserves brush presets, document data, command-bar preferences and quick actions. The prior layout is retained as a named custom workspace and a same-session undo point; if a backup cannot be created, restoration does not proceed. Owner changes invalidate access to another owner's temporary undo point.

## Verification

Run focused unit/integration tests for workspaces, palette codecs, toolbar visibility, drawing/selection options, quick-start, mobile editing and existing selection-transform contracts. Do not replace the existing core CI, typecheck, lint, secret scanning or bundle ratchet.

The browser workflow is reproducible with:

```sh
DRAWING_QA_ORIGIN=http://127.0.0.1:5274 \
  pnpm exec tsx scripts/qa-drawing-workbench.mjs
```

The workflow creates only an ephemeral drawing in an isolated browser context. It checks the actual catalogue, stroke creation, precision-transform entry, numerical edit/cancel, Undo/Redo, durable OPFS/SQLite recovery, layout restore/undo and responsive geometry. Local recovery is opened through the canonical canvas route: a temporary collaboration-room URL without an available Core API is not treated as permission to bypass document-access guards.

## Release boundaries

The release changes the web surface only. It does not change database migrations, authentication authority, brush source archives, rendering engines, collaboration ownership or paid infrastructure plans. Existing advanced deformation engines remain available through their established tools; this work does not certify every deformation against every object type or claim to introduce a replacement engine. Real pen pressure, tilt, palm rejection, all import/export formats and large-canvas latency still require their dedicated hardware/corpus checks.

Before production traffic changes, record the exact merged main SHA, successful required CI, build hash, current Worker version and unchanged Core origin/R2 bindings. Upload a candidate with existing variables preserved, verify the candidate in the browser, then switch traffic once. Keep the previous Worker version as the rollback target. Record deployment and post-release smoke evidence separately from this source document.
