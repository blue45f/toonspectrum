# Learning records, resilient persistence and mobile lab comparisons

This extends PR #784 without replacing its curriculum or changing the Studio editor. The original curriculum component is preserved byte-for-byte in `LearnContent.tsx`; `LearnPage.tsx` is now the public lazy entry that also exposes `/learn/records`.

## Implemented surfaces

- `/learn/records`: progress/note/bookmark summary, JSON backup download, file validation and preview, explicit conservative restore, retry of failed local writes, and explicit resolution of a detected storage conflict.
- Comparable labs (pacing, strokes, clipping and values): `나란히`, `기준만`, `비교만` views. On an initially narrow viewport, a single comparison half is shown rather than forcing the entire two-column SVG into the viewport. Reference and comparison retain the same coordinate extent and scale. Perspective and lettering remain whole diagrams.
- Shareable lab snapshots: the current parameter, paused explanatory frame and comparison view are encoded in `labValue`, `labFrame`, `labView`. Opening the link never autoplays. Unknown, non-finite and oversized numeric strings are rejected; valid outliers are bounded. Clipboard denial exposes a selectable read-only URL instead of losing the action.

## Record safety and privacy

The existing `toonstudio:learning:v1` record remains compatible. A document-local store with cached snapshots backs `useSyncExternalStore`, so failed persistent writes do not lose their in-memory data during SPA navigation. Each write is normalized and completion is revalidated. A failed read does not permit a write over unseen external data, even if `setItem` would succeed.

Storage notifications are filtered by storage area and key. Session storage events do not replace persistent progress. When local data is dirty, another tab's write or removal is not applied over unsaved notes; the store pauses writes and displays the conflict. Explicit overwrite confirmation is bound to the current snapshot revision and last observed external value, so another change invalidates an old confirmation. A leave warning is registered only while data is unsaved. Browser support determines whether a leave prompt is displayed.

This is not a transactional multi-user editor or CRDT. Simultaneous successful localStorage writes still do not provide collaborative-editing guarantees. Users are advised to edit a given lesson in one tab. The conflict UI recommends backing up each tab before explicitly selecting the current record. Reset remains behind the existing two-step confirmation and changes only the learning key, never the origin's other data.

Backups use `format: toonstudio-learning-backup`, envelope `version: 1`, an export timestamp and the validated progress. Legacy version-1 progress files are accepted. Imports have a 512 KiB UTF-8 byte limit, a 200,000-character record limit and 4,000-character per-note limit. Wrong files, malformed fields and unsupported versions are rejected before mutation. Unknown catalog entries are reported and ignored; a foreign-only backup is rejected. Forged completion flags are corrected and reported.

The file chooser previews counts and requires `기존 기록 유지하고 복원`. Restore preserves an existing active lesson as a whole, adds only absent/empty lesson records and unions known bookmarks. It never splices same-lesson notes or silently overwrites them. Cancelling or selecting a newer file invalidates an earlier asynchronous file read.

Backups contain personal notes and must be stored privately. No backup or note is sent to a server. Exercise share links contain only an allowlisted lesson path and public lab parameters, never notes, bookmarks, account tokens or unrelated query parameters. This remains file-based transfer, not account synchronization.

## Tests and evidence

New source test file: `src/domains/learn/learning-resilience.test.ts` (33 tests). It covers backup validation/round-trip and non-destructive import, failed reads/writes, dirty-note retention, external deletion, stale conflict confirmations, scoped reset, subscription cleanup, storage-area filtering, URL boundaries and mobile view defaults.

New full-application browser file: `e2e/learn-resilience.spec.ts` (6 tests). It covers a real downloaded file and restoration into a fresh browser context, preview/cancel/invalid input, mobile comparison switching and overflow, clipboard denial and public-only links, plus real same-context two-tab storage events and SPA navigation. The existing 16 model tests and 6 browser tests remain in place.

`.github/workflows/learning-quality.yml` runs the feature-scoped TypeScript check, ESLint, both Vitest files and both Playwright files with the repository's pinned dependencies. Browser evidence is retained as an artifact. This is an additional quality workflow, not a replacement for `core`, and changes no branch-protection settings. `tsconfig.learning.json` only adds a focused entry point; root checks remain unchanged.

### Actually executed during this authoring session

- Node 22.16.0 / TypeScript 5.8.3 in an isolated environment.
- Strict TypeScript checking of model, backup, persistence and lab-state helpers passed. The new test source also passed with a local-only `vitest` declaration mapped to Node's test types.
- The same 33 new test bodies were transpiled and executed with only the runner import adapted from `vitest` to `node:test`: **33 passed, 0 failed**.
- New domain TS/TSX and E2E source transpilation produced no syntax diagnostics.

These results are not an installed Vitest run, a full React/application typecheck, ESLint pass or production build. The connected work PC was unavailable. A local Chromium probe was attempted but navigation was denied by the environment with `net::ERR_BLOCKED_BY_ADMINISTRATOR`; no browser assertions, visual QA or application E2E pass is claimed. The committed workflow must provide the real application checks when GitHub assigns a runner.

## Unchanged scope

No Remotion package, MP4 rendering service, paid API or database migration is introduced. Diagrams remain React/SVG educational illustrations, not evidence of the Studio brush engine's rendering quality. Studio courses remain manual-based self-guided exercises rather than automatic UI tours or automatic work evaluation.

Implementation references: React `useSyncExternalStore` documentation and MDN's `Window: storage event` documentation. Product-specific claims must continue to be checked against the actual application rather than inferred from these educational diagrams.
