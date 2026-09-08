# Studio file lifecycle benchmark and implementation — 2026-09-09

## 1. Scope and evidence policy

This review targets the file lifecycle around `https://www.toonstudio.cloud/studio`: create, open,
recent work, save, save a copy, autosave, versions, crash recovery, backup, import compatibility,
and portable export.

The authenticated ToonStudio editor could not be operated by the available browser automation
connection, and the editor route did not expose a public help document that could be audited. The
review therefore does **not** infer hidden ToonStudio behavior from screenshots or marketing copy.
The implementation baseline is ToonSpectrum's shipped code and tests; comparison claims below come
from first-party product documentation whenever possible.

## 2. Competitive benchmark

| Product | Audited file-lifecycle behavior | Product lesson for ToonSpectrum | First-party evidence |
| --- | --- | --- | --- |
| Figma | Automatic checkpoints, named versions with descriptions, historical preview, restore, duplicate-as-new-file, version-specific links, and extra checkpoints after offline/crash events | Autosave is most useful when it is visible as a timeline and users can create meaningful milestones without destroying the current state | https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history |
| Adobe Photoshop cloud documents | Automatic cloud versions, named/marked versions, revert, opening an earlier version as a new document, recent-file access, and offline availability | “Restore” and “make a copy” are separate intents; a version action should never silently erase the only current state | https://helpx.adobe.com/ca/photoshop/using/manage-cloud-documents-photoshop.html |
| Clip Studio Paint | Save, Save As, Save Duplicate, background save, compatibility mode, local InitialBackup/DocumentBackup, canvas recovery, cloud backup and past-version download; linked file objects can be updated or relinked | Professional drawing workflows distinguish the current editable source, a duplicate for interchange, recovery data, and externally linked sources | https://help.clip-studio.com/en-us/manual_en/210_file/Save_file.htm · https://support.clip-studio.com/en-us/faq/articles/20190029 · https://help.clip-studio.com/en-us/manual_en/180_layers/File_objects.htm |
| Krita | Crash autosave, ordinary backup, incremental backup, and incremental version files; Save As and Export have different document-identity behavior | Users need explicit names for “backup of prior state”, “new numbered version”, and “exported derivative” because each protects a different failure mode | https://docs.krita.org/en/user_manual/autosave.html |
| Toon Boom Storyboard Pro | New/Open/Save/Save As, project backup and restore, packed single-file projects, cache recovery after a crash, configurable autosave, and Save and Pack | Long-form production needs a portable project container plus a recoverable working cache, with clear commit/pack semantics | https://docs.toonboom.com/help/storyboard-pro-25/storyboard/reference/toolbars/file-toolbar.html · https://docs.toonboom.com/help/storyboard-pro-27/storyboard/project/back-up-project.html · https://docs.toonboom.com/fr/help/storyboard-pro-25/storyboard/project/recover-project-cache.html |
| Photopea | Open dialog, drag/drop, local-storage providers, PSD as the editable source format, Save back to an opened local file in supporting browsers, explicit web exports, and five-minute IndexedDB crash backups | A browser editor can offer desktop-like file continuity, but local recovery must be identified as browser data rather than a durable external backup | https://www.photopea.com/learn/opening-saving · https://www.photopea.com/tuts/photopea-opens-up-old-files/ |
| Canva | Autosaved version history, restore, and making a copy of a selected version | Copy-from-history is an understandable, low-risk alternative to destructive restore | https://www.canva.com/en_gb/help/resize-variantb/ |
| MediBang Paint | Cloud storage, multi-device work, and a recall/history allowance that depends on plan | Storage quota and retained-history limits must be visible before they block save or recovery | https://medibangpaint.com/en/faq/129737/ |
| Procreate | Gallery-level duplicate, bulk duplicate, native artwork sharing/export, Files/iCloud destinations, and explicit irreversible deletion | Duplicate-before-risk is a first-class gallery action; destructive deletion should stay visibly separate from save and backup | https://help.procreate.com/procreate/handbook/gallery/gallery-organize · https://help.procreate.com/pocket/handbook/gallery/gallery-import-share |
| Sketchbook | Native layered TIFF, save verification, temporary crash autorecovery, interval gallery save on supported mobile platforms, recovery scan, and explicit external/cloud backup guidance | A recovery cache must be labeled temporary; native layered backup, save verification, and external copies are separate protections | https://help.sketchbook.com/docs/saving-files · https://help.sketchbook.com/docs/backing-up-files-on-mobile · https://help.sketchbook.com/docs/preferences |
| Concepts | Native `.concept` drawing/project export, multi-file/project backup to Files or cloud, iCloud Drive sync, and clear distinction between synced Drive data and whole-device backup | Portable native projects and cloud sync need different copy semantics, and deleting synced data must not be confused with device-snapshot recovery | https://concepts.app/en/tutorials/tips-exporting-your-designs/ · https://concepts.app/en/tutorials/backing-your-drawings-icloud/ · https://concepts.app/en/how-to-use-icloud/ |

