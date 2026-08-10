# Translation-memory SQLite hybrid design

## Authority boundary

```text
StudioDialogueTranslatePanel
  → StudioDialogueTranslationMemoryPanel
    → stable translation-memory v1 functions
       normalize / validate / exact+fuzzy search / glossary / import+export
    → createStudioTranslationMemorySqlitePersistence
       serialized async save queue
    → acquireStudioLocalDatabase
    → OPFS SAH-pool /toonspectrum-studio-sqlite/studio-local-v12.db
       kv(namespace="studio-translation-memory-v12", key="library-v1")
```

The translation-memory model remains independent of SQLite and any translation provider. The stored
value is the exact output of `exportStudioTranslationMemory`; no provider object, UI state or engine
cache becomes the document original.

## Product modes

| Host input | Authority | Product meaning |
| --- | --- | --- |
| `storage === undefined` | Shared V12 SQLite/OPFS | Default durable local product path |
| `storage === null` | Memory only | Explicit temporary session; UI states that refresh can lose data |
| Explicit `Storage` object | Compatibility seam | Test/embed-only synchronous authority, not selected by product code |
| User-selected TM JSON | Explicit interchange | Validated external import; not legacy Studio auto-migration |

The former localStorage key is not probed before SQLite hydration and is not copied into the V12
namespace. The user may explicitly choose a JSON document, but the app does not infer consent from
old internal browser data.

## Hydration and write ordering

1. The panel creates the SQLite persistence once and begins asynchronous hydration.
2. The translation editor remains usable, but save/import controls stay disabled until the initial
   authority result is known. This prevents an empty initial state from overwriting an existing DB.
3. A hydration generation token rejects results delivered after unmount or retirement.
4. A successful author mutation updates the in-memory view immediately.
5. Panel writes enter one promise queue; the persistence adapter has a second ordering queue at the
   storage boundary. An earlier completion cannot overwrite a newer UI result.
6. Saves already requested may finish after unmount, but no retired React state is updated.
7. SQLite errors remain visible while the authored entries stay in the explicit temporary view. No
   localStorage fallback is started.

## Corruption and recovery

User JSON import may report rejected rows because it is an explicit, inspectable merge operation.
The internal SQLite row is stricter: invalid, duplicate or truncated rows indicate corruption of a
document that the product itself previously exported. The adapter therefore returns zero entries and
`invalid`; it never returns a partial library.

Normal save controls do not overwrite that row. A user-selected, fully validated JSON import is the
explicit recovery path. The existing export caps and entry/character bounds remain the single source
of truth.

## Worker/OPFS evidence path

The production probe builds the real persistence adapter and local DB through Vite, launches a module
Dedicated Worker under COOP/COEP/CORP and CSP, and dynamically imports the pinned sqlite-wasm package.
Constructor instrumentation records the requested VFS, OPFS directory and every DB filename without
replacing the database implementation. It rejects memory VFS, localStorage fallback, any filename
other than `/studio-local-v12.db`, missing physical OPFS files or a close/reopen mismatch.

SQLite/OPFS work is metadata persistence and never enters drawing, pointer, renderer or GPU hot paths.
