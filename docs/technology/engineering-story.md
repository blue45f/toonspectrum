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
| `/about/technology` | hub: talk path (1 story → 2 playbook → 3 guides → 4 field notes → 5 deck) with a one-line purpose and reading time, architecture map, status counts |
| `/about/technology/story` | why and how it was built: 31 chapters in eight themes, problem → decision → value → trade-off → evidence |
| `/about/technology/playbook` | reusable design principles and ten architecture decisions, with the benchmarks and AI workbench behind them |
| `/about/technology/guides` | step-by-step adoption: reuse blueprints (`#blueprints`), guides with steps and completion checks |
| `/about/technology/field-notes` | deep notes (workers, PWA, free-first AI/infrastructure, Blender/3D, Open APIs) and incidents and lessons (`#incidents`) |
| `/about/technology/deck` | presenter tool: 30-minute seminar talk (default), executive brief and deep lecture tracks |
| `/about/technology/videos` | Remotion storyboard, film treatments (`#film-treatments`) and review workflow |
| `/about/technology/references` | used, evaluated and inspiring technology plus reference products (`#reference-products`) |
| `/about/technology/glossary` | plain-language glossary linked to story chapters, guides and references |
| `/about/technology/licenses` | code, asset, provider and AI rights layers |

All routes are public, lazy loaded, bilingual and own a specific document title while retaining the generic `route.about` fallback. The page list, one-line purposes, menu groups (core · present · resources) and reading times live in `engineering-tech-pages.ts`; the hub, the sub-navigation and the next-page pager all render from it.

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

Supporting sources:

- `engineering-talk-deck.ts` — the 30-minute talk: sections, per-slide seconds (section budgets are sums), speaker notes and the repository evidence behind every number;
- `engineering-deck-model.ts` — one slide model for the screen, print/PDF and the offline HTML backup;
- `engineering-story-groups.ts` — the eight reading themes of the story (every chapter belongs to exactly one);
- `engineering-glossary-links.ts` — resolves glossary "read more" ids to story, guide or reference anchors.

When adding a chapter:

1. define the user problem before naming technology;
2. state the chosen authority and responsibility boundary;
3. document user value and a real tradeoff;
4. attach code, test, workflow or document evidence;
5. give a reuse sequence that works without ToonStudio-specific secrets;
6. select the least promotional accurate status;
7. update tests if the chapter count or video contract changes.

## Engineering field notes

`/about/technology/field-notes` captures implementation lessons that are useful beyond ToonStudio but too detailed for the 31-chapter public narrative.

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

The current provider allowlist is Google, Apple, Kakao, Naver and GitHub. Toss is not described as excluded merely because it is paid. Its product scope, review process and security operating model differ from a general web OAuth adapter. Provider policy and pricing must be rechecked at implementation time.

Public examples may contain environment variable names, but never client secrets, API keys, private endpoints, user identifiers or operations credentials.

## Testifly wording

Vitest, Playwright and repository verification scripts remain the source of truth for merge decisions. Testifly may be connected as an optional, human-readable QA catalogue and feedback portal. Until a real project connection and execution record exists, label it `reference-only`, not live.

## Remotion workflow

The engineering film extends the isolated `tools/media/brand-film` package. The website never imports Remotion.

```bash
npm --prefix tools/media/brand-film ci
npm --prefix tools/media/brand-film run typecheck
npm --prefix tools/media/brand-film run studio
npm --prefix tools/media/brand-film run render:technology -- overview
npm --prefix tools/media/brand-film run render:technology -- investor
npm --prefix tools/media/brand-film run render:technology -- portrait
npm --prefix tools/media/brand-film run render:technology -- all
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
  apps/web/src/domains/legal/technology \
  apps/web/src/app/routes/groups/about-routes.test.tsx \
  scripts/technology-story-film.test.mjs

npm --prefix tools/media/brand-film run typecheck
pnpm typecheck
pnpm lint:quick
```

The full repository CI remains authoritative before merge.

## 2026-09-30 변경 기록 — 세미나 대비 정보 구조 정리

- 페이지 목적을 겹치지 않게 다시 나눴습니다: 제작 스토리(왜·어떻게) → 플레이북(원칙·결정) → 적용 가이드(단계별 도입) → 심화 노트(깊은 노트·장애와 교훈) → 발표 모드(30분 슬라이드). 영상 구성안은 영상 페이지, 재사용 청사진은 가이드, 참고 제품은 참고 자료, 장애 기록은 심화 노트로 옮겼습니다.
- 발표 모드 주소는 `?track=talk#slide-3` 형식입니다. 이전 링크(`?audience=seminar&duration=30#deck=seminar:9`)도 같은 위치로 열리고 새 형식으로 바뀝니다. 발표자 창은 `?view=presenter`이며 같은 브라우저의 청중 화면과 슬라이드가 맞춰집니다.
- 단축키: ←/→·Space·PageUp/PageDown·Home/End 이동, 숫자+Enter 번호 이동, F 발표·전체 화면, N/S 노트, O 개요, B/. 블랙아웃, T 타이머, ? 도움말, Esc 닫기.
- 슬라이드의 설정 수치(방당 연결 64, 재개 창 10초, 근접 반경 160/220/200px, 허들 원격 3명, Render free·자동 배포 꺼짐, 앱 간 import 0)는 테스트가 실제 설정 파일과 대조합니다. 저장소 규모 수치(웹 테스트 파일 4,808개·E2E 49개·워크플로 97개)는 2026-09-30 git 집계값이며 자동 검증하지 않습니다.
- 한계: E2E 스펙(`e2e/engineering-seminar.spec.ts`, `e2e/engineering-story.spec.ts`)은 새 주소·단추 이름·페이지 이동에 맞춰 수정이 필요합니다. 운영 배포는 이 변경에 포함되지 않았고 `DEPLOY.md`의 별도 승인 절차를 따릅니다.