### Converged expectations

Across these products, the strongest file systems consistently separate five concepts:

1. **Current document save** — updates the active source.
2. **Named recovery point** — preserves a meaningful milestone in history.
3. **Portable copy** — survives browser storage loss and can move to another device.
4. **Crash/autosave recovery** — short-horizon protection that is not advertised as a durable backup.
5. **Interchange derivative** — may flatten, convert, or drop application-specific features and must
   disclose those losses before import/export.
6. **Destructive lifecycle actions** — delete, replace, or restore must remain visually and semantically
   separate from copy/export, with recovery limits disclosed before the action.

A long menu containing many import/export buttons does not by itself satisfy these expectations. The
user needs one place that answers: “Where is my work protected, what can I restore, and what will be
lost if I open this file?”

## 3. Existing ToonSpectrum baseline

The repository already ships substantial infrastructure:

- lightweight project JSON import/export;
- deterministic `.toonproject.zip` portable archives with integrity checks and included attachment
  handling;
- PSD import;
- ORA, CBZ, and bounded WILL import;
- named checkpoints;
- browser autosave/recovery storage, OPFS/SQLite work, storage diagnostics, and recovery guidance;
- an audited interchange capability registry that separates engine implementation, visible UI
  wiring, metadata preservation, runtime providers, size budgets, and unsupported claims;
- Project Center actions for production planning, review, rights, publishing, and packaging.

The weakness was not missing codec code. It was discoverability and trust:

- the Project Center was primarily a command grid, not a file-status surface;
- users could not see browser persistence, quota estimate, or the number/time of recoverable local
  autosaves next to backup actions;
- importing a local file started at the picker, without a lightweight preflight that explained the
  audited loss model first;
- portable archive, JSON backup, checkpoint, and crash recovery were spread across different
  labels and surfaces;
- there was no privacy-bounded recent-local-file list;
- “Save As” remained ambiguous: server-side document duplication does not yet have a dedicated API,
  while archive export already provides a complete portable copy.

## 4. Implemented product design

### 4.1 Lazy-loaded File Control Center

`StudioProjectCenterSearch` now lazy-loads `StudioFileControlCenter` only after the Project Center is
opened. This keeps the large interchange registry and file-center UI out of the always-hot editor
path and gives the loading boundary an explicit fallback.

### 4.2 One command owner, multiple safe entry points

The file center does not duplicate save/import business logic. Its high-value actions locate and
invoke the existing Project Center buttons:

- **새 작업 준비** → existing Quick Start / new-work flow;
- **이름 붙인 버전** → existing checkpoint owner;
- **이 기기에 완전 사본** → existing `.toonproject.zip` exporter;
- **아카이브에서 복구** → existing integrity-checked archive importer;
- compatibility recommendations delegate to existing JSON, PSD, or ORA/CBZ/WILL importers.

This is intentionally an adapter over the current command owners. Permissions, collaboration locks,
busy state, archive attestations, integrity checks, mutation tickets, and error handling remain in
their established implementations.

### 4.3 Recovery readiness dashboard

The center reports separately:

- online/offline state;
- the count and latest timestamp of local autosaves that actually contain work;
- whether local recovery storage can be scanned;
- `navigator.storage.persisted()` status;
- browser storage usage/quota from `navigator.storage.estimate()`;
- a user-initiated persistent-storage request when supported.

