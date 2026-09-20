# Virtual Studio world editing continuity — 2026-09-21

Follow-up to merged virtual-studio work, based on main `f45d156427ad54bb7e935d60bb278d7110e55a78`. This is a focused frontend increment, not completion of the original 30-item design.

## Product changes

- Actual controlled world editing supports Undo/Redo for field edits, insertion, duplication, deletion and JSON import. New edits discard the redo branch. History is ephemeral and bounded by 30 snapshots and a 6 MiB serialized-size estimate; this is not a measured heap ceiling.
- Buttons provide Ctrl/Cmd+Z and Shift+Z/Ctrl+Y while focused. Native text-field undo and Korean composition remain untouched.
- A changed work, publication base, disabled authority state or externally replaced draft discards stale history before rendering usable controls. The existing account-keyed experience remount is retained.
- Prop X/Y edits and 1/8/16/32px directional buttons translate the authored collider by the same delta in one reversible edit. Explicit collider edits/removal remain authoritative; decorations do not acquire colliders automatically.
- Layer navigation has Korean/English labels. Directional movement is available without dragging, with 44px minimum-height native buttons.
- An asynchronous import cannot overwrite a newer edit, a different work/publication, a disabled editor, an unmounted editor or a later import. Import still uses the existing manifest validator.

## Boundaries

Undo/Redo neither publishes nor silently writes browser storage. Explicit browser-draft save and existing server publication/CAS/receipt validation remain unchanged. No API, schema, migration, paid infrastructure, secret, environment, domain, automatic deployment or CI protection changes.

This does not implement arbitrary visual drag/group editing, collider rotation/scaling, shared storyboard authoring, external guest review, AI evidence generation, recording retention, mentoring isolation or public showcase. Existing limitations stay visible in the integrated-upgrade and session-upgrade ledgers.

## Executed verification

- Workspace ownership: 22 dependency links / 14 packages verified.
- Focused model/component/import regression: 3 files / 31 tests passed, including 18 new cases.
- Broader virtual-space/workspace/work-session/shell regression: 76 files / 755 tests passed. The focused run overlaps this run; counts are not added.
- Changed-file ESLint and web/API TypeScript passed after correcting test assertions to the repository's installed tools.
- Actual browser, exact-head CI, final build, merge and deployment receipts are recorded on the PR when completed. Unit/component fixtures are not authenticated multi-user or production-database certification.
