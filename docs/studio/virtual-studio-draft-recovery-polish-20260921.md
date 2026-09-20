# WorkSession input continuity refinement — 2026-09-21

Follow-up to merged PR #1890 (`5f4d73447e7b6c058bd8dc41840b95d61b8f7516`). Frontend-only refinement; no new API, migration, provider, credentials, CI policy or deployment.

- Session creation title and purpose now retain per-actor/work tab drafts. Opening the form never submits a session or restores stale invite/review permissions. Drafts clear only after the existing controller confirms creation.
- Note and outcome recovery fields replace their state immediately when their identity key changes. Another actor/work's previous text is not rendered under the new key.
- Browser recovery-storage read/write failure is visibly reported. A failed write keeps the text in the current view; it is not misrepresented as durable storage.
- Periodic server reads no longer disable typing or take focus from note, purpose and outcome fields. Submission stays disabled during the request, and handlers continue to reject duplicate submission. Actual pending writes still lock their input.
- Recovery reads do not truncate or overwrite the stored original merely by opening the form. Cached immutable snapshots keep the React external-store subscription stable.

Verification: 3 focused Vitest files / **24 tests passed**; changed-file ESLint passed. Includes actual form events, account/work field isolation, storage failure, background-read focus, confirmed-vs-uncertain creation and the existing exact-receipt controller regressions. Roster, preview and API boundaries in component tests are synthetic, not authenticated production proof.

React subscription contract checked against the official `useSyncExternalStore` reference. Existing server CAS, idempotency and authority remain unchanged. Normal pre-push typecheck and remote CI/review evidence are tracked on the follow-up PR.
