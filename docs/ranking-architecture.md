# Ranking architecture

WEBDEX ranking has two separate responsibilities:

1. Server catalog ranking: deterministic scoring over the internal title catalog.
2. Live signal correction: short-lived public ranking signals from external platforms.

The UI must never compute ranking order from `lib/data` directly. Client surfaces should call `/api/ranking` and render the returned `items`, `meta`, and `insights`.

## Runtime contract

- Route: `app/api/ranking/route.ts`
- Runtime mode: `force-dynamic`
- Cache policy: `Cache-Control: no-store, max-age=0`
- Live source adapter: `lib/server/live.ts`
- Formula source: `lib/ranking.ts`

Next 16 route-handler guidance matters here:

- Route handlers are not cached by default, but explicit `no-store` keeps intent visible.
- Server components should call server helpers directly rather than self-fetching internal APIs.
- Client components may fetch API routes when they need polling, user-controlled filters, or no-store refresh behavior.

## Ranking flow

1. Normalize query parameters.
2. Filter the server catalog by type, genre, platform, status, pricing, and minimum rating.
3. Run the transparent formula with `rankBy`.
4. For daily or weekly `popular` and `trending`, request live Naver Webtoon and Kakao Webtoon signals.
5. Match live items to local title IDs.
6. Add live boost only to matched local titles.
7. Return ranked items with evidence metadata.

Unmatched external live items do not enter the unified ranking because WEBDEX cannot show full metadata, reviews, platform routing, or detail pages for them. This protects ranking integrity.

## Reliability model

The API returns `meta.reliability` for every request.

- `confidence`: 0 to 100 interpretation score.
- `level`: `high`, `medium`, or `low`.
- `fallbackReason`: explains why the API used formula-only ranking when applicable.
- `estimatedShare`: share of ranked items whose core stats are estimated.
- `liveCoverage`: share of ranked items matched to live source signals.
- `sourceStatuses`: per-source result, fetched count, latency, and failure message.

Confidence is not another ranking factor. It is a UI disclosure layer that tells users how strongly to trust the current ordering.

## UI rules

- Always show source type: `Live API` or `Formula API`.
- Always show confidence and evidence chips near the ranking controls.
- Show row-level `LIVE #n` badges only for titles directly matched to a live source.
- Do not present a formula fallback as live data.
- If live sources fail, keep ranking usable and explain the fallback.

## Data boundaries

- `lib/data/*` is the current server catalog source.
- `lib/server/*` is the server service boundary.
- `app/api/*` is the external and client-facing data boundary.
- `components/*` must not import `TITLES` or `SEED_REVIEWS`.

If a future source becomes available, replace the server catalog boundary first. Avoid pushing raw provider-specific data into client components.

## Quality gates

Run these after ranking changes:

```bash
npm run lint
npx tsc --noEmit
npm run test
curl -s 'http://localhost:3700/api/ranking?axis=popular&period=daily&limit=3'
```

Manual UI checks:

- Desktop ranking page shows `CONFIDENCE` and `EVIDENCE`.
- Mobile ranking page has no horizontal overflow.
- Live-matched rows show `LIVE #n`.
- Console has no warnings or errors during initial render.
