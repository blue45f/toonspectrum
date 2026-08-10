# ADR-0015: Studio paint and erase tool families

**Status:** Accepted
**Date:** 2026-08-10
**Deciders:** ToonSpectrum Studio maintainers

## Context

Studio exposes pen and eraser as separate top-level tools, but historically stored one shared
brush identity, size, opacity, and dynamics snapshot. The ordinary eraser had no stable preset
identity, while the kneaded eraser was a paint-catalog entry that switched `drawMode` as a side
effect. That mismatch made B/E transitions destructive, mixed paint and erase entries in one
catalogue view, and allowed a named eraser to collapse into the generic eraser at renderer
boundaries.

Artists first choose an operation—put pigment down or lift it—and then choose the material used
for that operation. The UI and authoring state should follow that mental model even though both
operations can share pointer sampling, pressure, stabilization, geometry, catalog search, and
preview infrastructure.

## Decision

Studio treats `paint` and `erase` as first-class tool operations.

- Every resolved catalogue selection has an explicit operation.
- The ordinary eraser is a stable `standard-eraser` preset rather than an anonymous mode.
- Paint and erase each remember their last preset and authoring snapshot independently.
- The independent snapshots persist in the app-lifetime SQLite authority under the stable
  `studio-tool-operation-memory-v12` namespace. Hydration and writes are asynchronous and never
  block pointer or render hot paths. Deterministic normalization and merge helpers remain in the
  synchronous Studio entry, while the persistence controller and Worker-backed SQLite adapter are
  loaded as a separate dynamic chunk when hydration starts.
- SQLite/OPFS failure is explicit and fail-soft: deterministic in-memory defaults remain usable,
  but Studio does not silently select localStorage, IndexedDB, or an in-memory durable substitute.
- B selects the last paint preset; E selects the last erase preset. Neither key toggles the other
  operation.
- One catalogue component, search implementation, favorite store, and preview system are shared;
  the active operation filters what the artist sees.
- Eraser previews demonstrate their result on existing ink. Eraser opacity is labelled as erase
  strength in artist-facing UI.
- A named eraser's declared strength is semantic operation state, so selecting an eraser applies
  its own strength even when the paint-opacity preference is locked. The lock still preserves
  opacity while switching between paint presets; it cannot silently turn the full-strength
  `standard-eraser` into a partial lift.
- Persisted draw elements remain mode-authoritative for backwards compatibility. A missing brush
  identity on a legacy eraser normalizes to `standard-eraser` only at the authoring/catalogue
  boundary; document replay never guesses operation from a display name.
- Renderer-specific behavior is declared as capabilities. Low-density, stroke-local opacity is a
  kneaded-eraser capability, not a property of every erase operation.

## Options considered

### Keep one brush state and improve labels

| Dimension | Assessment |
| --- | --- |
| Complexity | Low |
| Artist predictability | Low |
| Extensibility | Low |
| Migration cost | Low |

This leaves destructive B/E transitions and anonymous generic eraser state intact.

### Duplicate a complete eraser catalogue

| Dimension | Assessment |
| --- | --- |
| Complexity | High |
| Artist predictability | High |
| Extensibility | Medium |
| Maintenance | Poor |

With two initial erasers, duplicating search, favorites, recent items, focus management, and
mobile presentation creates more surface area than product value.

### Separate tool families with a shared picker

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium |
| Artist predictability | High |
| Extensibility | High |
| Maintenance | Good |

This matches the visible tool model, retains one audited catalogue surface, and allows new hard,
soft, textured, and pixel erasers without turning each one into a mode exception.

## Consequences

- Switching tools no longer changes the other tool's preset, width, strength, color, or dynamics.
- Paint opacity locking and eraser strength are deliberately separate contracts. Size locking may
  span both operations, while erase selection always restores the selected eraser's declared
  destructive strength.
- Writes are serialized through the tool-operation memory controller. Edits made while SQLite is
  hydrating win only for their own operation slot, so a fast paint edit cannot erase the stored
  eraser snapshot (and vice versa).
- Active property edits are proactively persisted through a 250 ms latest-value coalescer. At most
  one write and one trailing latest snapshot exist, so slider drags never create an unbounded
  promise queue and the pointer/render hot path never awaits storage.
- Changes made before the persistence chunk resolves occupy one replaceable latest-snapshot slot.
  Successful loading clears that slot before scheduling it; failed loading keeps only that latest
  value and permits one guarded retry on an explicit online signal. Closing Studio schedules the
  latest normalized snapshot and requests a non-blocking flush.
- A write failure leaves the controller `dirty` and `degraded`, is announced once per failure
  episode, participates in Studio's existing unsaved-work unload guard, and remains retryable. A
  successful retry clears both the error episode and dirty signal; there is no localStorage,
  IndexedDB, or durable memory fallback.
- Closing the SQLite Dedicated Worker is an atomic admission barrier. Concurrent callers share one
  close promise, new RPCs are rejected, prior pending RPCs are settled explicitly, and the Worker
  terminates exactly once after the close handshake.
- Catalogue filters, recent items, favorites, and quick slots must resolve operation from canonical
  metadata rather than relying on category names.
- Existing anonymous eraser strokes remain valid and pixel-identical.
- New eraser engines must declare opacity semantics, pressure behavior, symmetry support, and live
  backend compatibility before entering the selectable catalogue.
- Some legacy helpers keep compatibility projections such as `drawMode`, but new application code
  consumes explicit operation metadata.
- Tests must cover live, released, settled, export, cursor, and WebGPU parity for each erase
  capability, not just property values on a synthetic draw element.

## Action items

1. Add explicit operation metadata and `standard-eraser` to the canonical catalogue.
2. Persist independent paint/erase authoring snapshots and make B/E deterministic.
3. Filter the shared catalogue by active operation and provide result-oriented eraser quick cards.
4. Normalize legacy anonymous eraser authoring state without rewriting stored draw elements.
5. Replace single-ID renderer predicates with capability lookups as additional eraser presets are
   introduced.
