# ToonSpectrum Creator Market benchmark

Benchmark date: 2026-08-31

Implementation snapshot: 2026-08-31 current working tree. This records implemented contracts and test coverage; it is not evidence that the changes have been deployed to production.

This benchmark treats ToonSpectrum as an editor-integrated creator asset ecosystem, not as a generic download shop. The comparison set therefore spans illustration materials, webtoon-specific assets, 3D/VRM/Live2D content, editor-native libraries, motion and interactive files, executable add-ons, open-licensed catalogs, and direct creator storefronts.

The broad inventory in `outline.yaml` covers 38 comparison entries. `results.yaml` records an official-primary-source finding and a ToonSpectrum implication for all 38 entries using 55 distinct official URLs; these are documented observations, not claims of authenticated purchase, seller-console, or hands-on feature testing. The 13-row matrix below is a smaller decision summary. The comparison schema and priority definitions live in `fields.yaml`.

Coverage status is 38/38 source-backed entries with no remaining unverifiable entry. Automated HTTP checks returned 200 for 35 URLs; the other 20 dynamic or anti-bot pages were retrieved through browser search, and no malformed or unresolved URL remains.

## Product decision

The strongest comparable products converge on five promises:

1. A buyer can judge an asset before acquisition through a preview that behaves like the real editor or runtime.
2. Acquisition ends in an installed, findable, versioned library item rather than an anonymous file download.
3. Compatibility and rights are machine-readable decision data, not footnotes.
4. Trust persists through publishing, updates, derivatives, moderation, and delisting.
5. Discovery is supported by useful facets, ranking, curation, social proof, and a creator relationship.

ToonSpectrum now has a materially stronger correctness core: bounded manifests and queries, hash validation, URL-addressable filters, search-aware relevance ordering, bounded stale-cache recovery, multi-entry preview selection, measured Studio compatibility, strict immutable SemVer releases, public/private release history and changelogs, owner delisting and relisting, package-scoped moderation, one-shot Studio deep links, same-browser local install receipts, an account-scoped cloud library, exact post-install confirmation, and crawler-safe market metadata. These changes close the current free JSON-package correctness loop. They do not close P0 gates for surfaces that remain disabled or incomplete: richer character/3D runtime previews, durable popularity and verified-review metrics, saved lists and creator relationships, nested provenance and rights, appeals, executable extensions, and quarantined binary delivery for user-created 2D/3D/VRM content remain separate product boundaries.

## Coverage map

| Lane | Compared products | What the lane tests |
|---|---|---|
| Illustration and manga materials | Clip Studio Assets, MediBang Cloud Materials, Krita resources | Brush/material taxonomy, editor-native install, tones, templates, compatibility, commercial-use and redistribution guidance |
| Webtoon and character production | ACON3D, nizima, BOOTH, VRoid Hub, VRChat Avatar Marketplace, ActorCore, Daz 3D | Interactive character/scene preview, VRM/Live2D rights, rigs, expressions, motion, derivatives, commissions, try-on, performance rank |
| 3D and DCC-native libraries | BlenderKit, KitBash3D Cargo, Superhive, Sketchfab, Fab, Unity Asset Store, CGTrader, TurboSquid, Adobe Substance 3D Assets | In-editor discovery, one-click import, scene readiness, formats, render engines, versions, materials, LODs, retargeting and DCC handoff |
| Browser-native interactive creation | Figma Community, Canva ecosystem, Rive Marketplace, LottieFiles, Spline Community | Remix lineage, stateful previews, editor activation, collaboration, version history, comments and reusable behavior |
| Engine and executable packages | Godot Asset Store, Roblox Creator Store, itch.io assets, VS Code Marketplace, Blender Extensions Platform | Engine-version gates, dependencies, permissions, stable/unstable releases, publisher verification, signing, integrity hashes, pinning, rollback, moderation and blocklists |
| General professional creative commerce | ArtStation Marketplace, Creative Market, Envato, Adobe Stock | Filters, portfolio-to-commerce discovery, ratings, licensing tiers, subscriptions, support and seller trust |
| Direct creator economy | Gumroad, Ko-fi Shop, Patreon, Creative Fabrica | Creator-owned storefronts, memberships, updates, bundles, gifting, entitlement survival and audience retention |
| Open and transform-first ecosystems | Poly Haven, OpenGameArt, Adobe Mixamo | Standardized open ingestion, quality requirements, hashes and APIs, auto-rigging, transformation receipts and production-ready export |

