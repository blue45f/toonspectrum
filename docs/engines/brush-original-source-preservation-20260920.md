# MYB/KPP original-source preservation

Status: implemented slice, validation notes below. This is **byte preservation**, not a new native rendering engine.

## Product behavior

- Direct supported `.myb` and `.kpp` imports now keep the exact input byte view, including MYB whitespace/CRLF and KPP PNG/XML/thumbnail data, alongside the existing mapped Studio brush settings.
- `StudioSavedBrush.originalSource` is library metadata. `StudioBrushSnapshot`, captured drawing inputs and renderer programs do not gain original-file payloads.
- Existing SQLite JSON payloads can carry the additional metadata without a schema migration. Record normalization verifies the source before admitting it. Memory-session writes validate before replacing the existing library.
- Rename, overwrite of current settings, duplication, deletion/restore and JSON export/import preserve the original. Editing Studio parameters does not rewrite or reconstruct the native file.
- Management actions expose **가져온 원본 다운로드**. It returns verified original bytes. JSON export/share carries both the current Studio settings and the original.
- Source-bearing JSON uses a distinct `toonspectrum-studio-brush-source-archive` kind with an explicit format revision. Older settings-only importers reject that kind rather than silently discarding the original. Existing source-free JSON export shape remains unchanged.

## Integrity and limits

Each source stores format, safe basename, byte count, canonical base64 and SHA-256. The hash detects corruption; it does not prove authorship, licensing or safe native execution. This path stores/exports inert bytes and does not execute an imported script.

The source is limited to the existing 8MiB single-brush ceiling. Ordinary settings retain their 2MiB limit. Source archives have a separately calculated bound for base64, settings and envelope overhead. Exports also check the total encoded size so a generated archive is not knowingly larger than the importer admits.

Unknown source revisions/fields, mutable caller data, accessors, noncanonical encoding, size mismatch and hash mismatch fail closed. A damaged original is not removed to make a save succeed. Source-free historical imports cannot retroactively recover bytes that were previously discarded; the user must reimport the native file.

## Implementation boundaries

This focused implementation embeds base64 in the saved record. It does not claim content-addressed deduplication or a separate OPFS blob transaction. Base64 increases storage by roughly one third; duplicating source-bearing brushes duplicates that payload in serialized records. Large libraries of maximum-size originals remain a storage/performance follow-up, not a solved benchmark.

The importer’s mapping, warnings and unsupported-setting ledger are retained. Original bytes do not turn an approximate Studio preset into exact libmypaint/Krita execution. This slice does not expand `.abr`, `.sut`, `.sutg` or `.bundle` original preservation, recover externally linked assets, change brush pixels, migrate a database or deploy production.

Work resumed from the interrupted branch. Concurrent changes were observed in that original worktree, so the completion was isolated in `fix/brush-original-source-complete-20260920`; unfinished CAS work and other worktrees were left untouched. The completion branch explicitly uses the bounded embedded-source contract, not the other worktree’s unimplemented CAS variant.

## Reproduction

```sh
pnpm exec vitest run apps/web/src/domains/creator/brush/studio-brush-original \
  apps/web/src/domains/creator/brush/StudioBrushOriginalSourceActions.test.tsx
node scripts/verify-brush-original-source.mjs /private/tmp/brush-original-source-evidence
```

The browser script uses actual library UI, parsers, download code and the explicitly nonpersistent repository injection. It verifies native original downloads byte-for-byte, changed Studio settings in portable archives, duplication, fresh-session archive import and refusal of tampered archives. Real SQLite is exercised separately with its memory VFS. Neither test is a claim of full Studio pointer routing, browser OPFS crash durability, original-native-engine visual equivalence or mobile hardware certification.

## Executed verification

The related library/import/selection/slot regression run passed **401 tests in 14 files**. This includes 33 new source-preservation/UI cases; counts overlap and are not additive. Tests exercise real SQLite WASM with an in-memory VFS, canonical record checks, failed batch atomicity, memory-session corruption refusal, original byte views, source archives larger than the old settings limit, and unchanged source-free exports.

The actual installed Chrome **153.0.8010.48** passed the product library fixture for `ink-crisp.myb` (843 bytes) and `paintbrush-pressure-curve.kpp` (808 bytes). Original downloads matched the corpus byte-for-byte; changing current settings to width 21, duplicate, archive export, fresh-session archive import and tampered-hash refusal all passed. Page and console errors were zero. Initial browser attempts used an incorrect asynchronous wait predicate; this was corrected to polling resolved repository state, not by relaxing assertions or changing the product import behavior.

Changed-file lint and architecture boundary validation passed. Frontend/API typecheck and production bundle verification are recorded in the PR only once their actual processes finish. No new dependency, database migration, production credential or deployment is part of this slice.
