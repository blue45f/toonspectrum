# Virtual Studio pinned review capture and private preview contract

Status: **current reader and explicit raster preview producer; runtime admission remains gated**.
This document does not declare operational rollout, ProjectGraph migration, or the complete
Virtual Studio design finished.
Authority order remains source/tests, accepted ADR-0022, then design documentation. ADR-0024 is
proposed and must not be treated as a deployed snapshot service.

## Current behavior

The social invitation carries only `projectId`, `workId`, `artifactId`, `reviewId`, `revisionId` and
`rootGraphHash`, plus schema version. A receiver consents explicitly. The client fetches current
project access, the exact review and immutable revision again before accepting/committing/opening.
The review snapshot may legitimately differ from the latest editable head. New invitations and
recipient consent require an open/changes-requested review. Historical viewing of an approved,
rejected or cancelled review retains the same exact pin and fresh work ACL; a decision is not a
visibility revocation. Revoking access, changing a pin or failing authority checks fails closed. This invitation
does not create a review decision or confer comment/edit/approval permission.

`GET /studio-project-graph/reviews/:reviewId/previews` accepts the remaining subject coordinates
as allowlisted query fields and an optional ordinal/hash cursor. It reads current work ACL, binds
the review to its artifact and immutable `review-snapshot` revision, matches the exact root graph
hash, and selects only that revision's `preview` blob references. Results are paginated in batches
of 32, with an explicit next cursor, so longer documents retain access to all preview pages.

The reader accepts only a **located v2 PrivateObjectReference** serialized in `studio_blob.objectKey`:

```json
{
  "contractVersion": "toonspectrum.private-object-storage.v2",
  "providerId": "cloudflare-r2",
  "purpose": "derived",
  "digest": "sha256:<64 lowercase hexadecimal characters>",
  "objectPath": "sha256/<first two hash characters>/<64 hash characters>",
  "byteLength": 12345,
  "contentType": "image/png"
}
```

The provider value above is an example, not a chosen provider or routing default. The actual
stored locator must identify the provider returned by the existing private storage implementation.
The parser also accepts the existing `supabase` and `backblaze-b2` located provider identities; it
does not enable or configure them. Legacy paths, arbitrary URLs, unlocated v1 references, unknown
fields, inferred buckets, inferred purposes and encrypted content are rejected.

The stored hash, path prefix, media type and size must all match the immutable object reference.
An active `creator_work_asset_storage_reference` in the **same work** and its active
`creator_asset_storage_object` must also prove the exact provider/locator identity. Graph blobs
are globally hash-addressed, so copying a known blob hash into an editable revision is not proof
of asset ownership. Missing ownership, a different provider, or a deletion-in-progress state
returns unavailable even if the graph revision itself is accessible.
`malwareStatus` must already be `clean`, `formatStatus` must already be `valid`, and encryption
metadata must be null. Only PNG, JPEG and WebP previews are displayed. SVG, HTML and arbitrary
document bytes are not returned through this image reader. It uses the already configured
`PrivateObjectStoragePort`; no provider fallback, upload, deletion, new bucket or storage migration
occurs on a read. Missing storage, missing preview rows, unverified blobs and unmapped locators
return `preview-unavailable` rather than a successful empty preview or a latest-head substitute.

Signed URLs expire within 30 seconds, are kept only in component memory, and must not enter peer
packets, saved documents, logs or analytics. The browser validates the complete response identity,
MIME allowlist, ordinal order, page cursor and expiry. The UI removes expired images and uses
`referrerPolicy="no-referrer"`. Every subsequent read performs current ACL checks. A signed URL
already issued can remain usable until its short expiry; it is not an instantly revocable token.

Implemented boundaries:

- `apps/api/src/modules/studio-project-graph/studio-review-preview.controller.ts`: authenticated
  read-only route and strict query DTOs.
- `studio-project-graph.repository.ts#getReviewPreviewSource`: ACL and immutable reference binding.
- `studio-review-preview.ts`: exact storage locator validation.
- `studio-review-preview.service.ts`: existing provider read, safe response and short expiry.
- `apps/web/src/domains/creator/virtual-space/studio-virtual-space-review-preview.ts`: actual client
  reader consumed by the pinned-review UI; supports paginated reads.

## Explicit authoring producer

