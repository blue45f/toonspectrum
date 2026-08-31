# Creator Marketplace package moderation

Migration `0034_creator_marketplace_package_moderation` makes
`creator_marketplace_package_moderation` the only runtime visibility authority for a
`publisherId + packageId` identity. A decision on any release therefore covers every historical
release and every successor. `creator_marketplace_resource.hidden` is retained as an immutable
0031/0032 cutover marker only: the migration conservatively backfills a hidden package when any
release marker is true, and runtime queries must never read or update that column.

All package-changing paths use this order:

1. Read an immutable release anchor only to discover publisher/package identity.
2. Acquire the `toonspectrum:creator-marketplace-release:v1:` advisory transaction lock.
3. Lock the package moderation state row.
4. Lock or mutate release, report, account, and library rows.

Public list/detail/history and new reports require an active package. Publication and owner relist
also require active state; owner delisting remains allowed because it only removes availability.
Owned lifecycle and moderation queue projections expose package state while retaining a derived
`hidden` compatibility field. Administrator hide/restore keeps the existing release-anchor route,
writes an append-only decision, and resolves every open report snapshot for the package. Restore
does not relist owner-delisted releases or reopen reports.

New report evidence is schema v3 and snapshots publisher/package, the observed moderation
revision, and a report epoch equal to the absolute package head's immutable `releaseOrdinal`.
Existing v1/v2 JSON is never rewritten. New reporter uniqueness includes both moderation revision
and report epoch: dismissing a report or relisting the same content does not admit a duplicate,
while either a restored moderation revision or a materially new successor release can be reported
without deleting the earlier audit record. Reporting a historical release consumes the current
absolute-head epoch, preventing old UUIDs from multiplying the same package report allowance.

Cloud-library membership and exact confirmed facts are private history and remain readable while a
package is hidden. Hidden state blocks new acquisition and confirmation advancement; an exact
already-confirmed retry may return `changed: false`.

Appeals are deliberately deferred beyond the P0 cutover. There is no owner appeal endpoint or
owner-authored moderation decision. A later appeal design must add a separate append-only event and
must not mutate administrator decisions, report evidence, or the package revision history.
