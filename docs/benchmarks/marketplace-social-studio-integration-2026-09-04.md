# Marketplace social + Studio integration benchmark

Date: 2026-09-04

## Scope

This pass focuses on the acquisition-to-production loop rather than adding another catalog-only surface:

1. discover a resource,
2. inspect compatibility and usage evidence,
3. add it to an account library,
4. install or apply it in Studio,
5. return with credible feedback,
6. let the publisher answer questions and improve the package.

## Competitive patterns reviewed

| Service | Product pattern | Decision for ToonSpectrum |
| --- | --- | --- |
| [CLIP STUDIO ASSETS](https://assets.clip-studio.com/) | Creator-tool-specific resource taxonomy, free/paid facets, publisher type, compatible app/grade, newest and popular ordering, and saved searches. | Keep resource-kind and license filtering, but make Studio compatibility and application status first-class on the detail page instead of treating the market as a generic download store. |
| [BlenderKit](https://www.blenderkit.com/docs/tutorials/ratings/) | Search, acquisition and insertion occur inside Blender. Ratings include production-value signals such as quality and work-hours saved; authors receive comments and validation feedback. | Verify that a reviewer actually completed the ToonSpectrum Studio install/apply flow before accepting a rating. Keep comments open to signed-in members for pre-install questions. |
| [Fab](https://dev.epicgames.com/documentation/en-us/fab/purchasing-and-downloading-assets-in-fab) | Detailed listing metadata, library entitlement, interactive previews, supported formats, changelogs, ratings/comments and export into target DCC/engine workflows. | Preserve immutable release history, rich preview/spec metadata, account library state and direct Studio handoff in one detail journey. |
| [ACON](https://www.acon3d.com/en) | Webtoon-focused categories across 3D, 2D, brushes, sound and making tools; review events and top-rated merchandising emphasize purchased-user evidence. | Keep webtoon-specific usage guides and verified-user badges. Rank and merchandising work should consume server aggregates rather than browser-local seed data. |
| [itch.io creator interaction](https://itch.io/docs/creators/interact) | Account-based threaded comments, configurable voting, project community boards, creator access to ratings and buyer communication. | Use account-authored threads, one-level replies for compact product Q&A, persistent reactions and a future publisher notification queue. |
| [CGTrader seller analytics](https://help.cgtrader.com/hc/en-us/articles/360015211878-Where-can-I-find-my-personal-Sales-data) | Purchased customers can leave positive or negative reviews; negative reviews require explanatory text and sellers can appeal unreasonable feedback. | Require review title and body for every score, preserve moderation/report pathways, and later expose aggregate review quality in creator analytics. |
| Unity Asset Store publisher workflow | Reviews, publisher replies and abuse reporting are part of the listing lifecycle. | Derive a publisher badge from server ownership and keep deletion/moderation authorization on the server rather than exposing client-only controls. |

## Gap found in the existing implementation

The marketplace already had a strong detail shell: interactive brush/filter/palette/template/3D previews, release history, license/provenance metadata, account library actions, wishlists, and a real `installMarketResource` Studio deep link.

The social layer was the weak boundary:

- comments, replies, likes, ratings and reviews were seeded and persisted only in `localStorage`;
- visitors on different browsers never saw the same discussion;
- a visitor could type any nickname and receive a buyer-looking badge;
- review eligibility was not connected to account acquisition or Studio use;
- aggregate scores were therefore decorative rather than marketplace evidence.

## Implemented architecture

### Persistent, account-authored discussion

Marketplace discussion reuses the existing production `review_reply` tree under a collision-resistant resource namespace:

```text
toonspectrum:market-resource:<resource UUID>
```

The API supplies the authenticated account identity. A client cannot submit a display name or badge. Root comments and one-level replies are supported; root comments with replies use soft deletion so the thread remains coherent.

### Persistent reactions and reviews

The existing `review_like` table stores comment likes and review-helpful reactions. The existing `review` table stores one marketplace review per account/resource. Review metadata uses a versioned JSON envelope in the existing text column while tags stay queryable in JSONB.

No new relation or deployment migration is required for this pass, reducing schema cutover risk.

### Studio-qualified review gate

A review is accepted only when all server-side conditions are true:

1. the caller has a verified authenticated session;
2. the caller is not the package publisher;
3. the caller has the publisher/package in the account marketplace library;
4. the library record has `lastConfirmedAt`, written only after the Studio install/apply confirmation flow succeeds.

The detail UI explains the missing step and provides a direct Studio handoff when installation has not yet been confirmed.

### Server-derived credibility badges

The API derives, rather than accepts, these badges:

- `publisher`
- `studio-verified`
- `library-member`
- `member`

This makes review and discussion credibility portable across browsers and prevents local impersonation.

### Shared detail-page state

Comments and reviews subscribe to one resource-scoped external store. The first section starts the request and the second reuses it, avoiding duplicate detail-social GETs. Every mutation returns the complete refreshed social projection so comment counts, rating distribution, viewer eligibility and reaction state stay synchronized.

## Product behavior delivered

- public reading of comments, replies, ratings and reviews;
- authenticated comments and one-level replies;
- author/admin deletion with soft deletion for threaded roots;
- persistent comment likes;
- Studio-verified review create/update/delete;
- one review per account and immutable server-owned author identity;
- average, distribution and recommendation percentage computed from the database;
- helpful reactions and helpful/newest/rating sorting;
- publisher, library-member and Studio-verified badges;
- loading, retry, empty and truncated states;
- account-library and Studio-install requirement guidance.

## Follow-up benchmark waves

The next highest-value marketplace waves are intentionally separated from this social cut:

1. **Discovery ranking:** verified-rating Bayesian score, install-to-first-use conversion, update adoption and abuse-resistant popularity windows.
2. **Publisher operations:** notifications for questions/replies, response SLA, review trend and compatibility issue clusters.
3. **Moderation:** social-content reports, audit history, rate limits shared across instances and duplicate/spam detection.
4. **Rich evidence:** optional Studio-generated before/after image, brush stroke sample, scene screenshot or compatibility telemetry attached to a verified review.
5. **Collections and bundles:** project-scoped asset sets, dependency/conflict preview, batch install and update planning.
6. **Commercial readiness:** entitlement tiers, regional tax/payment handling, refunds and license-seat management when paid assets are introduced.
