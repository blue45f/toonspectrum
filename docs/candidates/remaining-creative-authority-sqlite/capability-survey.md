# Remaining creative authority SQLite capability survey

## Outcome

The shipped scene-snapshot and user-authored Emeres libraries now use the shared V12
`studio-local-v12.db` authority. The product path does not read the former scene-snapshot
IndexedDB database or `toonspectrum-studio-emeres-library` localStorage key. Those old APIs remain
only as explicit compatibility/test seams and are covered by the V12 destructive-discard boundary.

This survey was produced from direct browser-storage access in `src/domains/creator`:

```sh
rg -n --glob '!*.test.*' --glob '!*.spec.*' \
  '(globalThis|window)\.(localStorage|sessionStorage|indexedDB)|indexedDB\.(open|deleteDatabase)|localStorage\.(getItem|setItem|removeItem)' \
  src/domains/creator
```

Each hit was then checked for a shipped caller. A helper that merely accepts an injected `Storage`
object is not treated as a product authority unless a boot/runtime component supplies the browser
global.

## Candidate comparison

Storage quality here means semantic and canonical preservation, not rendered-pixel quality.
Latency percentiles and peak memory for these two new namespaces have not yet been measured in a
real browser OPFS run; functional sqlite-wasm round-trips must not be relabelled as performance
evidence.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Shared `@sqlite.org/sqlite-wasm` + OPFS SAH-pool, immutable snapshot records + canonical index | One app-lifetime database, crash-safe authority switch, strict per-record validation, no 96MB whole-library rewrite | Orphan-record vacuum, multi-tab semantic conflict UI, real browser latency and quota-fault evidence | Scene/PageState and metadata round-trip through the existing canonical record codec; no renderer object is stored | Functional round-trip measured; latency **unmeasured** | **Unmeasured** | Reuses the existing lazy SQLite WASM/runtime; TypeScript repository only | Canonical record bytes and sorted index order are deterministic | SQLite core public domain; npm wrapper Apache-2.0 | Low: stable scene-snapshot model to canonical record codec | Medium: immutable-orphan cleanup and OPFS policy | **Selected scene-snapshot product authority** |
| Shared SQLite/OPFS, one canonical Emeres KV envelope | A single atomic `kvSet`, strict all-or-nothing decode, serialized writes, removes base64 images from localStorage quota contention | Per-row paging is unnecessary at the current 30-item bound; real browser OPFS timing remains unmeasured | Exact image data URL, dimensions, timestamps, name and category are preserved; malformed/duplicate rows reject the whole library | Functional round-trip measured; latency **unmeasured** | **Unmeasured** | Reuses existing SQLite runtime; no new dependency | Canonical property order and invocation-ordered mutation queue | SQLite core public domain; npm wrapper Apache-2.0 | Low: one validated JSON envelope | Low at current bound; later growth should use structured rows | **Selected Emeres product authority** |
| Separate IndexedDB per feature | Blob-friendly browser primitive and existing scene-snapshot implementation | Splits authority across databases, separate deletion/recovery/version logic, no shared SQL diagnostics | Existing scene codec is sound, but corrupt rows were historically skipped on list | Not rerun | Unmeasured | Browser built-in | Transactional per database | Web standard | Medium: independent IDB schema and lifecycle | High authority fragmentation | **Legacy explicit seam only for scene snapshots** |
| localStorage JSON | Synchronous and universally simple | Small quota, main-thread serialization, no transactions, base64 inflation, silent quota failures | Existing Emeres code silently ignored writes and partially filtered corrupt arrays | Not rerun | Browser-dependent | None | Key-level writes only | Web standard | Low initially | High data-loss and quota risk | **Rejected for durable creative data** |
| Memory-only state | Keeps the current tab interactive when durable storage fails | Lost on reload; cannot be presented as saved | Exact in-tab object is retained | Not applicable | Bounded by current UI state | None | Process-lifetime only | Application code | Low | Mislabelled persistence risk | **Explicit emergency state only, never silent fallback** |

## Product storage audit classification

### Already on V12 SQLite/OPFS and intentionally untouched

| Surface | Product authority | Classification |
|---|---|---|
| Autosave/checkpoint/workspace/history | Existing V12 SQLite/OPFS, journals and recovery stores | Durable project data; excluded by task scope |
| Brush and filter libraries | Structured SQLite tables and bounded repositories | Durable creative catalog; excluded by task scope |
| Animatic, translation memory, production bible | V12 SQLite KV namespaces | Durable production metadata; excluded by task scope |
| Creator-pack receipts/catalog rows | V12 SQLite product runtime | Durable installed creative catalog; excluded by task scope |
| Renderer tournament/cost samples | Structured SQLite | Operational metadata; excluded by task scope |

### Converted in this change

