# Music work scope and rendered regression

The music page now binds new requests to the **current route** rather than retaining the work ID from its first render. Moving from work A to work B preserves the scene, lyrics and account-level recovery library, but resets consent. A submission during an unsettled scope change is rejected. Reusing another track's settings on bare `/music` intentionally leaves the new track unbound; it does not restore that saved track's old work ID. The form displays its current target.

The account-level recovery store is not remounted on work changes. Unsaved generated audio remains available when switching scopes; the work-only filter can be turned off to reveal earlier-work output. The original target of an already-dispatched request does not change. Local mutations are disabled while a library refresh is running. Cancelled errors are ignored before attempting asynchronous error-body parsing, and no replacement paid request is sent.

## Verification layers

`studio-music-work-scope.test.ts` has seven pure regression cases. A local auxiliary execution may transpile it and change only its Vitest runner import to native `node:test`; this does not prove a rendered page or the complete repository.

`StudioMusicPage.test.tsx` mounts the actual page, actual recovery store and actual track cards in React StrictMode with a MemoryRouter. Eighteen cases cover guest/disabled-provider gating, failed reads, duplicate submission, same-output local retry, concurrent actions, unsaved-output refresh, failed deletion, current route binding, explicitly unbound reuse, lyric preservation, cancellation, account switching, measured duration, failed refresh and object URL cleanup. External generation, authentication and durable repository ports are mocked. These tests do not contact a paid provider or prove real OPFS/browser audio decoding.

The additional `Studio music regression` workflow uses existing locked dependencies and runs the music suites and the existing storage-authority boundary. It uploads its real JSON report and tested Git SHA. A separate assertion requires all eighteen rendered-page cases to be present and pass. It uses read-only repository permissions and cannot approve a PR, create a successful status manually, write source files or merge branches. The existing full CI, `core` requirement and branch protection are unchanged.

A successful jsdom test is not a screenshot review, full browser E2E result, real provider integration test or audio-quality approval. Main merge and production activation remain separately verifiable outcomes.

References consulted:
- https://react.dev/reference/react/useSyncExternalStore
- https://testing-library.com/docs/react-testing-library/api/
- https://vitest.dev/guide/reporters
