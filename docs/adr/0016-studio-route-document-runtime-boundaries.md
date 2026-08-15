# ADR-0016: Studio route, document runtime, and parallel feature boundaries

**Status:** Accepted
**Date:** 2026-08-16
**Deciders:** ToonSpectrum Studio maintainers

## Context

`StudioPage.tsx` grew into a single integration owner for URL parsing, document identity,
publishing, collaboration, autosave, drawing engines, optional DCC tools, and most editor chrome.
The file is now large enough that unrelated feature work regularly overlaps the same source file.
At the same time, many structural tests intentionally read `StudioPage.tsx` as source text to pin
hot-path, durability, and lazy-loading contracts. Moving the entire file or rewriting the editor in
one pass would create a large review surface and would weaken those established contracts.

The existing route also mixed two different kinds of identity:

- **Document identity:** account, saved work, remix source, and draft epoch. A change here must
  create a new editor runtime.
- **Presentation identity:** canvas, comic, animation, DCC workbench mode, and publish surface.
  Most changes here should preserve the active document runtime, and DCC faults must not unmount
  the canvas, collaboration session, or undo history.

Legacy query aliases (`id`, `remix`, and `mode=upload`) made those rules harder to audit. In
particular, upload detection used different duplicate-query rules in the router and editor, remix
was absent from the outer lifecycle key, and an optional DCC render failure escaped to the global
route boundary.

## Decision

Studio adopts a strangler-style router and runtime boundary around the existing editor.

### Route ownership

- `AppRouter` owns one lazy `/studio/*` entry and loads `studio-router/StudioRouter` rather than
  importing the editor or companion surface directly.
- `studio-router/studio-route-manifest.ts` is the pure route-resolution authority. React
  components consume its discriminated result instead of reparsing path and query aliases.
- `studio-workspace-route.ts` owns the validated workspace grammar, canonical path builders, and
  document/presentation identity helpers. Duplicate or conflicting identity parameters fail
  closed rather than selecting the first value.
- Legacy aliases remain accepted at the boundary and are replaced with canonical paths. New links
  use path identity:

  | Intent | Canonical path |
  | --- | --- |
  | Draft canvas | `/studio` |
  | Saved canvas | `/studio/work/:workId/canvas` |
  | Comic / animation | `/studio[/work/:workId]/comic` and `/animation` |
  | DCC mode | `/studio[/work/:workId]/3d/dcc/:mode` |
  | Remix | `/studio/remix/:sourceWorkId/:surface` |
  | Publish | `/studio[/work/:workId]/publish` |
  | Companion | `/studio/companion/:surface` |

### Runtime lifetime

- `StudioDocumentRuntimeBoundary` is keyed only by the canonical document identity derived from
  account, work/remix identity, and draft epoch.
- Moving among canvas, comic, animation, or DCC modes for the same document preserves the editor
  owner. Changing work, remix source, signed-in account, or an established draft epoch remounts it.
- Publish is a route-level lazy surface and does not statically import the editor monolith.
- Optional DCC UI is wrapped by `StudioSurfaceErrorBoundary`. A render or rejected lazy-chunk
  failure replaces only that surface with an accessible recovery screen; the document, CRDT
  connection, and undo history stay mounted.
- The global route error boundary resets on the complete location identity, so a valid query-only
  navigation can recover from an error latched on a previous location.

### Incremental editor extraction

- `StudioPage.tsx` becomes a legacy editor adapter, not a route parser or publish router. The large
  editor remains in place while established source-shape tests are migrated feature by feature.
- New product work must enter through a focused model/controller/component module and a narrow
  adapter in the legacy editor. It must not add a second route parser, document key, persistence
  authority, or heavyweight eager dependency to `StudioPage.tsx`.
- Extracted modules follow one-way ownership: the editor may import a feature boundary; feature
  modules must not import the editor.
- Pure policy and presentation models remain independent from React and browser runtimes where
  practical. Menubar ordering and workspace recommendations are examples of this split.
- Source byte count is advisory rather than a release veto. Runtime isolation, analyzable lazy
  imports, one-way dependencies, and focused module contracts are the enforced boundaries.

### Parallel ownership map

| Change type | Primary owner | Legacy editor seam |
| --- | --- | --- |
| URL grammar and aliases | `studio-workspace-route.ts` | Canonical route prop only |
| Route loading and document keys | `studio-router/` | `LegacyStudioEditorAdapter` |
| Optional surface recovery | `StudioSurfaceErrorBoundary.tsx` | One wrapper around the lazy surface |
| Menu information architecture | `studio-main-menu-presentation.ts` | Presented groups passed to chrome |
| Workspace onboarding | `studio-workspace-recommendation.ts` and component | Existing switch transaction callback |
| Drawing, CRDT, or autosave feature | Focused controller/runtime module | Narrow state/handler adapter with a boundary test |

Contributors working in parallel should select one row as their source ownership. Work that needs
two rows should land as separate commits so route, runtime, and presentation changes remain
independently reviewable.

## Options considered

### Keep query routing in `StudioPage.tsx`

This has the lowest immediate edit cost, but preserves duplicate identity parsers, makes publish
and DCC failures share the editor's fate, and keeps every route change in the largest conflict
hotspot.

### Move or rewrite the complete editor immediately

This would make the file name smaller but not the underlying system. It would also invalidate many
source-shape safety tests at once, obscure existing user changes in a large rename, and make
regression attribution difficult.

### Add a second, versioned Studio application

This permits a clean rewrite but creates two authorities for documents, autosave, collaboration,
and navigation. The repository already forbids version-suffixed parallel Studio applications.

### Add an outer strangler boundary and extract incrementally

This separates identity and failure domains now, preserves proven editor behavior, and creates
stable file ownership for subsequent parallel extraction. It has the cost of retaining a clearly
labelled legacy adapter during the migration.

## Consequences

- Canonical URLs are shareable and lifecycle behavior can be tested without rendering the editor.
- Canvas/DCC navigation for one document no longer implies a document-runtime remount.
- Remix and duplicate upload aliases participate in the same fail-closed identity contract at
  every layer.
- Publish, companion, and optional DCC code have independent lazy and error boundaries.
- `StudioPage.tsx` remains large in the near term. The accepted metric is not a cosmetic rename or
  arbitrary byte ceiling; it is that route, presentation, persistence, and specialist work can be
  developed outside it through enforced one-way seams.
- Placeholder routes are scaffolding only. They must not claim that unsaved in-memory editor state
  is retained after leaving the editor runtime.
- Route and runtime changes require pure resolver tests plus a mounted-lifetime test that proves
  same-document surface navigation preserves an instance and document-identity navigation replaces
  it.

## Follow-up extraction order

1. Move autosave lease/session leadership into `useStudioAutosaveDocumentRuntime`, including a
   follower-to-leader write test and session reopen contract.
2. Completed in this delivery: fence Hokusai live-worker ownership with close-safe prewarm
   generations, pending-start cancellation, and stale callback rejection. A provider hook remains
   optional if the editor integration grows beyond the runtime's current narrow adapter.
3. Add generation-safe release for suspended BG3D retained owners before a new route takes over.
4. Continue extracting editor subsystems only when their state, mutation fence, and durability
   owner can be expressed as one focused contract and tested independently.
