# ToonStudio 에셋 인벤토리 (ASSET-INVENTORY)

작성일: 2026-09-30 · 작업 공간: `~/workspace/toonstudio-advance` (브랜치 `advancement/2026-09-29`)
기준: `apps/web/src/domains/creator/` 전체 스캔 + `material-atlas/catalog.json`

## 1. 요약

| 분류 | 위치 | 수량 | 라이선스 | 비고 |
|---|---|---|---|---|
| CC0 소재 카탈로그 (텍스처/HDRI/3D) | `domains/creator-resources/material-atlas/catalog.json` | 192 | CC0-1.0 | Poly Haven 147 + ambientCG 45. 메타데이터 한글화 진행 중 |
| CC0 포토 레퍼런스 배경 | `domains/creator/studio-2d-cc0-scene-manifest.json` | 28 | CC0 (원장 검수) | polyhaven 배경 사진, SOURCE.json provenance |
| 웹툰 배경 (자체 원본 JPG) | `domains/creator/studio-2d-asset-manifest.json` | 9 | 자체 제작물 | `webtoon-*` 9종. review 상태 포함. **손대지 않음** |
| 절차적 SVG 배경 Wave 1 | `studio-generated-2d-backgrounds-{city,genre,interiors}.ts` | 6 | 프로젝트 원본 벡터 | 벚꽃거리/테라스/작업실/복도/마법성/네온골목 |
| 절차적 SVG 배경 Wave 2 | `studio-generated-2d-wave-2.ts` | 11 | 프로젝트 원본 벡터 | 비오는 승강장/루프탑/키친/탐정사무실 등 |
| 절차적 SVG 배경 Wave 3 | `studio-generated-2d-wave-3.ts` | 8 | 프로젝트 원본 벡터 | 일러스트 스타일 환경 8종 |
| 절차적 SVG 배경 Wave 4 (신규) | `studio-generated-2d-wave-4.ts` | 8 | 프로젝트 원본 벡터 | 한국 일상 웹툰 배경 (편의점/지하철/한옥/병원/사무실/카페/PC방/시장) |
| 절차적 캐릭터/소품/가이드 | `studio-generated-2d-{characters,props,guides}.ts` + wave-2 | 14+16+8 | 프로젝트 원본 벡터 | 캐릭터 버스트, 소품, 작법 가이드 |
| 만화 FX 오버레이 | `domains/creator/studio-fx-assets.ts` | 61 | 프로젝트 원본 벡터 | 집중선/스피드선/말풍선/이펙트 |
| 2D 이펙트 텍스처 (신규) | `domains/creator/studio-generated-2d-textures.ts` | 8 | 프로젝트 원본 벡터 | 종이/수채화/필름그레인/빛샘/하프톤 등 타일 텍스처 |
| 스크린톤/톤 | `screentone/`, `studio-tones.ts`, `StudioTonePanel.tsx` | 다수 | 프로젝트 원본 | 도트/선 스크린톤 엔진 |
| 브러시 엔진 | `studio-brush*.ts`, `brush/`, `brush-lab/` | 다수 | 프로젝트 원본 | 별도 브러시 팀 담당 |
| 가상공간 캐릭터 | `virtual-space/studio-virtual-space-character-assets.ts` | 다수 | 프로젝트 원본 | 스프라이트 시스템 연동 |

**합계: 배경 61종(9+28+24+8신규), 소재 192종, FX 61종, 텍스처 8종(신규), 캐릭터/소품/가이드 38종+**

## 2. 상세

### 2.1 CC0 소재 카탈로그 (192)
- 스키마 `toonstudio.material-atlas.v1`, 최대 192개 제한 (`MAX_CATALOG_ASSETS`)
- 종류: texture 95 / hdri 49 / model 48
- 제공처: polyhaven 147 / ambientcg 45
- 모든 항목 `license: "CC0-1.0"`, 썸네일은 제공처 CDN 화이트리스트 검증 (`safeMaterialThumbnail`)
- 한글 검색: `KOREAN_TERMS` 매핑 (나무→wood/tree 등 30여 개)
- **한글화 상태**: 48개 항목 `title`이 이미 한글 (2026-09-30 기준). 나머지 144개는 `titleKo` 필드로 한글 표시명 추가 (원본 `title` 유지, `parseMaterialAsset` 무시 → 안전)

