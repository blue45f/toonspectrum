# MYB/KPP original-source preservation — reconciled completion

Status: **current**, reconciled with the existing OPFS/CAS implementation. Source and tests are authoritative.

## Original branch and merge resolution

`fix/brush-original-source-complete-20260920` contained two unmerged commits and had no PR. Its embedded-source implementation conflicted with nine files already enhanced on main. The completion keeps the main implementation rather than replacing OPFS/CAS with embedded SQLite payloads. The original two commits remain in the merge ancestry.

The original branch's large SQLite roundtrip, additional native brush fixtures, corrupt archive rejection, atomic batch writes, invalid size validation and original-download error handling are retained against the current APIs. The obsolete `.tsx` browser fixture is superseded by the current `.ts` harness and actual OPFS/worker browser verifier.

## Product and storage contract

Supported MYB/KPP imports preserve exact source bytes, including whitespace, CRLF, XML and thumbnail data. Original bytes remain library metadata, separate from edited Studio settings and per-stroke snapshots. SQLite stores a compact content-addressed reference; portable JSON hydrates and verifies the original bytes before embedding them. Memory-session storage remains explicitly nonpersistent.

Rename, edit, duplicate, delete/restore and JSON reimport preserve provenance. **원본 파일 내보내기** downloads the verified original; later Studio edits do not rewrite the native file. SHA-256 detects corruption but does not establish authorship or identical native-renderer output.

## Integrity and size limits

The native input ceiling remains 8 MiB, and ordinary settings retain their 2 MiB ceiling. Source archives use the existing separate character and encoded-byte limits. Export checks both whole-archive limits after serialization, so expanded formatting cannot knowingly produce an archive that exceeds its import contract. Invalid sources fail closed rather than being discarded to permit a save.

See `brush-original-source-cas-20260920.md` for the current storage, verification and worker boundaries. This reconciliation does not change renderer selection, add a native engine, migrate a database or deploy production.

## Reproduction

```sh
pnpm exec vitest run apps/web/src/domains/creator/brush/studio-brush-original \
  apps/web/src/domains/creator/brush/StudioBrushOriginalSourceActions.test.tsx
node scripts/verify-brush-original-source.mjs /private/tmp/brush-original-source-merge-evidence
```

The large-source regression writes a 2 MiB original through real SQLite WASM, reopens the repository, checks compact CAS metadata, exports hydrated bytes, reimports them and checks SHA-256 independently. Corpus coverage includes both MYB fixtures and three KPP fixtures through SQLite and session repositories. Failed writes must leave prior readable records intact.

Validation results for this completion are recorded in the PR only after execution. These focused tests do not certify every Studio interaction, crash durability on every browser or mobile pen hardware.
