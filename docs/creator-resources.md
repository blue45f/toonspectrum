# Creator resources implementation

## Scope

Adds a Korean-first creator resource domain without changing Studio document formats, gallery ownership or database schemas. Existing gallery `/create`, challenges `/create/challenges`, catalog `/search` and `/insights` remain authoritative. The homepage gains a small hub entry below its existing content, not a replacement homepage or additional crowded global navigation items.

| Route | Implemented behavior |
| --- | --- |
| `/creator-hub` | Navigation, local workspace counts, attribution Markdown, JSON backup/validated restore |
| `/creator-hub/references` | Met search, strict public-domain filter, original links, lazy previews, saved references |
| `/opportunities` | BizInfo adapter, keyword matching within the most recent 100 entries, eligibility text, KST date labels, all-day ICS export |
| `/discover/works` | Kakao book metadata search; link to existing catalog; no automatic same-title/ISBN adaptation graph |
| `/learn/recipes` | Six original interactive exercises, 24 persisted completion steps, editable SVG frames |
| `/story-lab` | Eight-field planning worksheet, explicit local save, template logline and Markdown export; not AI generation |
| `/publishing` | 12 general preparation checks, progress and Markdown export |
| `/insights/resources` | Searchable registry of 21 source candidates and honest integration statuses; not fabricated statistics |
| `/showcase`, `/challenges` | Redirects to existing gallery and challenges, not duplicate systems |

No source image is copied into the repository. Exercises use original simple geometry. The SVG export contains editable blank panels; only spacing and final-panel-height exercises alter exported geometry. Other controls are illustrative UI experiments, not production brush/canvas settings. Opening Studio does not silently create or import a project.

## API contract and credentials

`GET /api/creator-resources/search?provider=met&q=armor&page=1`

Registered in `AppModule` through `CreatorResourcesModule` and the existing NestJS serverless entry. No competing standalone Vercel API file. Client requests use existing `apiPath`, including externally configured API origins.

Providers: `met`, `kakao`, `bizinfo`. Query: 2–80 characters. Page: 1–20. Result: `provider`, `status`, `items`, `page`, `hasMore`, `fetchedAt`, `message`. Status values: `ready`, `partial`, `not_configured`, `unavailable`. Missing credentials return explicit `not_configured`, not sample data. Invalid input is HTTP 400; per-client overload is 429. Provider outages are an explicit empty unavailable response, never generated opportunities, dates or industry statistics.

- `KAKAO_REST_API_KEY`: server-only Kakao REST API key.
- `BIZINFO_API_KEY`: server-only BizInfo issued key.
- Met: no credential required.

See `.env.creator-resources.example`. Credentials must not be prefixed `VITE_`, checked into Git, added to browser storage, or returned by health endpoints. This change does not provision new credentials, accept terms on an account owner's behalf, alter deployment secrets, or claim successful production requests.

## Verified implementation references (2026-09-06)

- Met: https://metmuseum.github.io/ — new paginated `/public/collection/v1.1/search`; `offset` and `limit`. The September 4 update deprecates the old unpaginated search for October 1. Some cached copies of the documentation still show the old endpoint. No fallback to bulk v1 searches is used. Object details use `/public/collection/v1/objects/{id}`. Only boolean `isPublicDomain === true` with a safe `images.metmuseum.org` image is displayed. API search matches are not all eligible images.
- Kakao: https://developers.kakao.com/docs/ko/daum-search/dev-guide — `/v3/search/book`, `query`, `page`, `size`, `Authorization: KakaoAK ...`. Only metadata and the provider's source URL are retained; no cover or body reproduction.
- BizInfo: https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi — `/uss/rss/bizinfoApi.do`, `crtfcKey`, `dataType=json`, `searchCnt=100`. Supports documented `jsonArray.item` and an array variant, plus relative same-host announcement links. Search scope is explicitly a recent bounded batch, not a comprehensive competition index.
- AniList: https://docs.anilist.co/guide/terms-of-use — commercial licensing, competing-service and hoarding restrictions require review before an adapter is enabled.
- Openverse: https://docs.openverse.org/ — media licensing must be checked with the original provider. Its search metadata does not by itself prove reuse rights.
- Aladin: https://www.aladin.co.kr/home/welcome.aspx — service-termination notice displayed on official site. No new Aladin dependency is introduced. Naver book search is also not introduced.

The registry separately identifies link-only sources: Culture traditional motifs, Gongu, KOCCA, K-Startup, National Library, Data4Library, KOSIS, Google Books, Open Library, AniList, TMDB, YouTube, AI Hub and unofficial APIs. They are **not** claimed as working adapters. Certification, commercial terms, source-specific rights, data validation and operational tests remain prerequisites. This implementation does not manufacture API access for them.

## Storage, rights and security

Local-only key: `toonstudio.creator-resources.v1`. Maximum 200 resources, 200 checklist IDs, 1 MB serialized workspace, 2,000 characters per story field. Version/schema validation, safe source host checks and deduplication on restore. Draft whitespace is preserved for Korean text composition. Unreadable existing data is not silently overwritten. Explicit backup restoration asks for confirmation before replacing the local board. No account synchronization or submission to external AI services.

Only HTTPS source URLs without credentials/nonstandard ports are accepted. Allowed hosts are provider specific. Third-party response HTML is never inserted with `dangerouslySetInnerHTML`. Browser previews are restricted to verified Met CC0 metadata and its image host; failure leaves a readable metadata card. Credits, original URL, license and retrieval timestamp travel with saved entries and exports. Prior checks are not a substitute for checking current rights at the original source before publication.

Outbound API addresses are fixed; user input cannot select hosts. Redirects are rejected, each request times out after 4.5 seconds and bodies are limited to 2 MiB. Detail requests run in batches of three, global in-flight limit six per instance. Raw response cache: five minutes, at most 256 entries/8 MiB; failed/malformed responses are not cached. Duplicate in-flight reads share a promise. Per-instance upstream budget 120 calls/minute; per-client 20 searches/minute with 500 active client buckets. These are **per-process safety bounds**, not a distributed billing/quota guarantee. Production should also enforce its existing edge rate limits; client IP resolution follows the current trusted-proxy setup. No provider key or upstream error URL is returned or logged by this module.

Deadline parsing accepts only complete, valid, ordered date ranges. Ambiguous, rolling or budget-exhaustion deadlines remain unknown. KST calendar days determine D-day. ICS is an all-day **reference date**, not a claim about the precise closing time; it uses an exclusive next-day end, escaped text, CRLF and 75-octet UTF-8 folding.

## Verification

Run the dependency-light strict check and the shared regression cases:

```sh
node scripts/check-creator-resources.mjs
```

It requires the repository's TypeScript dependency but not the whole Studio runtime. Identical cases are registered in Vitest:

```sh
pnpm exec vitest run tests/creator-resources.test.ts
pnpm exec eslint lib/creator-resources.ts apps/api/src/modules/creator-resources src/domains/creator-resources tests/creator-resources*.ts scripts/check-creator-resources.mjs
pnpm typecheck
pnpm build
```

The focused workflow also runs integration lint/typecheck/build separately from the pure regression job. Do not treat a syntax/transpile check or the pure job as proof of whole-repository compatibility. Live key-authenticated smoke testing and browser visual verification are separate release gates. Existing unrelated Studio changes and branch protection must not be bypassed to merge this work.