### 2.2 CC0 포토 레퍼런스 배경 (28)
- `studio-2d-cc0-scene-manifest.json` v1, 2026-09-16 검수 완료
- 각 항목: 2048×1152 webp + sha256 + SOURCE.json provenance + review
- label이 이미 한글 ("햇빛 드는 넓은 도심 거리 · CC0 포토 레퍼런스")

### 2.3 웹툰 배경 자체 원본 (9) — 수정 금지
- `webtoon-cafe/classroom/corridor/creator-room/moonlit-forest/neon-alley/palace/rooftop-sunset/street`
- `review.method: full-image`, `status: usable`, 인물/텍스트 포함 여부 명시
- 사용자의 실측 원본 자산이므로 **추가·수정하지 않음**

### 2.4 절차적 SVG 배경 (33 → 41)
- Wave 1 (6): city 2 + genre 2 + interiors 2
- Wave 2 (11): `bg-rain-platform`, `bg-rooftop-garden`, `bg-cozy-kitchen`, `bg-detective-office`, `bg-lantern-street`, `bg-orbital-hangar`, `bg-art-classroom`, `bg-royal-library`, `bg-snow-village`, `bg-sunset-canyon`, `bg-underwater-ruins`
- Wave 3 (8): 일러스트 스타일 환경
- Wave 4 (8, 신규): 한국 웹툰 일상 배경 — 편의점, 지하철 차량 내부, 한옥 마당, 병원 복도, 야근 사무실, 카페 내부, PC방, 전통시장
- 등록: `studio-generated-2d-catalog.ts` → `STUDIO_GENERATED_BG_SCENES` (V3→V2→V1→V4 순서 유지 고려)
- 테스트: `studio-generated-2d-catalog.test.ts`의 PACK_INFO 카운트 업데이트 필요

### 2.5 만화 FX 오버레이 (61)
- `FX_OVERLAYS` + `COMIC_VECTOR_STICKERS`
- 집중선/스피드선/충격/감정(땀/분노/놀람)/자연(벚꽃/불씨/빗방울)/판타지(마법진/오라) 등
- 전부 자체 완결형 standalone SVG, 외부 ref 없음

### 2.6 2D 이펙트 텍스처 (8, 신규)
- `studio-generated-2d-textures.ts`: 타일 가능한 절차적 텍스처
- 종이결 2종, 수채화 번짐 2종, 필름 그레인, 빛샘, 하프톤 도트, 그을음/빈티지
- SVG `<pattern>` 기반, `generatedElement` 카테고리 `texture`로 등록

### 2.7 스크린톤/톤
- `screentone/` 디렉토리 + `studio-tones.ts` + `StudioTonePanel.tsx` + `StudioHalftonePanel.tsx`
- 브러시 팀과 영역 분리 (본 작업에서는 텍스처만 추가)

## 3. 라이선스 준수 원칙
- 외부 에셋은 **CC0-1.0만** 허용. 출처 URL + 저작자 + 라이선스 명시 필수
- 유료/저작권 불명 에셋 무단 사용 금지
- 신규 절차적 에셋은 전부 프로젝트 원본 벡터 (외부 아트/폰트/이모지 없음)
- 사용자의 자체 원본 JPG 9종은 손대지 않음

## 4. 남은 작업 (후속)
- [ ] `titleKo`를 UI에 표시 (`MaterialAtlasPage` 등에서 `titleKo ?? title`)
- [ ] Wave 4 카탈로그 테스트 카운트 업데이트
- [ ] 텍스처를 에셋 라이브러리 UI에 노출
- [ ] CC0 카탈로그 192개 상한 도달 시 로테이션 정책
