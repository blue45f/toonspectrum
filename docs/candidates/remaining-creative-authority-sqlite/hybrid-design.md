# Remaining creative authority SQLite hybrid design

## Decision

Use the existing app-lifetime `acquireStudioLocalDatabase()` handle and
`studio-local-v12.db`. Keep stable creator-domain models and canonical codecs outside SQLite. Do
not discover or migrate pre-V12 browser data automatically.

The two selected surfaces use different physical layouts because their access patterns differ:

- scene snapshots can reach 64 entries and 96MB total, so each canonical snapshot is an immutable
  KV record and a compact canonical index is the visibility authority;
- Emeres is bounded to 30 downscaled image templates, so one canonical envelope gives a single
  atomic SQLite upsert and simple all-or-nothing validation.

## Scene snapshot commit protocol

```text
canonical StudioSceneSnapshot
  -> exact existing record codec
  -> kvSet immutable record:<id>:<version>:<updatedAt>
  -> kvSet canonical index-v1       (authority switch)
  -> best-effort delete old record  (non-authoritative cleanup)
```

If execution stops before the index switch, the previous index still points to the previous complete
record. The new orphan is unreachable. If it stops after the switch, the index points to the complete
record written first. Load rejects the entire library when the index is malformed, duplicated,
non-canonical, over budget, missing a record, or points at a record with a different identity.

Delete switches the index first. Old record cleanup is best effort because an unreachable orphan is
safer than making a completed logical deletion appear to have failed.

## Emeres commit protocol

```text
current canonical array
  -> apply one pure mutation
  -> validate every row + duplicate IDs + data URL + total bound
  -> canonical JSON
  -> one SQLite kvSet(studio-emeres-library-v12, library-v1)
```

Mutations share an invocation-ordered promise queue. A later save cannot overtake an earlier one.
There is no localStorage fallback. On product-UI failure, the panel applies the accepted mutation to
React state only, labels it `현재 탭 메모리 임시 · 새로고침 시 사라짐`, and stops attempting silent
durable writes for that mounted panel.

## UI concurrency and generation fencing

- Repository mutations serialize independently of React rendering.
- Both panels assign monotonically increasing load/operation generations.
- A late load from an old repository or an unmounted panel cannot replace current UI state.
- The Emeres product repository publishes successful mutations to mounted consumers; subscribers
  re-read only after the queued mutation commits.
- Scene snapshot failure remains fail-closed and is labelled `저장소 사용 불가`; an unsaved capture
  is not inserted into the persisted-looking list.

## Data policy

- `LEGACY_DATA_MIGRATION=FALSE`: product modules contain no read of the old Emeres localStorage key
  and no open of the old scene-snapshot IndexedDB database.
- Engine objects are never stored. Scene snapshots use stable `PageState`/theme payloads; Emeres uses
  validated image data URL and metadata.
- Existing legacy APIs stay available only for explicit tests or future user-selected external
  import tooling.
- Preferences, credentials, recents, clipboard state and session caches remain outside these
  namespaces.

## Known limitations

- No orphan-record vacuum is implemented yet for scene snapshots. Orphans are unreachable and do
  not affect semantic correctness, but quota reclamation needs a bounded maintenance job.
- Multi-tab semantic conflict UI is not implemented. SQLite serializes physical writes; it does not
  decide how two users' independent edits should merge.
- The Emeres full-envelope layout is selected only because the catalog is capped at 30 entries. A
  future uncapped catalog must use structured rows and keyset paging.
- Neither new namespace has real Chromium OPFS latency, quota-pressure, forced-tab-termination or
  peak Worker/WASM memory evidence yet.
