# Virtual Studio published-world client — 2026-09-20

Status: **current bounded implementation**, with the remaining rollout and private-media work listed below. This extends the server contract in [world authority](./virtual-studio-world-authority-contract-20260920.md); it does not replace server authorization with browser state.

## Actual surface and authority

The signed-in real-work Virtual Studio page reads the server's current publication and the current team/viewer capabilities. The authoring panel remains a browser draft. An owner or administrator can explicitly publish that draft, apply the current server publication, or publish the locally remembered previous manifest as a new version. Demo, guest, draft and local-work routes keep their existing boundary.

`world-publication/studio-world-publication-client.ts` uses the shared schema, existing renderer/navigation validator and SHA-256 of `canonicalJson(normalizedManifest)`. It rejects a response for another work, malformed geometry/catalog data or a mismatched canonical hash. Publication sends an explicit base revision and an idempotency key to the existing server CAS endpoint. A fresh read cannot silently move the draft's base. A conflict requires reviewing the current world; it does not reapply the draft automatically.

An ambiguous mutation retains one exact normalized manifest, base revision and request ID. Only the user can retry that same intent. Automatic authority renewal never repeats a POST. An idempotent receipt is followed by another current-publication read, so replaying an old receipt does not switch the client back from a newer server head.

Browser drafts now store a versioned envelope with their exact `basePublishedRevisionId`. Null explicitly means that no server publication existed; a missing origin marks a legacy/unbased draft. Loading an A-based draft after publication B preserves A. Older or unknown bases cannot be published automatically: the user must review the replacement and explicitly save the draft against the displayed current base. That choice performs a fresh read, rejects a concurrent head change, preserves the draft bytes, and performs no publication POST. Publishing remains a separate explicit action. Changing the draft or leaving the panel fences a delayed base confirmation.

The browser's 15-second capability lease controls publication actions; server ACL/CAS checks remain authoritative. An account change synchronously clears the old publication and asset URLs even before the React session prop updates. An actual access denial clears the published realm and tears down its shared activity. Ordinary window blur, hiding the tab, a same-actor session renewal or an unavailable read fences pending UI work without manufacturing a world change or hanging up an accepted conversation. Transport/session authorization continues to own connectivity. A hidden candidate is not automatically adopted on refocus.

## Prepare, apply and cleanup

`studio-world-publication-assets.ts` fetches every distinct background/prop URL without cookies or a referrer, checks the image response, and decodes its original bytes. It bounds concurrent decoders without resizing or omitting props. Phaser receives the resulting object URLs, avoiding a second network read of those URLs. Any required asset/decode failure keeps the exact existing scene. A candidate is adopted only after a further fresh authority/current-revision check. Superseded candidates, failed decodes, account changes and unmounts dispose their object URLs.

The manifest is pinned by canonical hash; this slice does **not** claim durable content addressing for external image URLs. It retains the bytes fetched for the active browser realm. Other clients can still receive different bytes if an external image URL is mutable. Immutable asset admission/pinning is a remaining prerequisite for stronger cross-client artwork guarantees.

The realm scope is SHA-256 of `{ workId, worldId, revisionId, contentHash }`. The React experience key changes only on an actual actor/work/publication epoch transition. That transition ends the old follow/movement, exact scoped Huddle, consent controllers and slot lease, then resolves the new manifest's validated entrance. A same-content undo has a new revision and therefore a new epoch. Repeated current-publication reads retain the same prepared object, scene and accepted activity.

Presence, reactions and leave packets carry the publication scope. A published realm rejects missing or different scopes; bundled-world clients retain their prior scope-free compatibility. Social, conversation and slot hooks use the same scope. This digest is a compatibility boundary, not a permission or media grant. Server door/session APIs use the separate raw `{ worldId, revisionId, contentHash }` pin. Private acoustic policy remains closed without its required server-backed media authority.

## Verification evidence

- Eleven focused suites, 143 tests passed: publication controller/assets/UI/hook, persisted authoring origins, browser-storage boundaries, real paired presence ports, Page world-transition wiring, and existing social/conversation/slot lifecycles. The hook tests publish real auth-session changes and distinguish same-actor renewal, account change, hidden late decode and explicit adoption. Skipped concurrent operations cannot be reported as successful publication or base confirmation.
- Scoped ESLint and the complete Web TypeScript check passed.
- `scripts/verify-virtual-studio-world-publication.mjs` exercises the actual product `VirtualSpaceExperience`, authoring panel, publication hook/client/controller, original image decoding and Phaser at 1280px and 390px. It verifies explicit publish, unchanged-read/blur scene retention, new-epoch same-content undo, missing-image preservation of the existing canvas, stale-CAS zero POST, persisted A-draft reconnection after publication B, legacy draft base review, uncertain-response same-ID/same-body retry, late actor-change zero POST, access revocation, 44px publish target and no horizontal overflow. Seven scenarios passed with no page errors.
- The browser harness deliberately supplies a synthetic actor and controlled world/team/publish HTTP responses. It is not evidence of production login, production database publication, a real multi-user provider, WAN behavior or scale/performance. The API's real PostgreSQL contract tests are separate evidence owned by the server slice.

Run from the repository root with its dependencies installed:

```sh
pnpm exec vite --host 127.0.0.1 --port 5256 --strictPort
STUDIO_QA_BASE_URL=http://127.0.0.1:5256 pnpm exec tsx scripts/verify-virtual-studio-world-publication.mjs
```

The browser script verifies that the loopback listener belongs to the current checkout and writes local evidence to `.qa/virtual-studio-world-publication/`. It must not be pointed at a deployed site. The existing required foundation test target includes the entire `virtual-space` directory, including these new suites.

## Remaining target

Multi-client synchronized adoption/acknowledgement, disconnected-client convergence, WAN/device/scale proof, immutable remote art bytes and private conversation media grants are not completed by this client slice. Background reads can announce a newer publication; applying it is explicit so it does not silently end a user's conversation. Rolling back uses a new server CAS publication, never a local head rewind. No deployment or production migration was performed.
