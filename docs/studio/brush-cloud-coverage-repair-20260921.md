# Cloud brush coverage and material policy repair — 2026-09-21

## Reproduced product failure

The soft-cloud emitter used a floor-based path stride and then exhausted a fixed particle budget. On intermediate path sizes this kept only a prefix, silently omitting the end of a drawn line. Seven endpoint-pressure regression cases failed before this correction.

## Correction

Allocate complete stations inside the unchanged particle budget, then distribute those stations over the full path including both endpoints. Preserve deterministic seeds, sequential indices, caller particle counts and bounded work. Reduce the authored cloud radius from 22 to 14 so neighboring soft footprints overlap instead of forming visible scallops. The runtime-owned web-kit emitter is corrected; the unrelated generic dynamics overrides are unchanged.

The long-brush quality classifier now uses the existing canonical material stamp/scatter declaration. Continuous and ribbon materials retain continuity checks; soft-cloud remains a strict soft/wet continuous carrier. Discrete materials still require all six route segments, real persisted stroke and pixel-restoring Undo. No numerical quality limit is relaxed.

## Executed evidence

- Before endpoint repair: 7 failing endpoint cases and 10 existing passes.
- Final focused unit tests: 4 files / 50 tests passed, including all material modes and cloud endpoint/cap/determinism cases.
- Production build, generated legal notices and CSP validation passed.
- Production Chromium, actual shipped drawing UI: capillary-dendrite and soft-cloud each retain 6/6 visible route segments, a 480px persisted stroke and pixel-restoring Undo; zero quality errors. Soft-cloud passes the unchanged scallop threshold of 0.62.
- Production evidence: `/tmp/toon-cloud-final-production/`; build log `/tmp/toon-cloud-final-build.log`; unit log `/tmp/toon-cloud-final-unit.log`.
- Intermediate endpoint-only candidate retained full length but still failed scallop quality (0.721); it was not accepted. A cold development-server run timed out and is not a pass. Final acceptance uses the rebuilt production distribution, not development mode.

## Boundaries

This verifies two targeted brushes, not all 370 catalog entries or the six exhaustive lanes tracked in issue #1905. Existing drawings are not migrated or rewritten; this corrects the shared web-kit replay geometry. No API, storage schema, permission, dependency, CI budget or deployment policy change.
