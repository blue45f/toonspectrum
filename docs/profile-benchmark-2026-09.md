# Creator profile benchmark — 2026-09

## Product goal

Turn `/u/:userId` from a passive account page into a creator identity and discovery surface without making private account data public.

## Patterns worth adopting

| Pattern | Common in | ToonSpectrum decision |
| --- | --- | --- |
| Featured portfolio | Behance, ArtStation, creator platforms | Adopt: derive up to three featured public works from engagement until explicit pinning is added. |
| Skills / specialties | Behance, LinkedIn, ArtStation | Adopt: derive specialty chips from recurring public-work tags. This avoids a new profile schema and cold-start form burden. |
| Follow + creator activity | Pixiv, Webtoon/community products | Already present: followers, works, series and follow state. |
| External links | Creator portfolio products | Defer: requires URL safety policy, moderation and account editing UX before public exposure. |
| Collaboration availability | Professional creator products | Defer: needs an explicit user-controlled state and expiration semantics; do not infer it from activity. |
| Verification | Professional/community products | Existing creator profile has verification state, but public exposure should wait for a clearly defined verification policy. |
| Public/private discovery controls | Social creator products | Defer to an explicit privacy model. Never infer consent from existing public works. |

## Privacy and safety rules

- Showcase aggregation uses only `published` public works.
- Drafts and hidden/private account fields must never be used to derive public profile signals.
- Collaboration status, location, email and external accounts are never inferred.
- Future external links must use an allow/validate/redirect policy before rendering.

## Implemented in this increment

- Deterministic featured-work ranking from public engagement.
- Specialty derivation from public work tags.
- Aggregate public views/likes for a richer creator signal.
- Unit coverage ensuring drafts cannot leak into the derived showcase.

## Follow-up candidates

1. Explicit owner-controlled featured-work pinning with fallback to derived ranking.
2. Profile editor for specialties, collaboration availability and safe links.
3. Visibility/search-index controls with conservative defaults.
4. Verified creator badge only after verification policy and appeal flow are documented.
5. Profile completeness guidance for the owner, without penalizing discovery ranking.
