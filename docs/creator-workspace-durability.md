# Creator workspace durability pass — 2026-09-06

This supersedes the read-before-write-only storage limitation described in `creator-resources-followup.md`. It does not replace the original resource provider/rights documentation.

## Changes

All creator-resource mutations now use one asynchronous Web Locks critical section around the existing v1 localStorage record: read latest state, validate, compare the raw snapshot, and write without awaiting inside the critical section. Saved resources, recipe checks, publishing checks and backup restore use this path. The storage format and existing backups remain compatible. Checkbox updates express the intended checked state rather than toggling a stale snapshot. Save controls wait for persistence; the hub awaits backup completion instead of treating a Promise as success.

Web Locks coordinate **cooperating same-origin tabs**. Older already-open application versions or other code writing this key without the lock are not guaranteed atomic participants; refresh those tabs after rollout. Unsupported/insecure contexts are explicitly read/export-only for the shared board rather than falling back to unsafe concurrent writes. Lock acquisition times out after four seconds and never steals a lock. A failed or oversized transaction leaves the existing board intact.

The story editor saves only fields changed by its draft. Different-field edits merge; concurrent changes to the same field are rejected as one atomic operation. The page compares saved text with the draft and provides explicit per-field selection. Choosing a value only rebases the draft; it is not persisted until Save. A later external change causes another conflict. Deliberate deletion and Korean trailing whitespace are retained.

Story drafts additionally use a versioned **tab sessionStorage** record with the original field baseline. Page navigation/reload can recover the draft. Corrupt recovery data is preserved and requires explicit discard; blocked session storage still permits in-memory editing and file export. beforeunload is registered only while dirty. It is a best-effort browser prompt, not a guarantee: browser crashes, storage deletion, policy restrictions or closing a tab may destroy session drafts. Important work still needs exported backups. This is not account synchronization, encryption or cloud recovery.

Destructive restore captures a raw snapshot before confirmation and checks it again under the lock. If another tab changes the board in between, replacement is rejected rather than discarding that newer work. Merge remains the default. Corrupt main storage can be replaced only using explicit replacement plus a matching snapshot.

## Verification actually executed in this session

- Node 22.16.0 + TypeScript 5.8.3: strict compilation of dependency-light contracts/engines and **79/79** shared regression cases passed (previous 52 + 27 new storage/draft cases).
- Chromium 144.0.7559.96: the same **79/79** shared cases passed in an isolated in-memory browser harness using `--pure`. This is not React page rendering or actual provider traffic.
- **30 TS/TSX files** in the working source bundle passed syntax transpilation; `git diff --check` passed. This is not a full-repository typecheck/lint/build.
- The default real-browser run attempted navigation to a loopback test server but the managed browser returned `net::ERR_BLOCKED_BY_ADMINISTRATOR`. No browser policy was disabled. The six real multi-tab/Web Locks/session scenarios were therefore **not executed successfully here**.
- Whole-app desktop/mobile visual checks, production API requests and protected `core` completion remain unverified.

## Repeatable commands

```sh
node scripts/check-creator-resources.mjs
node scripts/verify-creator-workspace-browser.mjs
```

The second command compiles the same sources, starts a temporary loopback-only server, and runs the 79 shared cases plus six real-browser scenarios: 80 concurrent mutations across two pages, same-field conflict, stale replacement, lock timeout/recovery, session draft reload/isolation, and release when a lock-holding page closes. It requires Playwright and installed Chromium. The dedicated creator-resources workflow now runs it with its isolated checker dependency. Existing root core/verify gates are unchanged.

`--pure` explicitly runs only the shared browser cases without navigating to the test server and reports that six integration scenarios were NOT RUN. It must not be described as multi-tab integration proof. For local verification only, `CREATOR_PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE_PATH` can select an already-installed Playwright module/browser; neither changes browser policy.

## Implementation references

- Web Locks: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
- Secure-context availability: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/locks

No deployment secrets, database schema, billing settings, branch protection or required-status settings were modified. A successful local unit run is not a substitute for GitHub's required `core` status.
