# Scene3D navigation authoring completion — 2026-09-20

Status: implemented and locally verified; merge and deployment are separate actions.
Validated implementation: `31966c18188e25f3425b21fc46e299826314eff1`.
Integration base: `6c8b07a9199951c1e88c118a498e586c8a3f7dc5`.

## User-visible behavior

- Complete the preserved, unfinished navigation authoring work without modifying its source worktree. Nine dirty source files were archived with hashes and rechecked unchanged.
- Start/end plus up to eight ordered waypoints. Every stop must project onto the intended walkable floor; every leg must reach its projected endpoint. Disconnected/partial routes are errors, not success.
- Expose agent radius/height, maximum step and maximum slope. Clearance/radius round up to grid cells and step rounds down. These are voxelized navigation constraints, not continuous physical collision guarantees.
- Preserve navmesh.glb, navmesh.bin and navigation-path.json; append a standard navigation-route.glb with highlighted route and stop markers. Default preview selects the route. Display offset never changes actual coordinates.
- JSON includes exact requested/projected stops, per-leg indexing/length, source hash and effective grid settings. Length is the Detour corner polyline, not terrain-sampled motion.
- Reject malformed, missing, non-finite and out-of-range coordinates before creating a Worker. First reproduced the missing-comma-coordinate bug in a failing UI test; blank numerical fields no longer become zero.
- Bound the complete route and each returned leg to 2,048 points. Coalesce repeated adjacent stops without dropping requested segment identity.
- Version-fence recipe reuse and key every ordered waypoint/agent option. Preserve main's synchronized comparison, compound Boolean, bounded queue, history and storage integration.

## Executed validation

- Specialists: 20 files / 201 tests passed. Includes real Recast slope, step, narrow corridor, disconnected surface, wrong-floor stop, exported GLB round-trip/hash and cache identity checks.
- Professional completion: 34 files / 207 tests passed.
- In-place apply/history/storage: 9 files / 81 tests passed.
- Suites overlap and must not be summed as independent coverage.
- Web and API TypeScript passed. Changed-source strict ESLint passed. Normal commit and push hooks passed without bypass (lockfile, architecture, types, changed lint and secrets).
- Production bundle, license notices, static CSP and optional-engine isolation passed. Existing vendor build/BVH warnings remain visible; this is not a warning-free build claim.
- Chromium 151.0.7922.34: actual production processing Worker under dist/_headers CSP, real file inputs, route GLB rendering, JSON/GLB downloads, 320/390px no-overflow checks, and the existing LOD/KTX2/compound/Spark flows passed. Browser errors: zero.
- The actual UI route has four stops, three segments and length 13.656854249492 m in the synthetic meter-scale fixture. The screenshot was visually inspected; the highlighted route and all stops are visible.

## Reproduction

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run apps/web/src/domains/creator/scene3d/specialists --maxWorkers=2
pnpm run verify:studio-3d-professional-completion --maxWorkers=2
pnpm run verify:studio-3d-inplace --maxWorkers=2
pnpm run typecheck
pnpm run build:bundle
node scripts/verify-scene3d-specialist-bundle.mjs
SCENE3D_SPECIALISTS_PRODUCTION_WORKER=1 TOONSPECTRUM_VERIFY_DIR=/tmp/scene3d-navigation-proof pnpm run verify:studio-3d-specialists:browser
```

## Boundaries

This is a completed static authoring/export slice, not live NPC/crowd movement, dynamic obstacle navigation, full 3D platform completion, all-device certification or a performance speedup claim. Existing scene authority and source assets remain unchanged. No new dependency, database migration, environment update, cloud operation, hook bypass or branch-protection edit was performed. Remote CI state and main merge must be checked separately from these local results.

Machine-readable source hashes and complete browser result: `docs/evidence/studio-scene3d-navigation-completion-20260920.json`.
