# ToonStudio Engineering Story

## Purpose

`/about/technology` is the public hub for how ToonStudio is built. It is not a dependency catalogue. It explains the product problem, engineering boundary, user value, tradeoff and inspectable evidence for each claim.

The same story is reused for:

- public product documentation;
- investor presentations;
- engineering seminars;
- study material;
- Remotion films and transcripts;
- open-source and rights review.

## Routes

| Route | Responsibility |
| --- | --- |
| `/about/technology` | summary hub, status counts and entry points |
| `/about/technology/story` | 15-chapter problem → decision → evidence narrative |
| `/about/technology/guides` | reusable implementation sequences and completion checks |
| `/about/technology/field-notes` | workers, PWA, free-first AI/infrastructure, Blender/3D, Open APIs and troubleshooting |
| `/about/technology/deck` | investor, seminar and study presentation modes |
| `/about/technology/videos` | Remotion storyboard, formats and review workflow |
| `/about/technology/licenses` | code, asset, provider and AI rights layers |

All routes are public, lazy loaded, bilingual and own a specific document title while retaining the generic `route.about` fallback.

## Status semantics

Status is part of the product claim and must not be chosen for marketing convenience.

| Status | Meaning |
| --- | --- |
| `live` | runs in the product or a verified delivery pipeline |
| `configured` | code and operating contract exist, but provider or environment setup is required |
| `experimental` | quality or compatibility is being validated and a fallback remains |
| `documented` | policy and decisions are maintained as public documentation |
| `planned` | implementation contracts and verification criteria are defined first |
| `retired` | excluded from current product scope |
| `reference-only` | optional integration that is not a source of truth |

Each chapter must contain at least one evidence path and at least two reuse steps. Evidence paths expose repository locations, never credentials or private endpoints.

## Content ownership

The typed sources of truth are:

```text
apps/web/src/domains/legal/technology/engineering-story-content.ts
apps/web/src/domains/legal/technology/engineering-field-notes-content.ts
```

The first owns chapters, implementation guides, status metadata, license families and video format identifiers. The second owns field notes, Open API adapters, troubleshooting cases, official references and reference-product adoption boundaries. Pages render from those records instead of maintaining separate claims.

When adding a chapter:

1. define the user problem before naming technology;
2. state the chosen authority and responsibility boundary;
3. document user value and a real tradeoff;
4. attach code, test, workflow or document evidence;
5. give a reuse sequence that works without ToonStudio-specific secrets;
6. select the least promotional accurate status;
7. update tests if the chapter count or video contract changes.

## Engineering field notes

`/about/technology/field-notes` captures implementation lessons that are useful beyond ToonStudio but too detailed for the 15-chapter public narrative.

It currently covers:

- task-specific Web Worker protocols, transferables, cancellation, poisoned WASM workers and main-thread commit authority;
- PWA installation, request-class cache strategies, precache manifests, controlled activation and reload-loop recovery;
- browser-local ONNX/MediaPipe contracts, exact free-model allowlists, BYOK boundaries, quota ledgers, idempotency receipts and ambiguous AI failure handling;
- static-first and scale-to-zero infrastructure, hard application budgets and manually approved immutable releases;
- an allowlisted Blender MCP facade, headless DCC pipelines and digest-bound asset packages;
- a product-owned Scene3D document with Three WebGPU/WebGL2 as the primary runtime and lazy specialist engines;
- provider-specific Open API schema, rights, provenance, host and failure gates;
- AI-assisted engineering boundaries and real troubleshooting cases written as symptom → root cause → fix → prevention.

Every field note must include:

1. an accurate status;
2. the problem and the chosen reusable pattern;
3. a product-authority boundary;
4. at least four adoption steps;
5. existing repository evidence;
6. official references with a review date.

Open API entries never equate public access with redistribution permission. Reference-product entries distinguish applied workflow patterns, specialist tools, reference-only quality bars, planned evaluations and products deliberately not adopted.

## Authentication wording

The current provider allowlist is Google, Kakao, Naver and GitHub. Toss is not described as excluded merely because it is paid. Its product scope, review process and security operating model differ from a general web OAuth adapter. Provider policy and pricing must be rechecked at implementation time.

Public examples may contain environment variable names, but never client secrets, API keys, private endpoints, user identifiers or operations credentials.

## Testifly wording

Vitest, Playwright and repository verification scripts remain the source of truth for merge decisions. Testifly may be connected as an optional, human-readable QA catalogue and feedback portal. Until a real project connection and execution record exists, label it `reference-only`, not live.

## Remotion workflow

The engineering film extends the isolated `media/brand-film` package. The website never imports Remotion.

```bash
npm --prefix media/brand-film ci
npm --prefix media/brand-film run typecheck
npm --prefix media/brand-film run studio
npm --prefix media/brand-film run render:technology -- overview
npm --prefix media/brand-film run render:technology -- investor
npm --prefix media/brand-film run render:technology -- portrait
npm --prefix media/brand-film run render:technology -- all
```

The manual `technology-story-film.yml` workflow:

1. checks out a reviewed commit;
2. installs the pinned Remotion toolchain;
3. typechecks every composition;
4. renders only the selected fixed identifier;
5. writes H.264 video, poster, Korean/English VTT, transcripts and a SHA-256 manifest;
6. uploads a 30-day review artifact;
7. never publishes, pushes or mutates `main`.

`technology-film-manifest.json` deliberately contains `reviewed: false` and `publishing: manual-after-human-review`. Distribution happens only after a person verifies captions, rights, product accuracy and output quality.

## License and rights review

Do not infer every right from npm package metadata. Track these separately:

- runtime and development code;
- WASM and static/dynamic linking structure;
- fonts, icons, images, brushes, 3D and sound;
- OAuth, cloud and other external service terms;
- AI model weights and hosted API terms;
- input references and generated output rights;
- trademark and branding conditions.

`pnpm audit:licenses` and the build-generated `THIRD_PARTY_NOTICES.generated.md` automate inventory and notice consistency. Commercial assets, copyleft combinations, external terms and AI rights still require accountable human review before release.

## Verification

The focused checks are:

```bash
pnpm exec vitest run \
  apps/web/src/domains/legal/technology/engineering-story-content.test.ts \
  apps/web/src/domains/legal/technology/engineering-field-notes-content.test.ts \
  apps/web/src/domains/legal/technology/EngineeringStoryPage.test.tsx \
  apps/web/src/app/routes/groups/about-routes.test.tsx \
  scripts/technology-story-film.test.mjs

npm --prefix media/brand-film run typecheck
pnpm typecheck
pnpm lint:quick
```

The full repository CI remains authoritative before merge.
