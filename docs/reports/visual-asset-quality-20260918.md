# ToonSpectrum visual asset quality audit — 2026-09-18

## Scope

This pass treats visual quality as a product-system concern instead of blindly replacing every image or SVG. Repository-wide tracked visual files, inline SVG usage, OS-emoji catalogue rendering, production 3D thumbnails, Creator Essentials pose previews, and legacy Studio background replacement paths were reviewed together.

- tracked visual assets: **2,429** (`1,495 PNG`, `401 JPG`, `444 WebP`, `87 SVG`, `2 ICO`)
- exact duplicates: **43 groups / 90 files**; duplicates remain when paths are intentional compatibility aliases
- inline SVG: **271 occurrences / 154 files**
- SVGs missing `viewBox`: **0**
- SVGs embedding raster images: **0**
- active VRM production thumbnails at least 768px: **88 / 88**
- deep file audit: **0 unexpected extension/MIME mismatches**

## Production fixes

### 3D character and avatar catalogue

The preceding visual-quality PR re-rendered **83** previously low-resolution active VRM thumbnails from the actual source models at **768×768**, moved production references to `refined-v2`, and fixed Avatar Forge hair preview regressions including indistinguishable short/pixie and long/hime silhouettes plus residual bangs for `hair:none`.

This completion pass extends the same quality rule to the remaining catalogue surfaces:

- expression preset cards now use deterministic product-owned SVG previews derived from their actual blendshape weights instead of OS emoji;
- scene-prop cards now use product-owned vector previews rather than platform-dependent emoji glyphs;
- scene props with catalogue metadata but no matching 3D renderer are no longer shown as selectable promises;
- the audit gate fails if expression or scene-prop catalogue UI regresses to direct OS-emoji rendering.

### Character Shaper and Creator Essentials

- Character Shaper now follows the same hairless contract as Avatar Forge: `style:none` cannot retain a selected bang preset.
- All **8 Creator Essentials pose families** use a dedicated rounded vector pose renderer instead of raw low-poly triangle projection.
- Pose previews provide clearer limb hierarchy, joints, facing cues, floor contact, soft shadow, and stable card framing across 2D and 3D variants.

## GPT Image 2.5 replacement path

The repository's production image-generation catalogue targets `gpt-image-2.5-sunburst`, `quality: max`, and 2K-class output sizes. The **20 legacy Studio backgrounds** marked for replacement now have an explicit validated target mapping:

- 19 map to the existing 512-recipe background catalogue;
- 1 city-bedroom gap is supplied by `studio-2d-legacy-gpt25-extra-recipes-v1.json`;
- all 20 enforce no characters, no readable text/logos/watermarks, crop safety, and production output paths;
- `scripts/studio-2d-legacy-gpt25-replacements.test.mjs` validates the complete mapping contract.

The actual 20 generated background binaries are **not** committed in this pass: the repository generator is BYOK and no provider API key is configured in the working environment. Generation is deliberately not faked. Production 3D thumbnails also intentionally use source-of-truth WebGL renders instead of generated character art because the card must match the model the user receives.

## Intentionally retained visuals

Simple vector primitives such as speech balloons, panel frames, speed-line/effect glyphs, brand marks, and editor geometry remain SVG. Their low primitive count is intentional; replacing them with decorative raster art would reduce clarity, scalability, editability, or result fidelity.

Small 384×216 CC0 background thumbnails are retained where they are only used as compact browser cards. At roughly 2× their intended CSS display height, they are not primary-image resolution failures.

## Automated gates

`pnpm audit:visual-assets` now combines:

1. production-UI checks for active VRM thumbnail resolution and direct OS-emoji catalogue regressions;
2. full file-format checks for dimensions, duplicates, format aliases, and unexpected extension/MIME mismatches.

The audit also reports inline SVG and emoji metadata so future visual debt stays visible without treating every intentional symbol as a failure.

## Validation

- repository visual audit: **pass**
- deep asset audit: **2,427 non-ICO visual files**, **0 unexpected MIME mismatches**
- active VRM thumbnails: **88 / 88 >= 768px**
- refined-v2 VRM thumbnails: **83 × 768×768**
- GPT Image 2.5 legacy replacement mapping: **20 / 20 validated**
- focused regression suite: **4 files / 21 tests passed**
- ESLint on changed TypeScript/JavaScript files: **pass**
- Creator Essentials regeneration: **48 assets / 32 SVG / 16 GLB**
- full repository TypeScript check (`tsc -p tsconfig.json --noEmit`): **pass**
- `git diff --check`: **pass**

## Site-wide expansion pass

The follow-up pass expanded beyond VRM/hair into the complete web asset surface and public route inventory.

- tracked visual assets after source-of-truth replacements: 2,439
- active VRM thumbnails >=768px: 88/88
- referenced SVGs visually rendered into contact sheets: 80 before prop replacement
- referenced raster files below 512px on either dimension: 19; these resolve to app/PWA icons, deliberate 640x400 environment cards, responsive brand variants, or test-only fixtures rather than primary production imagery
- all-route desktop/light visual traversal: 172 registered routes
- unexpected raster MIME mismatches: 0