The editor bridge uses the existing saved-work and renderer authorities. It reads the current
shared CreatorWork document, compares its canonical JSON digest with the authoritative runtime
projection, and offers the existing save flow when they differ. A local-only work must complete
its normal server-save choice; resolving a save-dialog Promise is not evidence of a server save.

The user explicitly chooses “검수본 만들기”. Before asynchronous page capture, the client calls
`POST /studio-project-graph/review-captures/prepare` with an immutable intent ID, work ID, exact
saved server revision, SHA-256 of `canonicalJson(CreatorWork.doc)`, page count, title, device ID and
creation time. The server verifies current edit access, the stored revision/doc digest and page
count. It uses the existing graph bootstrap/create-artifact methods to provision a dedicated
`review-snapshot` artifact for this work. Initial graph creation retains its existing
manage-members requirement; review creation does not grant any new permission. Other manuscript
artifacts and the saved CreatorWork are not edited by this producer.

Preparation returns the actual graph project/artifact IDs and expected artifact head ID/hash.
It records a separate immutable `studio_mutation_receipt` before returning, so an ambiguous
prepare can recover the same identity after the current document changes. Reusing the intent ID
with different capture metadata conflicts. The bridge captures all pages through
`handleCapturePagesForPreset('all')`, retains their exact PNG Blobs, and rechecks runtime scope,
generation, current permission, saved revision and doc digest after capture. It never re-renders
under the same retry identity.

Each PNG is sent once through `PUT /studio-project-graph/review-captures/pages/:ordinal`. The
existing `StudioWorkAssetUploadGuard` runs before Multer; the service also checks the same
admission gate before decoding. The route allows one bounded PNG file and one strict intent
field. It accepts no peer URL, provider key, object path, caller-supplied scan status or arbitrary
blob locator.

## Actual raster validation authority

The pre-existing API `image-js` dependency and `backend-capability-thumbnail-worker.ts` establish
a current decode/encode implementation. The dedicated review canonicalizer runs actual PNG
parsing, bounded inflation, `image-js` decoding and PNG encoding in a separate Node worker. A
15-second timeout or abort terminates that worker; a Promise timeout does not leave a synchronous
decoder running on the API event loop. At most two decoder workers run per process and a slot is
released after the worker exits.

The producer keeps the existing work-asset ceilings: 8 MiB encoded bytes, 16,777,216 pixels and
16,384 pixels on either axis. It never silently downsamples an oversized page. It accepts
non-animated, non-interlaced, 8-bit RGB/RGBA PNG from the canvas renderer. Chunk CRCs, exact
scanline inflation length, decoded dimensions, bit depth and channels are verified. The newly
constructed PNG preserves each RGB and straight-alpha channel value, including RGB behind alpha
zero. Unsupported color profiles, gamma/chromaticity, transparency conversion requirements or
pixel formats fail explicitly instead of silently changing appearance. Standard sRGB canvas
output is supported; wide-gamut/HDR conversion is not claimed.

Untrusted ancillary metadata never reaches the image decoder or stored derivative. A fresh
pixel-owned Image is encoded without source metadata. The output adds only an sRGB declaration
and a server-generated page-identity text chunk containing a fixed hash and integer ordinal.
This keeps repeated identical/blank pages distinct despite the existing
`studio_revision_blob` primary key `(revisionId, blobHash, role)`; no page is deduplicated away.
The original and output hashes are recomputed from actual bytes.

The `malwareStatus='clean'` value has a narrowly defined trusted-producer meaning here:
**the server constructed this new, inert raster from bounded, successfully decoded pixels**.
This is not an antivirus scan or clean attestation for the supplied original bytes. No accepted
ADR prescribes a specific scanner implementation; the existing graph schema defines readiness
states and the commit boundary requires clean/valid. The original metadata-registration API
continues to create pending/pending blobs. The dedicated producer may mark only its actually
reconstructed bytes clean/valid after exact identity checks; it cannot promote an arbitrary
client registration, override blocked/failed evidence, or alter encryption metadata. No ClamAV
service, daemon dependency, new package or operational configuration was introduced.

## Existing upload, immutable pin and lifetime authority

The canonical PNG becomes a real, owned image source through `StudioWorkAssetService.upload`,
then a derived object through `uploadGeneratedObject`. Both existing service/repository methods
retain current work ACL, immutable source identity, membership quota, configured private-storage
readiness and returned-reference validation. The source asset contains the actual canonical
pixels, not a placeholder. The untrusted input file is not persisted as a clean source. The
existing source and derived purpose separation is preserved, including source CAS retention.

