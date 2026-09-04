# Marketplace benchmark → ToonSpectrum implementation map

This map turns the existing benchmark registry and results into auditable product boundaries. It intentionally separates implemented behavior from future commerce work.

| Product job | Benchmark patterns reviewed | ToonSpectrum implementation | Status |
| --- | --- | --- | --- |
| Find production-ready material | Clip Studio Assets, BlenderKit, Fab, Unity Asset Store, VS Code Marketplace | `/market/browse`, typed kind/license/tag/search facets, relevance/newest order, cached fallback | Implemented |
| Judge quality before acquisition | Clip Studio Assets, Sketchfab, ACON3D, KitBash3D | brush/filter/palette/template previews, interactive 3D viewer, package entry list, webtoon quality matrix | Implemented |
| Understand rights and provenance | Clip Studio Assets, Fab, Unity Asset Store, ACON3D | immutable release metadata, license/AI disclosure, moderation/report flow, release history, metadata snapshot | Implemented |
| Acquire once and find again | BlenderKit, Unity Asset Store, VS Code Marketplace | account cloud library, archive/restore, current-head reconciliation, local install receipt | Implemented |
| Move from catalog to the creation tool | BlenderKit, VS Code Marketplace, KitBash3D Cargo | canonical `installMarketResource` handoff, resource-kind destination contract, real Studio pack install / asset insertion | Implemented |
| Update without losing package identity | VS Code Marketplace, BlenderKit, Unity Asset Store | immutable SemVer releases, logical package identity, installed-current / update-available state | Implemented |
| Evaluate with credible usage evidence | Clip Studio Assets, Unity Asset Store, Fab | account-scoped rating, library eligibility, Studio-install verification badge, aggregate distribution, helpful votes | Implemented in this branch |
| Ask questions and receive publisher answers | Clip Studio Assets, ACON3D, Fab | shared comments, one-level replies, publisher badge, likes, permission-aware deletion | Implemented in this branch |
| Publish and manage creator packages | Clip Studio Assets, Unity Asset Store, VS Code Marketplace | Studio authoring handoff, package builder, publish gates, owned heads/history, delist/relist, moderation | Implemented |
| Paid checkout, tax, refunds and seat entitlements | Fab, Unity Asset Store, ACON3D | No production payment or entitlement ledger yet | Explicitly deferred |
| Notifications and creator response SLA | Clip Studio Assets, Unity Asset Store | No durable notification inbox yet | Next social phase |
| Review media attachments and abuse reports | Fab, ACON3D | Text review and resource report exist; review-specific report/media workflow is not yet available | Next trust phase |

## Acceptance boundaries for this branch

1. Two signed-in browsers read the same persisted discussion and ratings.
2. Clients cannot manufacture publisher, acquisition, or Studio-use badges.
3. Only a library member can rate; the publisher cannot self-rate.
4. A successful Studio confirmation upgrades the reviewer badge without rewriting the review.
5. Comment and review reactions are idempotent per account.
6. Comment deletion redacts the body at rest while preserving a reply placeholder.
7. Every market-to-Studio CTA uses the same query contract consumed by the Studio installer.
8. Production readiness fails when the migration, relations, or minimum runtime privileges are missing.
