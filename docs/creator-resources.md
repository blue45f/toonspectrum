# Creator research and open-content foundation

## Scope

This slice promotes the existing creator-resource domain into a canonical research desk without changing Studio document formats, gallery ownership, or production database schemas.

| Route | Implemented behavior |
| --- | --- |
| `/now` | Deterministic KST daily creator spark with 14 original scene themes, object/place/light/sound notes and a five-panel mission |
| `/research` | Canonical research desk, provider status, local workspace, source export and validated backup restore |
| `/research/assets` | Alias of the existing Met reference search with strict public-domain filtering |
| `/research/books` | Unified Open Library free-text search and openBD exact-ISBN lookup, local board save and attribution export |
| `/opportunities` | BizInfo adapter, keyword matching, eligibility text, KST date labels and all-day ICS export |
| `/about/data` | Searchable provider registry with explicit commercial-readiness classification |
| `/about/crawler` | Public crawler identity, allowed collection channels, prohibited collection and correction/removal routes |
| Legacy routes | `/creator-hub`, `/creator-hub/references`, `/discover/works` and `/insights/resources` remain available |

The homepage entry now links to the daily spark, research desk, global edition discovery, creator references and opportunities. No external source image is copied into the repository.

## Daily creator spark

`/now` rotates through 14 original ToonStudio editorial themes using the Korean calendar date. Each issue contains:

```text
scene premise
object
place
light
sound cues
five-panel exercise
mood tags
```

The page links to separately governed Met and Open Library searches but never auto-imports external media. The prompt and exercise copy are original application content; linked search results retain their own provider, source, retrieval time and usage classification.

## API contract and providers

```text
GET /api/creator-resources/providers
GET /api/creator-resources/search?provider=<provider>&q=<query>&page=<1-20>
```

Providers:

| Provider | Credential | Use in this slice |
| --- | --- | --- |
| `met` | none | Public-domain art references with safe Met image hosts |
| `openlibrary` | none | Bounded, human-facing global work and edition discovery metadata |
| `openbd` | none | Validated ISBN-10/ISBN-13 lookup for Japanese book-promotion metadata |
| `kakao` | `KAKAO_REST_API_KEY` | Kakao book-search metadata |
| `bizinfo` | `BIZINFO_API_KEY` | BizInfo support-program metadata |

Query length is 2–80 characters and the page is 1–20. Missing credentials return `not_configured`, not sample data. Invalid input is HTTP 400; per-client overload is HTTP 429. Provider outages return an explicit empty `unavailable` response.

Credentials remain server-only. They must not use a `VITE_` prefix, browser storage, committed environment files, health responses or logs.

## Open Library behavior

- Uses `https://openlibrary.org/search.json` with explicit fields and a maximum of 12 results per request.
- Sends an identifiable ToonSpectrum User-Agent linking to `/about/crawler`.
- Retains title, work key, authors, first publication year, edition count, languages, publishers and a bounded ISBN list.
- Does not import covers or book content.
- Is positioned as interactive human discovery. Bulk catalog construction must use the provider's data dumps under a separately reviewed ingestion policy.

## openBD behavior

- Calls `https://api.openbd.jp/v1/get` only for checksum-valid ISBN-10 or ISBN-13 input.
- Free-text input returns an explanatory empty result without an upstream request.
- Retains only the summary title, author, publisher, publication date, series, volume and ISBN.
- Marks records as `book-promotion`, links to the openBD terms and states that raw database resale or arbitrary alteration is not permitted by this integration.
- Does not import the returned cover URL.

## Shared content-graph contracts

`packages/core/src/content-graph.ts` introduces dependency-free contracts for later DB-backed work:

- entity, edition, serialization and adaptation types;
- source records and field/relation claims;
- provider collection mode and policy status;
- measured metrics with source and period;
- commercial readiness, monetization model and usage surface;
- per-surface rights authorization;
- research boards and research items.

`authorizeContentUsage` treats unknown rights as denied and is intended to be reused by future UI affordances and server-side import/export enforcement.

## Storage, rights and security

The current browser workspace remains local-only under `toonstudio.creator-resources.v1`: maximum 200 resources, 200 checklist IDs, 1 MB serialized workspace and 2,000 characters per story field. Version/schema validation, provider-specific HTTPS source hosts and deduplication are applied during restore.

Each saved resource carries:

```text
provider
source URL
retrieval time
license classification
credit
optional ISBN and deadline
```

Only Met records with `isPublicDomain === true`, no rights-restriction text and a safe `images.metmuseum.org` URL retain an image. Kakao, Open Library, openBD and BizInfo records are metadata/link cards.

Outbound API hosts are fixed. Redirects are rejected, credentials are omitted, requests use bounded timeouts and response bodies are limited to 2 MiB. Duplicate in-flight reads share a promise, successful responses use a five-minute bounded in-memory cache and malformed responses are not cached. Provider 429/503 responses create a bounded host cooldown.

## Public collection policy

`/about/crawler` documents the first production rule set:

```text
official API or open data
→ open standards such as OAI-PMH, SPARQL, IIIF or RSS
→ owner-provided feed
→ reviewed minimum public metadata
```

The implementation does not add authenticated crawling, age-gate or CAPTCHA bypass, chapter/page content, comments, user profiles, private APIs or mobile-app reverse engineering.

## Verification

Run the dependency-light strict checker and shared regression cases:

```sh
node scripts/check-creator-resources.mjs
```

The regression suite now covers:

- five-provider public status with no credential leakage;
- Open Library schema rejection, cache behavior, normalization and identifiable User-Agent;
- openBD checksum-valid ISBN lookup and no-network free-text behavior;
- existing Met public-domain filtering, Kakao/BizInfo credential handling, bounded fetches, workspace persistence, Markdown/ICS export and rate limiting.

Full release gates remain:

```sh
pnpm exec vitest run tests/creator-resources.test.ts tests/creator-resource-workflow.test.ts tests/creator-workspace-persistence.test.ts
pnpm typecheck
pnpm build
```

The normalized database graph, policy worker, server-synced research boards, Story Atlas, Scene Packs and Studio Research Drawer are separate follow-up slices.