Sketchfab is retained as an interactive-preview/community benchmark. Its Store closed after Fab launched; eligible creators can migrate downloadable products to Fab, while Sketchfab community, viewer and existing-purchase surfaces remain distinct. Godot Asset Store behavior is recorded separately from roadmap promises while its current product is beta.

## High-signal evidence matrix

| Product | Verified behavior from official documentation | ToonSpectrum implication | Priority |
|---|---|---|---|
| [Clip Studio Assets](https://help.clip-studio.com/en-us/manual_en/630_material/How_to_download_materials_from_Assets.htm) | Search and filters cover brushes, images, 3D models and workspaces; detail pages expose compatible software; downloads flow back into the app and supported material types can auto-install into their palettes. | The market detail must state actual Studio compatibility before action, and activation should finish with a visible installed-library receipt. | P0 — current free-pack gate |
| [BlenderKit](https://www.blenderkit.com/addons) | Search, download, purchase state and installation happen inside Blender; the catalog exposes free/full/paid availability, bookmarks and several ranking orders. | Studio should expose the same market facets and installed/update state without forcing a browser round trip. | P0 — current free-pack gate |
| [VRoid Hub](https://developer.vroid.com/en/guidelines/conditions_of_use.html) | Third-party applications can load VRM files through the API, while model-specific conditions distinguish avatar use, violent/sexual depiction, corporate and individual commercial use, modification, redistribution and attribution. | Expand the flat license enum into machine-readable downstream-use conditions for VRM and character assets, and preserve them through export. | P0 — VRM surface gate |
| [nizima](https://docs.nizima.com/guide/preview-guide/) | Buyers can interact with Live2D models before purchase, including playback and model-specific motion behavior; [official upload guidance](https://docs.nizima.com/en/guide/item-upload/live2d/) separately distinguishes preview, export and original packages. | Character listings need expression/motion/part sandboxing plus a conformance report rather than a static cover. | P0 — Live2D surface gate |
| [VS Code Marketplace](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace) | Listings expose publisher, downloads, rating, repository and license; install state becomes manage state; specific versions can be installed. Published extensions are signed and scanned, publishers can be verified, suspicious packages can be blocklisted and automatically removed. | Any future executable Studio add-on requires signatures, verified publishers, static/dynamic scanning, permissions, version pinning and emergency revocation before commerce. | P0 — executable surface gate |
| [Blender Extensions Platform](https://docs.blender.org/manual/en/5.1/editors/preferences/extensions.html) | Blender installs, disables, removes and updates extensions in-editor. The official schema carries SemVer, Blender-version bounds, platform, SPDX license and explained permissions; listing metadata includes SHA-256 hashes and a blocklist. | Use a signed or content-addressed repository manifest, explicit capabilities, compatibility bounds, review and emergency disablement before enabling executable Studio extensions. | P0 — executable surface gate |
| [Godot Asset Store](https://docs.godotengine.org/en/stable/community/asset_store/submitting_to_asset_store.html) | Asset submission records compatible engine versions and releases; management exposes downloads, page visits and library additions. | ToonSpectrum now has immutable releases, changelogs, relisting, local receipts and account-library confirmation. Latest-compatible selection and activation analytics remain. | P0 — current package-lifecycle gate |
| [KitBash3D Cargo](https://kitbash3d.com/pages/cargo) | The product is organized around finding production assets and bringing them into DCC workflows, with a strong emphasis on import readiness rather than a bare download. | Measure acquisition-to-first-use and transformation fidelity; the successful unit is a usable Studio scene item, not a completed HTTP transfer. | P1 |
| [Rive Marketplace](https://rive.app/docs/community/marketplace-overview) | Interactive files can be opened and remixed in the editor with creator attribution. | Model interactive behavior, remix ancestry and credit as first-class lineage. | P1 |
| [Spline Community](https://docs.spline.design/sharing-collaboration-and-workspaces/community-platform) | Interactive 3D scenes are published, explored and remixed from a browser-native creation environment with community relationships. | Interactive preview and one-action editor activation should share the same runtime contract. | P1 |
| [Adobe Substance 3D Assets](https://www.adobe.com/products/substance3d/assets.html) | Parametric materials and curated production assets are designed for integration with Substance applications and popular third-party DCC software. | Preserve parameters, variants, resolution choices and renderer translation receipts instead of flattening every asset. | P1 |
| [Poly Haven](https://docs.polyhaven.com/en/technical-standards/models) | CC0 assets follow technical standards and expose a public API, making automated ingestion and provenance verification practical. | Build a safe open-license ingestion lane with standardized validation and hashes before accepting arbitrary uploads. | P1 |
| [Creative Fabrica](https://www.creativefabrica.com/subscription-license/) | Subscription licensing differentiates extractable standalone files, end products and rights after subscription cancellation. | Entitlements must state what remains usable in existing and new projects after cancellation, delisting or refund. | P1 |

## Current ToonSpectrum capability baseline

| Capability | Current state | Competitive assessment |
|---|---|---|
| Catalog contract | Six resource kinds, four licenses, strict bounded JSON manifests, entry and manifest digest validation; shared bounded search, tag, publisher and sort schemas | Strong correctness foundation; rights remain too flat for character and nested-asset use |
| Discovery | Search plus kind, license, tag and publisher filters; stable keyset pagination for newest and search-only relevance; cursors are bound to the complete query; invalid, duplicate and overlong URL parameters are recoverable errors and are not sent to the API | Useful deterministic discovery. `popular` is deliberately absent until authoritative install/rating metrics exist; facet counts, typo tolerance, curation, saved lists and social proof remain |
| Preview | Every previewable package entry is selectable with keyboard-operable tabs; brush, palette and filter interactions remain; templates and 3D recipes are represented; asset entries expose their real built-in/procedural manifest metadata with an honest no-preview fallback | Entry coverage is closed, but Live2D motion/expression, VRM rig/topology, avatar try-on and source-to-Studio fidelity receipts remain P0/P1 gaps |
| Studio activation | One-shot deep link, duplicate-refresh defense, local SQLite/OPFS authority for installable packs, bounded same-browser receipts, collision-safe logical package IDs and fail-closed migration of legacy release-scoped installs; unsupported or unverified compatibility blocks activation instead of guessing | The web detail distinguishes this-browser evidence from account library state. Studio confirms account installation only after an exact local install or verified existing install; cloud failure never rolls local state back |
| Compatibility | A source-controlled marketplace compatibility version and actual Canvas 2D, WebGL 2 and WebGPU adapter probes feed both the Studio panel and deep-link path; complete SemVer 2.0 precedence handles prereleases and ignores build metadata | The audited install path now fails closed for incompatible or inconclusive product context. OS/device/dependency matrices and richer conformance evidence remain |
| Rights and provenance | License, attribution, AI flag, original/permissive origin; cloned market brushes preserve `sourcePresetId` | Strong intent, but filter/palette lineage and nested derivative rights remain incomplete |
| Trust and governance | Authenticated package-scoped v3 reports retain immutable release evidence plus the locked moderation revision and absolute-head report epoch; an administrator queue exposes current package/head state; hide/restore decisions are append-only, revisioned and serialized with publish/report/library operations; owner delisting remains a separate lifecycle action | The newer-release moderation bypass is closed. Appeals, IP-specific takedown workflow, verified publishers, reviews and install-based trust signals remain |
| Release lifecycle | Strict SemVer versions form immutable, monotonically ordered release rows under a shared package lock; public and owner history expose release notes; owner delisting preserves private history and only the absolute head can be relisted; hidden packages cannot publish a successor | Major P0 lifecycle integrity gap closed. Latest-compatible selection, pinning, rollback and release support/SLA remain |
| Account library | Free current-head acquisition is stored by collision-checked `SHA-256(publisherId + NUL + packageId)` identity; active/archive views, private keyset cursors, exact catalog-head projection and account-ever Studio confirmation are separated from local installation | Cross-device account continuity now exists for free resources. It is not a paid entitlement, device inventory, team library, project assignment, bulk updater or proof that this device is currently installed |
| Binary delivery | Deliberately excludes arbitrary URIs and binary payloads | Safe but not yet a real user-created 2D/3D/VRM marketplace |
| Resilience | Abort/race protection, deduplicated cursor loading and a market-only stale cache capped at 24 entries and 24 hours; corrupt, future-dated, oversized and overlong-key entries are pruned without touching unrelated storage; Studio library and lifecycle loads abort stale generations | Browser fallback remains distinct from the durable account library. Neither cache nor account membership is mislabeled as current-device installation |
| SEO and sharing | Home, browse and detail routes set canonical, Open Graph, Twitter and JSON-LD metadata; `/market` and `/market/browse` are in the sitemap; crawler rewrites render bounded market metadata through a fixed canonical host | Core route coverage is implemented and tested locally; production crawl and social-card validation remain deployment checks |
| Publisher continuity | Detail pages link the publisher name to the existing creator profile and separately expose all market resources from that publisher; same-kind discovery is labelled honestly rather than presented as a recommendation | Useful navigation, but marketplace-specific follow, release alerts, storefront curation and saved lists remain |
| Mobile and accessibility | Mobile navigation traps focus, makes the background inert, closes with Escape and restores focus; long identifiers wrap, preview tabs support arrow/Home/End keys, loading states are announced, and license links retain a non-color underline cue | Focused fixes are covered, but this is not a claim of a complete product-wide accessibility audit |

## Delivery roadmap

### Gate A — correctness and decision confidence

- **Implemented:** shared query limits; recoverable invalid-address errors; newest and search-aware relevance contracts; bounded market cache; announced loading state; all-entry preview selection; asset recipe metadata; complete SemVer ordering; measured minimum-version/engine compatibility with fail-closed activation; focused mobile overflow, keyboard, error, empty, offline and populated-detail regression coverage.
- **Remaining:** higher-fidelity character/3D sandboxes, transformation receipts, broader browser/device conformance, and production crawl/social-card verification.

### Gate B — activation and lifecycle

- **Implemented:** immutable monotonic releases; concurrent publication, reporting, moderation and library serialization; latest-active listing; downgrade/equivalent-precedence rejection; public/private release history and release notes; owner delisting and head-only relisting; local installed/update/repair/conflict evidence; collision-safe migration of legacy release-scoped installs; account-library acquisition, archive/restore, catalog availability and exact Studio install confirmation.
- **Remaining:** latest-compatible resolution, version pinning and rollback; team libraries; recent use; bulk update; device inventory; project assignment; and commerce-grade entitlement transitions.

### Gate C — trust and discovery

- **Implemented:** transparent newest and query-scoped relevance sorting; creator-profile and publisher-catalog links; honest same-kind discovery labelling; market-specific immutable report evidence; package-scoped moderation state; append-only decisions; a current-state operator queue; hide/restore/dismiss actions; and publication/report/library race defenses. No synthetic `popular` order was added.
- **Remaining:** appeals and IP/takedown specialization; authoritative privacy-safe install counts; verified-install reviews; ratings; questions; publisher verification; saved lists; market follows and release alerts; curator collections; evidence-based similar-resource ranking; and richer zero-result recovery.

### Gate D — complete creator marketplace

- Add quarantined content-addressed 2D/3D/VRM delivery with type-specific validation, immutable digests, signed reads and Studio re-verification.
- Preserve source package, resource, entry, manifest, publisher and license lineage across clone, edit, export and import for every resource kind.
- Add project license ledgers, collaboration seat semantics, nested rights and exportable attribution manifests.
- Add creator analytics, release support obligations, takedown/appeal operations, entitlement state transitions and—only after those foundations—paid commerce.

## Explicit non-claims and next stop conditions

- A bounded local receipt can describe installation evidence for this browser, and the account library can preserve free acquisition and exact confirmed-version history across devices. Neither is a paid entitlement, device inventory, proof that another device is currently installed, or authorization for redistribution.
- Relevance is available only for a valid non-empty search. `popular`, ratings and recommendations must wait for non-inflatable, policy-defined event data rather than placeholder counters.
- Immutable release storage now has history, changelogs, owner delisting and head-only relisting, but it is not a complete release-management product. Compatible-version selection, pinning, rollback and support/SLA policy still need product surfaces and tests.
- Package-scoped moderation, immutable report evidence, operator decisions and concurrent-operation guards are implemented. Appeals, IP-specific takedown operations, verified publishers, automatic binary quarantine and production cache-revocation policy remain separate trust boundaries.
- Publisher profile/catalog links improve continuity, but saved lists, marketplace follows, creator notifications and curation are not implemented by those links.
- SEO metadata is implemented in code and covered by route/SSR tests; final confidence still requires production deployment, crawler fetch and social-card validation.

## Selected matrix and status sources

The exhaustive per-entry source inventory is maintained in `results.yaml`; the links below support the decision matrix and time-sensitive migration or beta notes.

- [Clip Studio Assets material acquisition](https://help.clip-studio.com/en-us/manual_en/630_material/How_to_download_materials_from_Assets.htm)
- [Clip Studio material auto-install and use](https://help.clip-studio.com/en-us/manual_en/630_material/How_to_use_materials.htm)
- [BlenderKit in-Blender catalog](https://www.blenderkit.com/addons)
- [BlenderKit add-on installation release](https://www.blenderkit.com/articles/release_notes_3_18_0/)
- [VRoid Hub usage-condition display](https://developer.vroid.com/en/guidelines/conditions_of_use.html)
- [VRoid Hub API overview](https://developer.vroid.com/en/api/)
- [nizima overview](https://docs.nizima.com/en/)
- [nizima Live2D preview guide](https://docs.nizima.com/guide/preview-guide/)
- [nizima Live2D upload package guide](https://docs.nizima.com/en/guide/item-upload/live2d/)
- [Godot Asset Store documentation](https://docs.godotengine.org/en/stable/community/asset_store/index.html)
- [Godot Asset Store submission and analytics](https://docs.godotengine.org/en/stable/community/asset_store/submitting_to_asset_store.html)
- [Godot Asset Store roadmap](https://store.godotengine.org/roadmap/)
- [VS Code Marketplace install and version management](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)
- [VS Code extension runtime security](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security)
- [Blender Extensions install and update](https://docs.blender.org/manual/en/5.1/editors/preferences/extensions.html)
- [Blender Extensions manifest schema](https://developer.blender.org/docs/features/extensions/schema/1.0.0/)
- [Blender Extensions listing API](https://developer.blender.org/docs/features/extensions/api_listing/v1/)
- [Blender Extensions moderation guidelines](https://developer.blender.org/docs/features/extensions/moderation/guidelines/)
- [VRChat listings and purchases](https://creators.vrchat.com/economy/listings/)
- [VRChat Avatar Marketplace](https://creators.vrchat.com/economy/store/avatar-marketplace/)
- [VRChat creator economy FAQ](https://creators.vrchat.com/economy/faq/)
- [Fab documentation](https://dev.epicgames.com/documentation/en-us/fab/fab-documentation)
- [Sketchfab status after Fab launch](https://sketchfab.com/blogs/community/sketchfab-update-what-you-need-to-know-now-that-fabs-live/)
- [KitBash3D Cargo](https://kitbash3d.com/pages/cargo)
- [Rive Marketplace](https://rive.app/docs/community/marketplace-overview)
- [Spline Community](https://docs.spline.design/sharing-collaboration-and-workspaces/community-platform)
- [Adobe Substance 3D Assets](https://www.adobe.com/products/substance3d/assets.html)
- [Poly Haven model technical standards](https://docs.polyhaven.com/en/technical-standards/models)
- [Poly Haven licensing and API FAQ](https://docs.polyhaven.com/en/faq)
- [Creative Fabrica subscription license](https://www.creativefabrica.com/subscription-license/)
