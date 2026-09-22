# Approved review delivery — 2026-09-23

Status: implemented and locally verified; exact remote CI and merge receipts belong to the pull request.

## Scope

This increment completes a bounded approved-review delivery workflow without changing deployment or production infrastructure. It starts only from the exact immutable review revision already approved by the existing review authority.

- A permitted sender prepares a delivery for an explicit active project member and exact approved review.
- The sender confirms the delivery profile and a versioned rights statement for the exact source.
- Issue, download, delivered receipt, recipient acceptance, cancellation and source invalidation are separate states and append-only events.
- Operation IDs, expected versions and payload hashes make retries exact and reject stale or altered commands.
- The ZIP contains the approved preview bytes plus a validated manifest, profile, source/approval identity, rights statement and per-page checksums.
- Private object URLs and storage locations are never placed in the manifest. Download validates private bucket readiness, object metadata, MIME, length, SHA-256 and aggregate size before issuing a bounded archive.
- Recipient membership, role, account status and membership epoch are checked again for sensitive actions. Re-inviting an account does not revive a prior delivery.
- Whole-work deletion follows the existing authorized cleanup path; delivery history is otherwise immutable.

The UI is integrated into the existing review export surface. It supports keyboard operation and responsive layouts and distinguishes prepare, issue, save ZIP, mark delivered, accept and cancel. It does not claim that a generated file was received or accepted until the corresponding explicit action is recorded.

## Runtime and database boundaries

`0088_studio_review_delivery.sql` is an additive managed migration. It is source only in this change and was not applied to production. The API fails closed if the schema, review policy authority, private storage contract or persisted manifest is unavailable or invalid.

The `@toonspectrum/studio-project-model/review-delivery` subpath is part of the explicit API compile and staged runtime export map. Production API packaging checks resolve the emitted subpath instead of relying on monorepo-only source resolution.

## Verification performed

- Focused review-delivery, Web integration, migration and bootstrap regressions: 7 files / 113 tests before the persisted-manifest hardening.
- Manifest boundary hardening and ZIP regressions: 3 files / 14 tests.
- Fresh disposable PostgreSQL database: all managed review prerequisites plus migrations 0086, 0087 and 0088; 16 invariant triggers; canonical preview/review/delivery integration 44 tests. Only the newly created database was removed afterward.
- Actual React browser workflow at 1440, 820, 390 and 320 pixels: prepare, issue, recipient session, ZIP save, recipient acceptance, keyboard entry and horizontal-overflow checks.
- Web/API typecheck, changed-file lint, architecture boundaries, changed-file secret scan and `git diff --check`.
- API production build, emitted runtime imports/native resource checks and legal policy tests.
- Web production bundle and the existing Studio bundle boundary checker.

The browser workflow uses explicit synthetic HTTP and identity fixtures. PostgreSQL and repository tests establish stored authority, but this is not production authentication, real external file transport, WAN or recipient-device evidence.

## Deliberately separate

This increment does not introduce platform-specific publication profiles, external platform upload, email/push delivery, unrestricted webhook destinations, legal certification, DRM, production migrations, deployment, environment or secret changes, domain changes or paid services. Those remain separately approved work.
