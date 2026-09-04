# Marketplace social + Studio integration benchmark

Date: 2026-09-04

## Product loop reviewed

This pass optimizes the complete creator-resource loop instead of adding another catalog-only surface:

1. discover a resource;
2. inspect previews, compatibility, license and release history;
3. add the package to an account library;
4. install or open it in Studio;
5. return with credible production feedback;
6. let publishers answer questions and improve the next immutable release.

## Competitive patterns

| Service | Pattern | ToonSpectrum decision |
| --- | --- | --- |
| [CLIP STUDIO ASSETS](https://assets.clip-studio.com/) | Creator-tool-specific taxonomy, free/paid facets, compatible app/grade, publisher identity, newest/popular ordering and saved discovery state. | Keep resource-kind/license filters and make Studio compatibility, immutable versions and the next Studio action explicit on detail. |
| [BlenderKit](https://www.blenderkit.com/docs/tutorials/ratings/) | Search, acquisition and insertion happen inside Blender. Ratings capture production value such as quality and work-hours saved, while creators receive comments and validation feedback. | Make actual Studio install confirmation the strongest reviewer qualification and preserve package-level discussion across releases. |
| [Fab](https://dev.epicgames.com/documentation/en-us/fab/purchasing-and-downloading-assets-in-fab) | Detailed metadata, entitlement library, interactive previews, formats, changelogs, ratings/comments and export into target DCC/engine workflows. | Keep preview/spec, account library, release history, report flow and Studio handoff in one detail journey. |
| [ACON](https://www.acon3d.com/en) | Webtoon-focused 3D/2D/brush/tool categories and review merchandising emphasize production suitability. | Retain webtoon-specific usage guidance and show the exact evidence level behind every review. |
| [itch.io creator interaction](https://itch.io/docs/creators/interact) | Account-based threaded comments, voting, project communities and creator access to audience feedback. | Use signed-in account authorship, one-level product Q&A, persistent reactions and publisher badges. |
| [CGTrader seller analytics](https://help.cgtrader.com/hc/en-us/articles/360015211878-Where-can-I-find-my-personal-Sales-data) | Purchased users can leave positive or negative reviews and sellers use the feedback operationally. | Require a title and substantive body for every score, retain moderation visibility, and expose aggregate review signals separately from title reviews. |
| Unity Asset Store publisher workflow | Reviews, publisher replies and abuse reporting are part of the listing lifecycle. | Derive publisher authority on the server and keep delete/moderation permission out of browser-local state. |

## Existing strengths confirmed

The market already had a substantial production shell:

- dedicated home, browse, detail, library, wishlist, publish and manage pages;
- brush, filter, palette, template, procedural asset and 3D previews;
- release history, version, engine, delivery, license, AI/provenance and webtoon compatibility metadata;
- account cloud-library acquisition and archive state;
- direct `/studio?installMarketResource=…&assetMarket=community` handoff;
- local install receipts and account-level install confirmation for supported package kinds;
- reporting and package moderation.

## Gap found

The visible comment/review UI was not marketplace truth:

- comments, replies, likes, ratings and reviews lived only in `localStorage`;
- different users and devices never saw the same discussion;
- a visitor could type an arbitrary nickname and receive a buyer-looking badge;
- review eligibility was not connected to account acquisition or Studio installation;
- aggregate ratings were seeded browser decoration rather than shared evidence;
- discussion was keyed by release, which would fragment every new immutable package version.

## Implemented architecture

### Package-level social identity

All discussion is keyed by a SHA-256 digest of the canonical publisher/package identity:

```text
toonspectrum:market-package:<sha256(canonical publisher/package identity)>
```

A new release therefore keeps the same questions, publisher answers and rating history. The public response still carries the exact resource version currently being viewed.

### Persistent account-authored threads

The implementation reuses the mature production review/reply/reaction relations under the isolated market-package namespace. This avoids a risky schema cutover while providing:

- root comments and one-level replies;
- server-owned account identity;
- publisher/library/Studio badges derived from database evidence;
- persistent likes;
- author/admin delete permission;
- soft deletion for root comments that already have replies.

The ordinary title-review feed and homepage title-review totals explicitly exclude the marketplace namespace, so the two product domains do not contaminate each other.

### Honest, tiered review qualification

A review always requires a signed-in account and account-library membership. The strongest evidence depends on what the current Studio installer can durably prove:

- **brush, filter, palette:** review requires `lastConfirmedAt` plus an exact confirmed package version written after Studio installation;
- **asset, template, 3D preset, 3D asset:** the current Studio flow opens/inserts these resources but does not yet issue the same durable package-install receipt, so reviews are allowed after account-library acquisition and are labeled **account library verified**, never “Studio verified.”

Every review stores its qualification type, viewed resource version and, when available, the exact Studio-confirmed installed version. The publisher cannot review its own package and a reviewer cannot mark their own review helpful.

### Shared, revalidated detail state

Comments and reviews share one resource-scoped external store:

- duplicate detail-social GETs are collapsed;
- every mutation returns and publishes the refreshed aggregate projection;
- sibling release pages for the same package are invalidated together;
- `BroadcastChannel` synchronizes browser tabs;
- focus, pageshow and visibility revalidation refresh eligibility after returning from Studio.

### Compatibility fallback

The old browser-local seeded store is removed. Loading, retry, anonymous-read, empty, permission, truncation and pending states are rendered explicitly.

## Delivered product behavior

- public reading of package-persistent comments, replies, ratings and reviews;
- authenticated comments and one-level replies;
- persistent comment likes and soft-delete thread preservation;
- one review per account/package with create, edit and delete;
- database-computed average, distribution and recommendation percentage;
- helpful, newest and highest-rating sorting;
- publisher, account-library and exact Studio-install badges;
- source-version and installed-version evidence on reviews;
- self-helpful prevention;
- direct Studio installation CTA for missing supported-kind confirmation;
- cross-tab and return-from-Studio refresh;
- title-review feed isolation;
- responsive and in-app-browser authoring regression coverage.

## Browser regression found during this pass

The production UI correctly rendered numbered engine rows such as `2 수채 확산`, but the Playwright checks searched for an exact unnumbered text node. The browser evidence therefore failed while the intended row was visibly present. The checks now use accessible checkbox names, which assert the actual interactive engine row and remain stable when row numbering changes.

## Next benchmark waves

1. **Durable Studio usage receipts for every kind:** confirm direct 2D insertion, selected template application, 3D placement and scene-preset application at the mutation boundary—not merely when a catalog opens.
2. **Discovery ranking:** Bayesian verified rating, install-to-first-use conversion, update adoption and abuse-resistant popularity windows.
3. **Publisher operations:** question/reply notifications, response SLA, version-scoped issue clusters and review trend analytics.
4. **Social moderation:** dedicated report queue, distributed rate gates, duplicate/spam detection and auditable edits.
5. **Rich proof:** optional Studio-generated stroke sheet, before/after frame, 3D scene capture or compatibility telemetry attached to a verified review.
6. **Bundles:** project-scoped collections, dependency/conflict preview, batch install and coordinated updates.
7. **Commercial readiness:** entitlement tiers, regional payment/tax handling, refunds and license-seat management when paid assets are introduced.
