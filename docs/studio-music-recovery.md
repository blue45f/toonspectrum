# Music output recovery follow-up

This change builds on AI Music PR #772 without restarting that PR's required CI.

## User-visible improvements

- A generated output whose local save failed stays available for playback and MP3 download. **기기에 다시 저장** retries only the existing SQLite music repository with the same track ID and Blob. It never invokes ElevenLabs or generates a new song.
- Saving and deleting the same output are mutually exclusive. A failed deletion preserves the output and exposes the error rather than silently removing it from the list. Even a save without an acknowledgement may have committed, so deletion always reconciles the repository instead of just hiding the transient item.
- **보관함 다시 확인** reconciles unknown save outcomes and changes from another tab, preserves still-unsaved output, and deduplicates concurrent loads. A failed read is not displayed as an empty successful library; new paid generation is disabled until an explicit successful read.
- Requested and browser-reported actual audio duration are shown separately. No generated duration is guessed.
- Toggling vocals off/on preserves draft lyrics in the current page only. Reusing a setting preserves the active work scope and resets consent. Newly generated output clears search filters so it is not hidden.
- Download object URLs are released even if initiating the download throws. Refresh/close warnings attach only while generation, a storage mutation or unsaved output exists. The music-page return link also asks for confirmation. This is not a global router guard and cannot guarantee protection against mobile OS termination, account changes or every navigation surface; download MP3 backups before leaving.

## Architecture

`createMusicRecovery` owns ephemeral UI state for one account/workspace instance and uses stable, cached snapshots with React `useSyncExternalStore`. It has no generation API, storage engine, global singleton or durable cache. Persistence remains `studio-music-library.ts` -> shared SQLite/OPFS Worker. No storage authority exceptions or CI/branch-protection changes are introduced.

Metadata is copied when an output is retained, while its original immutable Blob is reused. Per-output pending state is published before dispatch, so double clicks cannot race a local save with deletion. A new account gets a new workspace/store. Reads validate account scope and duplicate IDs before replacing the displayed persisted subset. No automatic provider retry or fabricated result is introduced.

## Verification

Sixteen regression cases in `studio-music-recovery.test.ts` cover cached snapshots, subscription cleanup, metadata capture, original-Blob save retry, concurrent action exclusion, reload reconciliation, failed reads, synchronous adapter errors, unknown write outcomes, deletion failures, account isolation and duplicate IDs. Run with the repository's Vitest configuration:

```sh
pnpm exec vitest run src/domains/creator/music/studio-music-recovery.test.ts src/domains/creator/music/studio-music-library.test.ts
pnpm run typecheck
pnpm run lint
```

An offline auxiliary run transpiles the same product and test bodies and changes only the test runner import from Vitest to `node:test`. Its 16 passing cases are not a full repository CI, rendered React test, real browser OPFS check, provider connectivity test or audio-quality approval. Production activation requirements in `studio-ai-music.md` remain unchanged.

Manual UI checks before production activation: save failure -> MP3/download -> local retry; attempted delete during save; failed library read -> disabled generation -> successful retry; saved/unsaved reload reconciliation; actual-duration label; vocal draft toggle; keyboard controls; mobile layout; account switch.

## References

- React external-store subscription and cached snapshots: https://react.dev/reference/react/useSyncExternalStore
- Browser unload warning restrictions and lifecycle limitations: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
