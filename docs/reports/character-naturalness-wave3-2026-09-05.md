# Character naturalness wave 3 — 2026-09-05

Source: PR #749 / `f8989045e6baf7383b25e6501181eb17e417cf8b`.

## Reproduced before changing code

Local baseline copies were checked against the GitHub blob IDs:

- `studio-vrm-contact-refinement.ts`: `921f7a029590c88f708e4c6510d306d1c3205f79`
- `studio-vrm-portrait-framing.ts`: `74e1a3df7ed965966961a3a196937ecd938b3fd5`

Four focused regression probes failed against those original files: invalid baseline measurements still wrote rotations, simultaneous hand tightening disturbed an already contacting finger, lying portrait bounds lost head scale/orientation, and stale neck/collapsed eye landmarks did not use the safe fallback. The same cases pass against the changed production modules.

## Implemented

### Independent, bounded finger contact

- Partition the movable joints into finger chains. Compare per-finger distances rather than only the farthest joint. A contacting finger is left alone; accepted trials cannot worsen another contact.
- Permit measured loosening as well as tightening in this viewport. Legacy scalar callers do not opt in to loosening automatically.
- Bound the total change from the original pose to 20 degrees per joint and the search to 64 measurements per contact. Preserve bend signs and do not further curl joints already beyond the refinement limit.
- Ignore invalid/missing baseline measurements without writing any rotations. Protect rollback snapshots from adapter aliasing, restore rejected trials, and report rollback failure explicitly instead of throwing from the frame callback or claiming a restored pose.

### Replay and editing ownership

- Share pure replay/cleanup planning with the tested math module. An unchanged corrected pose is not amplified again; a changed contact re-solves from its original input.
- Include non-curl rotations, bone translations and bone scales in cache ownership. Cleanup does not restore an older pose over a newer edit.
- A locked finger protects its own full chain while other unlocked fingers remain eligible.
- Invalidate/release stale corrections when the target becomes invalid or unreachable. Release old passes in the layout phase before new frame callbacks, synchronizing the raw skeleton when a correction was actually restored.
- Retain the -1.5 contact frame priority, the existing automatic-grip authority, and the existing exclusions for precision/support grips and conflicting interactions.

### Reclining and tilted portrait framing

- Stop estimating every model from world Y height, which collapses in a lying pose. Use the largest body extent and validated nearby landmarks.
- Build head-aligned portrait extents from the neck/head direction and usable eye or shoulder axis. Tilted heads retain headroom; bust padding follows the same frame.
- Ignore remote/stale neck data, collapsed or collinear eye pairs, sparse arrays and non-finite data. Custom/full-body/over-shoulder selection rules remain unchanged.

## Verification actually executed

- Strict TypeScript compilation of both production math modules, targeting ES2022/CommonJS: passed.
- `node --experimental-strip-types --test scripts/verify-character-contact-naturalness.mjs`: **32 tests passed, 0 failed, 0 skipped**.
- The tests include 128 deterministic mixed-hand cases, both hand signs, per-contact non-regression, search/angular budgets, rollback failures, 1,000 unchanged replay frames, manual-edit ownership, portrait scale/translation, lying poses and invalid landmarks.
- TSX transpile/syntax diagnostics for the changed R3F adapter: 0 errors. This does **not** verify its full dependency graph or browser execution.
- Added a read-only, sparse-checkout GitHub Actions math gate using the same dependency-free production-source test. Existing `core` CI is unchanged; this extra check does not replace it.

## Scope and release limits

These checks use exact production math and simulated distances, not real VRM/GLB meshes or browser screenshots. The contact target remains a joint-origin distance, not a certified fingertip-to-mesh collision measurement. Runtime integration, all existing Vitest tests, whole-project typecheck/lint/build, and real-model visual/capture validation remain required.

Main was separately inspected at `0e8254c9889509fede2a918299ac01dcf6b8cb68`. Its four commits since the common ancestor changed no files in PR #749, so a false/unfinished mergeability flag alone should not be described as a confirmed text conflict. Do not force-push, overwrite unrelated main work, weaken checks, or change billing to publish this patch.
