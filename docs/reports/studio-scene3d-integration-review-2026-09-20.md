# Scene3D integrated completion and review — 2026-09-20

## Integrated product scope

PR #1844 now includes the normal/crease/MRT output work previously isolated in #1838. No production
release is performed by this change. Both features use the current main baseline `6cafbb293` plus the
explicit merge of the earlier output branch, preserving all its tests and artifact paths.

Implemented: local GLB inspect/compression/LOD/tangent/animation derivatives, BVH/Manifold Boolean,
bounded saved-pose IK, Recast navigation artifacts, Spark native-splat reference viewing, real geometry
normal/depth MRT and LT crease output, source-preserving PNG/PSD insertion/capture, and explicit resource
lifetime handling. Exact library versions remain those recorded in the specialist toolchain report.

## Review corrections verified with regressions

1. CSG source+secondary now share a 128 MiB input ceiling checked before any worker allocation/copy.
   Non-CSG jobs drop any previously selected secondary operand instead of copying an unrelated file.
2. Navigation verifies both projected endpoints in XYZ against explicit horizontal and vertical
   tolerances, then calculates a route from those actual walkable-surface points. Merely testing
   the returned Detour straight-path endpoints was insufficient because those can retain the supplied Y.
   Real floor fixtures now reject both start and end points snapped to the wrong elevation.
3. Spark validation is incremental (8,192 rows per yield), cancellable between batches, and no longer
   allocates a subarray for each splat. The UI does not duplicate the scan before runtime construction.
4. Spark renderer, controls, mesh and observers are inside a partial-construction cleanup boundary.
   Tests cover failures in controls, Spark construction, SplatMesh construction and initialization;
   each created context/owner is released. Normal disposal is idempotent.
5. Null/undefined/primitive Worker replies reject immediately and terminate the worker instead of
   throwing inside the callback and leaving the UI busy until timeout.
6. Dependency manifests, lockfile, workspace patch map and patches now trigger the real production
   Worker/CSP browser workflow. Numeric payload acceptance does not remove this verification.

## Additional preview quality and accessibility

Artifact preview owns resources across all glTF scenes, not only the default scene. It releases shared
geometry, material, texture, skeleton and ImageBitmap references once, including a bitmap referenced by
multiple textures. A failing dispose listener does not prevent other resources from being released.
Camera fit/zoom buttons supplement pointer controls and are keyboard-accessible. The real browser
verifier exercises these controls and switches between three actual LOD previews before downloading.

## Main CI defects closed without skipping gates

- The editor host exceeded the architecture ceiling. The native brush conversion bridge is extracted
  into a typed adapter that reads the latest references and preserves mutation tickets, lock checks and
  exactly-once canonical commits. The existing line ceiling was not raised; behavioral regression tests
  exercise late save/lock/stroke/history changes.
- Existing typography, 3D toolbar and page-batch tests referenced retired labels. Assertions now target
  current visible controls while retaining the real handler/metadata assertions. Trash-count whitespace
  is handled accessibly without losing the count or exact-deletion checks.
- Desktop packaging exported no `resolveReleaseCommand` although its cross-platform test imported it.
  The missing Windows shim resolution is implemented, and signing receipt paths now reject traversal,
  absolute/drive/backslash/control-character paths before finalization. The real reproducible unsigned
  package, tamper checks and path-safety test pass; this does not sign or publish a release.
- Main's refined-v2 768px thumbnails already exceeded the legacy 200KiB guess. No image was recompressed
  or downscaled to hide this. The test now verifies their existing exact byte count, SHA-256, source URL
  and PNG dimensions against the material-preserving render manifest, with a bounded 384KiB high-detail
  tier. Legacy thumbnail budgets are unchanged. All 113 catalogue entries remain checked.

## Bundle measurement and explicit size acceptance

The unchanged main build at `6cafbb293` fails the same 12 accumulated static byte/count ratchets as the
specialist branch. The same checker measured main with 29 app, 282 Studio and 86 BG3D static chunks.
The combined implementation retains these counts. The user explicitly authorized library size in favor
of capability and quality; the integrated measurements are recorded through the normal baseline generator.

No 2% tolerance, count slack, original reference budget, lazy-boundary check or security rule is removed.
`verify-scene3d-specialist-bundle.mjs` additionally proves the app, Studio and BG3D startup graphs do not
contain the new optional specialist/Spark entries and that processing kernels remain in the actual Worker.
A dedicated test rejects eager-engine regressions. Runtime-startup measurements from earlier work remain
marked stale; the static baseline update does not claim a newly measured startup time or FPS gain.

## Local validation on the combined changes

| Check | Result |
| --- | --- |
| Specialist/review/UI/transaction/isolation regression | 16 files / 161 tests passed |
| Professional 3D completion | 34 files / 202 tests passed |
| Exact core foundation CI shard | 74 files / 3,606 tests passed |
| Exact core 3D CI shard | 26 files / 309 tests passed |
| VRM catalogue quality | 15 tests passed |
| Desktop release package | 3 Node tests passed |
| Web + API typechecks | Passed |
| Production bundle, notices and CSP | Passed |
| Accepted static baseline and retained structural gates | Passed |
| Actual production Worker under deployment CSP | 9 real jobs + UI/preview/download passed |
| Apple/Metal and SwiftShader geometry capture | Both passed, no browser errors |

Suites overlap and their counts must not be added as independent coverage. Browser warnings for upstream
BVH deprecation and screenshot readback cost remain recorded rather than suppressed. 4096-square proof
is color-only; normal/depth/LT retain the existing 8,388,608-pixel bound.

Evidence: [synthetic validation receipt](../evidence/studio-scene3d-integration-review-20260920.json).
Logs/screenshots remain under `.qa/scene3d-output-quality/completion/` and are not committed.
Remote CI/merge state must be read from the PR; local validation is not substituted for a remote success.

## Remaining long-term architecture

This closes the integrated deliverable and the identified review defects. It is not a claim that all
23 roadmap candidates are shipped: full NPR graph execution, CSM/TAAU/SSGI/SSS, GPU XPBD, canonical VRM
full-body/contact IK, automatic KTX2 release encoding, libigl/OpenSubdiv, 3D Tiles, global residency eviction
and final-output Gaussian-splat compositing still require separate implementations and evidence. Their
unimplemented global admission flags remain false. No 30-minute soak or all-device production certification
is implied by the bounded fixtures above.