| Surface | Former product authority | V12 authority | Data-loss policy |
|---|---|---|---|
| Scene snapshot library | `toonspectrum-studio-scene-snapshot-library` IndexedDB | `studio-scene-snapshots-v12` namespace; immutable record keys + `index-v1` | No legacy read or import. Missing/corrupt/index-mismatched records fail the whole load. No partial salvage |
| Emeres user image-template library | `toonspectrum-studio-emeres-library` localStorage array | `studio-emeres-library-v12` / `library-v1` | No legacy read. Corrupt, duplicate, oversized or non-canonical data fails closed. Accepted failed edits are labelled tab-memory only |

### Remaining durable creative or operational authorities

These are not preference data. They remain explicit follow-up work and must not be reported as
SQLite-complete.

| Priority | Surface and shipped caller | Current authority | Classification / next action |
|---|---|---|---|
| P0 | Named palettes: `StudioPaletteLibraryPanel`, `StudioPage`, `StudioBrandKitPanel` | `toonspectrum-studio-palette-library` localStorage | Durable creative library; move all readers/writers together to one SQLite repository |
| P0 | Brand kits: `StudioBrandKitPanel` | localStorage | Durable colors/fonts/logos; use structured metadata plus OPFS/blob references for logos |
| P0 | Reusable element clips: `StudioPage` | localStorage | Durable reusable scene fragments; canonical IR validation and SQL namespace required |
| P0 | VRM custom poses/full states: `StudioVrmPoser` | `studio_custom_poses`, `studio_vrm_full_states` localStorage | Durable authored presets; separate from clipboard fallback and recents, then move to SQLite |
| P0 | Pose materials: `StudioVrmPoseMaterialPanel` | localStorage-backed `studio-pose-material-library` | Durable authored material library; move to SQLite, retain test injection only |
| P0 | Asset/model/template libraries: `studio-asset-library`, `bg3d-model-library`, `bg3d-template-library`, `vrm-library`, `studio-vrm-texture-paint-library` | Multiple IndexedDB databases | Durable binary creative assets; use OPFS content-addressed blobs plus SQLite metadata, not giant KV JSON |
| P1 | BG3D light/user presets and mannequin state | localStorage | Authored reusable presets; split persistent presets from viewport/session state before migration |
| P1 | CRDT outbox/recovery vault and BG3D shot-batch recovery | IndexedDB plus a recovery localStorage slot | Durable operational recovery; migrate only with queue replay and fault-injection parity |
| P1 | Generic OPFS filesystem localStorage fallback | localStorage base64 fallback | Durable asset fallback; product should fail visibly or use SQLite/OPFS, not silently re-enter the old quota ceiling |
| P2 | Custom-font storage module | localStorage-compatible seam, but no shipped caller found | Not a current product authority; if wired later, use OPFS blobs + SQLite metadata from day one |

### Preference-only localStorage retained by design

| Group | Examples | Reason not moved to creative SQL |
|---|---|---|
| Layout and appearance | page-preview size, companion-window layout, inspector/reference layout, UI density, app settings, panel visibility | Small user preference; loss does not destroy authored work |
| Tool ergonomics | brush slots, pro-draw locks/favorites/recents, effect favorites, advanced-fill settings, device calibration | Device/workspace preference; some should remain device-specific |
| Recents and discovery | recent colors, backgrounds, elements, VRM poses/characters, AI prompt history | Reconstructable convenience cache, not source creative data |
| Notices and tutorials | quick-start/mobile hints, AI asset notice, tutorial progress, help dismissal, webcam consent | Consent/onboarding UI state |
| Export defaults | watermark/signature settings, server-AI provider choice | Preference; exported document contains the actual applied result |

### Security, clipboard and session state retained outside creative SQL

| Surface | Storage | Classification |
|---|---|---|
| Stock-image/integration access key | localStorage in current code | Credential, not creative data. It needs a separate security review rather than co-location in Studio SQL |
| AI in-progress settings and mobile immersive mode | sessionStorage | Session-only state |
| Pose/full-state clipboard fallback and Studio clipboard | localStorage/sessionStorage fallback | Transfer buffer, not durable library authority |
| Companion presentation safety state | localStorage + storage events | Short-lived cross-window convergence state |

## Evidence links

- Product repositories: `src/domains/creator/studio-scene-snapshot-sqlite-repository.ts`,
  `src/domains/creator/studio-emeres-sqlite-repository.ts`
- Product wiring: `src/domains/creator/StudioSceneSnapshotPanel.tsx`,
  `src/domains/creator/StudioEmeresLibraryPanel.tsx`, `src/domains/creator/StudioPage.tsx`
- Real sqlite-wasm memory round-trip tests:
  `src/domains/creator/studio-scene-snapshot-sqlite-repository.test.ts`,
  `src/domains/creator/studio-emeres-sqlite-repository.test.ts`
- Independent product-boundary contract:
  `src/domains/creator/studio-remaining-creative-sqlite-authority-contract.test.ts`
