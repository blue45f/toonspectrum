# Authored manuscript capture through the full Studio Host

Status: **current QA evidence**, 2026-09-20. This extends the earlier empty two-page
[Host bridge check](virtual-studio-review-production-workflow-20260920.md#actual-host-capture-with-an-isolated-local-api).
The browser drives the actual `/studio?id=…` editor. These are reproducible synthetic pen
sketches, not production artwork or proof of every renderer and element type.

## What is real and what is a fixture

The verifier owns a local Vite process and Nest API. Login, cookie authentication, work creation,
source reads, shared-document permissions, the Socket.IO/CRDT save boundary, the normal Host
save command, PostgreSQL persistence and full-resolution canvas export are real. It inserts a
new verified disposable account into an already migrated, dedicated loopback QA database to
avoid sending signup email. It does not migrate/reset a database or load production environment
files. Both owned processes and Chromium close on success or failure.

Only capture-producer HTTP is intercepted: prepare/status, page upload receipts, completion and
cancellation. This API has no configured private object store. The uploaded multipart PNG bytes
are preserved exactly, hashed and saved as evidence. There is no production upload, stored-object
read-back, signed URL, remote storage durability or production graph attestation claim.

The initial empty-page verifier omitted `VITE_STUDIO_LIVE_DEV_PROXY_ENABLED`. It successfully
tested actual login, GET and export, but had never authored or saved changes. New real pen input
exposed the missing gateway connection: the shared save correctly refused to cross its server
acknowledgement boundary. The QA runtime now opts into the existing same-origin Vite WebSocket
proxy, which points only at its owned loopback Nest API. No product save/permission guard changed,
and local-only recovery is not accepted as a successful server save.

## Input and acceptance checks

1. Create two empty 720 × 1080 source pages with distinct blue/peach backgrounds using the
   existing work API and source schema. No drawing elements are seeded into the payload.
2. Select each actual page card, activate the shipped pen tool (`B`), set 12 px with the visible
   range control, and select the product's default ink/paper colors (`D`). Playwright pointer
   events draw three separate strokes per page: a frame, an internal contour and a short line.
   The second page uses different geometry. Screenshots preserve the actual editor presentation.
3. Wait for three canonical layer rows, not merely visible transient ink. The renderer can show
   a stroke before its deferred document commit; capture authority deliberately refuses that state.
4. Invoke **Create a review from the saved source → Save and check again** through the UI.
   The real shared-document PATCH must contain a nonzero CRDT server sequence. An independent
   authenticated GET after the save must show an advanced revision and the authored source pages.
5. Independently hash canonical saved source JSON. Require the prepared source revision, digest,
   page count and work identity to agree; after capture, require the saved revision/digest to remain
   unchanged. Require exactly one prepare and complete, two ordered uploads and matching SHA-256
   completion receipts. Capture must not write its already pinned source.
6. Decode each original uploaded PNG. Require the unchanged default 2× result, **1440 × 2160**,
   source page height/aspect, opaque pixels and the original background across the clear margins.
   Check eight interior sample positions per saved stroke against visible dark ink within its
   declared width. At least seven must match per stroke; whole-image nonemptiness alone is insufficient.
7. Compare ink masks after excluding each page's background. At least 500 pixels must differ,
   so different background colors cannot make duplicate artwork pass. Preserve uploaded PNG hashes,
   saved JSON, gesture coordinates, per-stroke evidence and completion/editor screenshots.

## Observed result and bounds

The final authored gateway run advanced the real saved source from revision **1 to 2** with one
shared PATCH carrying CRDT server sequence **203**. Prepare and complete each occurred once,
both original PNGs remained 1440 × 2160, all six strokes matched **8 of 8** saved-coordinate
probes, and there were **zero page errors**. The final run measured 79,438/74,131 dark ink pixels
and 143,461 different ink-mask pixels. Both
original captures were visually inspected: the frame and interior contours were present, with
correct page background, ordering and no editor chrome in the exported PNGs.

The independently computed saved-source digest was
`3293dc6f26683bbc8356391354ebd398628e7470223a2e729697231760f89561`.

| Ordinal / source page | Original PNG bytes | SHA-256 |
| --- | ---: | --- |
| 0 / `qa-page-one` | 191,693 | `dc86543598a739fe6d84dc13e2931cad90d06f132c2bc3634e429a44ef143b98` |
| 1 / `qa-page-two` | 196,132 | `48268c897784a563530f601d8554e8270ab09e4aa57df9d1d514e39f7858ed7f` |

Final evidence is in `.qa/virtual-studio-review-host-authored-final/`; the local execution log is
`/tmp/virtual-studio-review-host-authored-final.log`. Four focused files / **34 tests** passed
(pixel evidence, isolated API target/environment, capture bridge and Host binding), and scoped
lint/diff checks passed. Source IDs and accepted input samples are generated anew on each run,
so the byte hashes above identify this actual run, not fixed golden hashes for future sessions.

The pixel helper's five regression tests reject blank exports, a missing individual stroke,
swapped geometry, a changed background, incorrect scale, transparency and identical ink masks.
This is coverage for the actual default pen, not typed text, every brush, image filters, masks,
3D, cross-browser color parity, tablet hardware or WAN collaboration. Global API readiness still
reports unavailable optional services in this isolated setup; it is not presented as production
health. The actual source/auth/gateway routes used here must succeed independently.

## Reproduce and inspect

With an explicitly selected, migrated local QA `TEST_DATABASE_URL`:

```sh
STUDIO_QA_OUTPUT=.qa/virtual-studio-review-host-authored \
  pnpm exec tsx scripts/verify-virtual-studio-review-host.mts
pnpm exec vitest run scripts/studio-review-host-pixel-evidence.test.ts
```

The loopback origins remain restricted to supported local development ports (defaults web 5181,
API 4355), and occupied ports are rejected. `saved-source.json`, `page-0.png`, `page-1.png`,
`authored-page-0.png`, `authored-page-1.png`, `capture-complete.png` and `report.json` are generated
under the requested QA output directory and are not committed as product assets. Evidence PNGs
are never resized, repainted or otherwise postprocessed by this verifier.