The UI explicitly states that browser storage protection is **not** proof of a successful server
save. The durable recommendation remains a portable `.toonproject.zip` copy.

### 4.4 Audited compatibility preflight

The user can select or drop a file for a metadata-only preflight. The implementation does not read or
upload file contents. It compares only name, extension, MIME type, and size with
`STUDIO_INTERCHANGE_CAPABILITIES`.

The report exposes:

- recognized capability and format label;
- native/structured/bridge/unsupported/blocked tier;
- audited single-file size limit;
- explicit loss model;
- recommended conversion bridge;
- only a currently wired authoritative importer.

Unsupported proprietary formats such as `.clip`, `.cmc`, `.kra`, Office documents, PDF, AI, and
Affinity documents fail closed and receive a conversion recommendation. A generic `.zip` is not
mistaken for a ToonSpectrum project: only `.toonproject.zip` is routed to project recovery.

### 4.5 Privacy-bounded recent local files

The center keeps up to five inspected file records in local storage:

- file name;
- extension;
- byte size;
- inspection time;
- compatible importer route, when one exists.

No file bytes, handles, thumbnails, or document contents are stored. Records can be cleared in one
action. Reopening requires the user to choose the file again, preserving the browser's permission
boundary.

### 4.6 Server project library handoff

The file center links to `/studio/projects` for server-backed project discovery and continuation.
Local recent metadata is deliberately not presented as a substitute for the authenticated project
library.

## 5. UX and accessibility decisions

- All file-center buttons are marked `data-project-center-control="true"`; Project Center search does
  not count or hide them as underlying production commands.
- Quick actions have unique accessible names prefixed by “파일 센터”.
- Status changes are announced through a polite live region and also remain visible.
- Unsupported and over-budget files do not receive an executable import button.
- Drag/drop has an equivalent labeled file input.
- The UI uses descriptive labels (“완전 사본”, “브라우저 보관 보호”, “직접 가져오기 미지원”)
  instead of suggesting that every local state is a cloud save.

## 6. Verification coverage

New model tests cover:

- multi-part `.toonproject.zip` detection;
- portable-archive routing and lossless tier;
- JSON-versus-archive distinction;
- PSD/ORA/CBZ/WILL importer routing;
- proprietary and ambiguous ZIP fail-closed behavior;
- size-budget blocking;
- recent-file parsing, deduplication, and five-item cap.

New component tests cover:

- delegation to existing action owners;
- PSD preflight and metadata-only recent record;
- unsupported `.clip` conversion guidance;
- persistent-storage request only after a user gesture;
- explicit separation of browser storage from server save;
- exclusion of file-center controls from Project Center search ownership.

## 7. Deliberate non-claims and remaining roadmap

This change does **not** claim the following are complete:

1. **True server-side Save As / duplicate project.** The portable archive is a complete file copy,
   but creating a new server document with copied permissions, comments, history, and asset ownership
   needs a dedicated transactional API and product policy.
2. **Direct `.clip`, `.cmc`, or `.kra` round-trip.** Conversion guidance is shown instead of
   advertising unsupported compatibility.
3. **Content-level preflight.** The lightweight inspector does not parse document internals. Existing
   import pipelines remain responsible for authoritative validation after the user chooses a file.
4. **Persistent File System Access handles.** Recent local records intentionally store metadata only;
   direct reopening would require permission-aware handle storage and cross-browser fallback.
5. **Version-specific share links and branching.** These require server version identities and ACLs,
   not a client-only UI shortcut.

Recommended next sequence:

- add a transactional `duplicateWorkFromRevision` API with explicit asset/license/ACL copy policy;
- expose server autosave revision, checkpoint count, and last durable archive timestamp through one
  typed status snapshot;
- add non-destructive historical preview and “restore as new project”;
- add content-level PSD/ORA/archive inspection workers with bounded resource budgets;
- progressively enhance supported browsers with File System Access handles while retaining the
  current reselect fallback;
- add project-library filters for local recovery present, cloud-only, unsynced, and storage-risk
  states.
