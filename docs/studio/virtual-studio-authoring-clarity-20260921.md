# Virtual Studio continuation: authoring clarity and engine typecheck

Base: merged and deployed main `9ad829011d3cdf71fa2d1ff4239de1156f17418e`. Prior PR #1902 deployment was verified before continuing; it was not repeated.

## Product changes

- The prop inspector explains that items without a separate image URL edit interaction/collision coordinates, not the painted background. Assigning an image removes the notice; Undo restores the notice with the original anchor-only state.
- Import request generations are invalidated in the layout cleanup phase on draft/work/publication/disabled-state changes and unmount. No new network or publication authority is introduced.
- Six actual component regressions cover the notice, disabled/publication scope changes during import, out-of-order file completion, unmount, and malformed JSON preserving the original draft.

## Reproduced nightly blocker

Scheduled exhaustive run `35538992321` failed six lanes on the base main. One concrete failure was reproduced locally: `pnpm --filter @toonspectrum/studio-engine-vello typecheck` returned TS2307 for `canvaskit-wasm/bin/canvaskit.wasm?url` imported through Skia source.
Vello's standalone tsconfig now explicitly includes the existing, exact Skia asset-URL declaration. No new ambient wildcard, ignored compiler error, relaxed compiler option, dependency or runtime import was introduced.

## Executed validation

- Virtual-space/workspace/work-session/shell: 76 files, 761 tests passed, including the six new cases.
- Canonical `verify:studio-engine`: all package and benchmark typechecks and pinned WASM integrity passed; 138 files / 1,468 tests passed, with the existing 10 files / 14 tests skipped. Those skips were not added or reclassified as success.
- Changed editor and test ESLint passed. Final normal commit/push checks and exact-head CI are recorded on the PR.
- The unchanged prior live release passed actual Phaser editing at 1440/390/320px and entry/chunk SHA256 verification; new candidate build/live results must be recorded separately.

## Remaining boundaries

The other exhaustive lane failures are not resolved by one typecheck fix. Browser control selectors, GLTFLoader construction and timeout failures still need individual reproduction. No tests, required checks or nightly lanes are removed. This increment is not the full 30-item design or complete WAN/multi-user certification.
No API, database, migration, secret, domain, paid plan, automatic deployment or branch-protection change. Only changed deployment units may be released after validation; the existing live API is retained when its runtime source is unchanged.