### Replaced during the site-wide pass

- eight Creator Essentials 3D prop cards now use 768x768 Blender renders of their actual GLB source models instead of low-detail triangle-projection SVGs: desk, chair, bench, bookshelf, streetlamp, window wall, doorway, and stairs;
- the obsolete eight `prop-*.preview.svg` assets were removed;
- hand scanner and mannequin motion-capture controls no longer depend on OS emoji glyphs;
- the VRM library guide uses the product icon system instead of a decorative OS emoji;
- the native BGM theme selector no longer prepends OS emoji to option labels;
- Major Arcana card faces and share cards now use product-owned vector motifs instead of platform-specific emoji art.

### Intentionally retained

Brand scene SVGs, comic balloons/panels, screentones, speed lines, texture motifs, PWA icons, CC0 browser thumbnails, and responsive brand raster variants were reviewed and retained. Their current representation is appropriate to their function; replacing them merely to increase primitive count or pixel dimensions would reduce fidelity or add unnecessary weight.

The all-route UX traversal also reports `route-scene-missing` on routes whose page architecture does not expose one of the audit harness' expected scene markers. That is a route/layout concern rather than evidence of a broken or low-quality image, so it is deliberately not counted as an asset-replacement defect in this pass.

### Remaining GPT Image 2.5 background set

The 20 legacy portrait webtoon backgrounds remain the only material image-quality replacement batch that requires new generative pixels. Their `gpt-image-2.5-sunburst` / `max` recipes, negative constraints, target 1152x2048 dimensions, and output mapping are committed and contract-tested. Historical `overlay.tar.gz` / split-part recovery files were inspected and are explicitly documented as corrupt forensic payloads, so they are not a valid source for production images.

### Follow-up validation evidence

- Creator Essentials source-truth prop renders: 8/8 at 768x768; embedded Blender text/time metadata stripped from committed PNGs.
- Creator Essentials inventory: 67/67 tests passed after extending preview validation to safe PNG renders.
- Character Shaper full domain regression: 44 files / 642 tests passed.
- Hand poser + mannequin + fortune focused regression: 5 files / 104 tests passed.
- Core dark/mobile route audit: 15 of 16 audited routes clean; `/production` reports only the pre-existing `route-scene-missing` architecture marker, with no image-quality or overflow issue.
- Full TypeScript check with the repository 12GB heap profile: passed.
- `audit:visual-assets`, deep strict audit, GPT Image 2.5 replacement-map contract, Creator Essentials regeneration, and `git diff --check`: passed.

## 2026-09-18 후속 tracked 정리

- 현재 `main` 재집계 기준 tracked blob은 22,859개이며, 이미지·3D·미디어 확장자 기준 실에셋은 3,938개(약 2.93GB)다. 단순 파일 수만으로 삭제하지 않고 시각 검수 원장, 런타임 참조, 라이선스, 해상도, 해시 중복을 함께 판정했다.
- GPT Image 2.5로 1152×2048 재생성·전체 프레임 검수를 완료한 20개 ID에 대응하던 627×940 레거시 JPG 20개와 동일 바이트 PNG 호환 별칭 20개를 tracked 트리에서 제거한다.
- 레거시 경로를 직접 사용하던 공용 spatial 비주얼 1건은 동일 ID의 검수 완료 GPT25 연구실 배경으로 교체한다. 교체 맵의 `legacySrc` 문자열은 이력 추적용으로만 보존하고 런타임 파일은 보존하지 않는다.
- 활성 레거시 manifest는 실제 계속 사용하는 9종만 남기며, 교체된 20종은 generated manifest를 단일 권위로 사용한다. 회귀 테스트가 40개 구형 바이너리의 재유입을 차단한다.
- 검수 완료 GPT25 배경 20종은 `studio-asset:gpt25/*` 신뢰 네임스페이스로 공식 마켓에 노출한다. 카드 미리보기뿐 아니라 실제 삽입 시 로컬 allowlist, 파일 크기, SHA-256, PNG 헤더, 디코드 해상도까지 재검증한다.
- 마켓 레코드는 `containsAi: true`, `toonspectrum-standard`, first-party provenance로 명시한다. Studio 저장 레코드도 `sourceKind: ai-generated`와 AI 배지를 유지한다.
- 완성 장면 성격이 강한 8종은 Creator Ecosystem의 “검수 완료 샘플 일러스트”로 재활용한다. 원본을 복제한 별도 파일을 만들지 않고 동일 검수 원본을 lazy-load하며, 해당 마켓 배경 검색으로 연결한다.
- CC0 대규모 묶음은 기존 23장 review sheet와 개별 curation 상태를 유지한다. assembly-component/quarantine/mobile-budget 제외 항목을 단순 수량 확대 목적으로 승격하지 않는다.

