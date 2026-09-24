# Product expansion suite — 2026-09-25

This document records the implementation boundary for the reader-retention and creator-growth work
added after the September 2026 product benchmark. It separates newly connected behavior from product
areas that already existed on `main`, so navigation and marketing do not count duplicate shells as
new functionality.

## Newly connected product journeys

| Journey | Route or surface | Authoritative behavior | Persistence boundary |
| --- | --- | --- | --- |
| Unified notifications | `/notifications`, global header bell | Release-day reminders for subscribed titles, authenticated production inbox tasks, authenticated Market package updates, and locally observed availability changes share one read/archive/snooze UI. Source notifications are regenerated from their owning systems; the inbox never invents a platform release. | Notification presentation state is browser-persisted. Production and Market source facts remain server-owned. |
| Taste onboarding | `/onboarding/taste`, `/recommend` | Genre, known-title, format, status, avoidance-tag and content-intensity inputs seed the existing recommendation engine. Avoidance only applies when the catalog contains an exact matching tag or age rating. | Browser-persisted; selected known titles also use the existing account-aware rating/read store. |
| Reading diary | `/library?tab=diary` | Date, episode, source platform, mood, note, reread and spoiler metadata can be created, edited and deleted. Reaching a known final episode marks the title complete; other recorded episodes mark it reading. | Browser-persisted. Core shelf/rating/collection state continues to use the existing account synchronization path. |
| Paused reading state | Library shelf and read-state control | `paused` is accepted end-to-end by shared types, static/API catalog parsing, `/api/me/read`, merge import, backup validation and the shelf UI. | Same account-aware persistence as other read states. |
| Public collection snapshot | Collection share action, `/lists/:slug?snapshot=…` | A bounded, versioned, Unicode-safe snapshot preserves title order and can be cloned into another user's library. The page states that later source-list edits do not update the link. | Snapshot is self-contained in the link; no claim of live server publication is made. |
| Availability history | Title detail | First visit stores an observation baseline. Later visits compare platform presence, pricing model, serialization state, episode count and schedule. Only observed differences are displayed. | Browser-persisted, explicitly labeled as device-local and non-authoritative platform history. |
| Personal content notice | Title detail | User avoidance settings are compared only with explicit catalog tags and age rating. The notice states that this is not an author-approved scene-level warning. | Derived from browser taste preferences and current catalog data. |
| Creator Growth Lab | `/studio/growth` | Creators define A/B variants, a primary metric and minimum sample, record aggregate funnel events, and receive only collecting/inconclusive/directional assessments. Directional output requires every variant to meet the sample gate and a 95% two-proportion confidence threshold. | Browser project workspace. No individual audience identity is stored or exposed. |

## Existing product areas reused instead of duplicated

The benchmark also identified creator support, fan requests/commissions, Brand Kit controls, content
provenance, IP pitching, production scheduling, external review, marketplace checkout and entitlement
work. Those surfaces already exist on `main`. This branch links reader and creator retention gaps
without adding competing top-level hubs or parallel payment/review systems.

Relevant existing routes include:

- creator support and requests: `/support-creators`, collaboration and creator-support program flows;
- production planning/review/rights: `/production/projects/:projectId/*`;
- Market acquisition, library and checkout: `/market/*`;
- Studio project, Brand Kit, provenance and publishing controls: `/studio/p/:projectId/*` and Studio
  workspace routes;
- IP proposal and creator ecosystem surfaces under collaboration/creator domains.

## Honesty and safety boundaries

1. A route is not treated as completion by itself; every new journey has an input, persisted state,
   recovery behavior and a visible result.
2. Release reminders describe the configured weekday and direct users to the provider for the actual
   publication status.
3. Availability events begin at the first observation. The UI never fabricates history before that
   point and never labels model estimates as official prices.
4. Content-intensity and avoidance filters are personal preferences, not moderation decisions or
   medical/safety guarantees.
5. Growth experiments do not auto-select a winner below the sample/confidence gates. A creator must
   make the final editorial decision.
6. Public collection links are immutable snapshots rather than live public profiles. The distinction
   is visible before cloning.
7. Private and personalized pages are `noindex,nofollow,noarchive`.

## Verification contract

- Engagement model and store unit tests cover deterministic release reminders, availability diffs,
  notification-state preservation, public-list serialization and experiment evidence gates.
- Route tests assert the three engagement routes and keep Growth Lab ahead of `/studio/*`.
- Existing `/api/me`, recommendation and library-backup tests cover compatibility with the new
  `paused` read state.
- Responsive browser validation covers the notification center, taste onboarding, diary, public-list
  failure boundary and Growth Lab at desktop and mobile widths.