The server persists the exact located v2 reference returned by the existing provider in
`studio_blob.objectKey`. Under the same object-row lock used by deletion, it proves an active
source-bound storage reference in the same work, verifies hash/size/MIME/locator, and performs a
compare-and-set registration. The trusted immutable storage port remains the physical upload
and object-identity authority; no new provider or guessed remote read path is used.

`POST /studio-project-graph/review-captures/complete` requires one validated receipt for every
ordinal in source order. In one database transaction it rechecks current work edit access,
source revision/doc/page count, dedicated artifact identity, expected graph head ID/hash and
every exact active storage reference. Object locks are acquired in hash order. It creates a
checkpoint, its submission, an immutable review snapshot and an open review under the existing
revision topology. Their rootGraphHash is the exact captured source-doc digest; the earlier
head hash is a separate concurrency fence. The immutable operation also retains that exact
source document and the preview validation policy. The dedicated artifact head advances to its
checkpoint; no latest manuscript is substituted for the review source.
The current work owner is the default designated reviewer, satisfying the existing reviewer
constraint without promoting an editing submitter into a role that can approve their submission.
Existing review decision authorization remains authoritative.

The same transaction inserts all ordered preview refs and a terminal immutable receipt. A
replayed completion returns that exact result, including after later document edits. A changed
page list under the same key conflicts. Cancellation uses a separate terminal receipt, so a
late upload/complete cannot revive a cancelled prepared intent. If completion wins the race,
cancel returns the completed subject honestly. Preparing and finalizing use separate receipt
keys because mutation receipts themselves are immutable.

Ordinary generated-object deletion and orphan cleanup now check same-work graph preview pins
under the same storage-object lock before even removing a shared reference. A deleting object
cannot acquire a new pin. Generic graph preview commits use the same ownership/lock bridge.
The source asset remains protected by its generated reference. Explicit whole-work deletion
retains its separate `requireWorkDeleteAccess` authority and existing final work cleanup; a
viewer/editor cannot turn a reference-delete request into whole-work deletion.
After generated references have been drained, the existing owner/admin `deleteWork` transaction
removes only that work's review, operation, receipt and revision-parent dependencies before the
graph/work cascade. This preserves the existing RESTRICT foreign keys and immutable update
triggers. A later database failure rolls back the graph cleanup together with the work deletion.

Acknowledged partial uploads are compensated through the existing exact-hash generated/source
cleanup methods. Unknown provider acknowledgements are not fabricated, and a simultaneous pin
or lost permission prevents unsafe cleanup. Cancel can retry cleanup with the same intent and
reports `cleanupPending` when a provider or permission boundary prevents completion. Immutable
source-purpose CAS bytes retain their existing retention policy; reference cleanup does not
claim to physically delete those source bytes. Cancelling before a prepare receipt exists has
no image state to remove; the editor must ignore a late prepare response and never capture from
that abandoned action. Such an abandoned bootstrap can leave only dedicated graph metadata.

## Verification and runtime prerequisites

The focused tests exercise actual worker decode/encode, exact RGB/RGBA preservation, repeated
pages, invalid CRCs, animations, color-profile rejection, encoded/pixel/inflation budgets,
worker abort/timeout, guarded admission, exact-hash compensation, immutable input binding,
partial/reordered receipt rejection, and ambiguous client retry without duplicate automatic
requests. Existing asset service tests remain part of this check.

`studio-review-preview-producer.integration.test.ts` uses the existing isolated PostgreSQL
integration harness and requires its URL on CI. Its cases cover complete/read/history of two
identical pages, persisted prepare recovery, changed source rejection, cancellation and orphan
cleanup, a real delete/publication race using the shared object row lock, editor submission
without approval escalation, revoked-reader rejection, and authorized whole-work deletion with
generated-reference guards and database rollback. The Nest module DI test instantiates the actual
Creator/graph modules while isolating unrelated schema probes and lifecycle schedulers. Record actual
execution evidence separately; merely adding this file does not claim that a database test ran.

The normal `STUDIO_WORK_ASSET_ADMISSION` gate, a configured existing private provider, current
permissions, valid migrations already owned by the repository and a real server-saved document
remain prerequisites. This change does not enable a gate, select a provider, migrate a database,
deploy a service, or claim an unavailable runtime is usable. The UI surfaces those conditions
instead of returning a successful empty preview or opening the latest head.
