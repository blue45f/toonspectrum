# Studio Asset Workspace Overhaul

Date: 2026-09-15
Branch: `feat/studio-asset-library-v2-20260915`
Base: PR #1427 latest HEAD `5c630dc1d329439cc25f4c4e84e3517267482250` (branch created from `e2e614020037743faa696b2094dc13aa6de2cd66`)

## Product outcome

Studio 에셋 기능을 구현 단위별 팝오버 모음에서 결과 중심의 **Asset Workspace**로 전환한다.

- 2D 배경, 장면 레시피, 스토리 연출 요소, 3D, 내 에셋을 한 검색면에서 탐색한다.
- 안전한 Studio 내장 에셋은 검토 화면 없이 바로 삽입한다.
- 권리·출처 확인이 필요한 항목만 상세 패널에서 확인한다.
- 모든 공개 항목은 원본 이미지, SVG, 장면 구성도, 실제 3D 렌더 또는 명시적인 도구 포스터 중 하나를 가진다.
- 3D 카드 썸네일은 실제 모델을 한 프레임 렌더한 뒤 WebP로 캐시하고, hover 시 해당 항목만 라이브 360° 스크럽 렌더러를 지연 로딩한다.
- 선택한 3D 항목은 OrbitControls 기반 회전·확대 미리보기를 제공한다.
- 장면 템플릿은 기존 `build()` 결과를 안전하게 요약해 실제 프레임·말풍선·텍스트·효과 구성을 SVG로 보여준다.
- 장면 레시피는 별도 탭으로 이동하지 않고 현재 페이지에 직접 적용한다.
- 카드 CTA, 더블클릭, 드래그 핸들을 각각 명확한 조작으로 제공한다.

## Information architecture

### Discover

Three responsive panes:

1. **Taxonomy and collections**
   - 전체
   - 2D 배경
   - 장면 레시피
   - 스토리 연출
   - 캐릭터·포즈
   - 소품
   - 3D
   - 내 에셋
   - 즐겨찾기
   - 최근 사용
2. **Visual result grid**
   - large or compact density
   - real preview first
   - explicit favorite, drag, and primary-action controls
3. **Selected asset detail**
   - enlarged preview
   - technical/use facts
   - placement options only when the selected source supports them
   - rights acknowledgement only for caution assets
   - primary apply/open action

### Library

기존 보관함·마켓은 제거하지 않고 Asset Workspace의 보조 보기로 유지한다. 커뮤니티 딥링크는 Workspace를 언마운트하지 않고 Library 보기로 진입한다.

### Document templates

문서 시작 템플릿은 기존 텍스트 카드 6종에서 18종으로 확장한다. 모든 템플릿은 미리보기와 새 문서 handoff가 공유하는 `composition` 계약을 가진다.

- 페이지·컷·구성 영역 수
- 출력 비율과 규격
- 편집 가능한 슬롯
- 레이어 목록
- 포함 에셋 수
- 페이지별 시각 레이아웃

카드와 상세 패널은 이 계약을 직접 렌더하므로 설명문과 실제 생성 구조가 분리되지 않는다.

## Rich preview adapter

`studio-unified-asset-preview.ts` adds a non-breaking derived contract over the existing catalog:

- `image`
- `svg`
- `scene-template`
- `three`
  - GLB
  - procedural VRM prop
  - BG3D primitive
  - BG3D scene template
- `generated-poster`

The legacy `image | svg | none` contract remains available to older panels. New UI does not expose a generic empty preview for 3D or scene recipes.

## 3D runtime policy

### Thumbnail

1. Activate near the viewport with `IntersectionObserver`.
2. Dynamically import Three.js and the owning source module.
3. Build or load the real model.
4. Fit a neutral camera and lighting rig.
5. Render one frame to WebP.
6. Cache up to 96 posters.
7. On hover, lazy-load only the hovered item and map horizontal pointer movement to a full 360° rotation.
8. Dispose the hover renderer and GPU resources immediately on leave.

### Interactive detail

- Dynamically loaded only after selection.
- Orbit rotation and zoom.
- Auto-rotation respects reduced-motion preference and can be toggled.
- ResizeObserver keeps the render size accurate.
- Failure is isolated to the preview; the original editor action remains available.

## Direct placement

- Explicit `data-studio-insert-drag-handle` is preferred.
- Legacy cards without a handle continue to use their last button.
- Text and speech bubbles keep the existing insert MIME.
- Local images and safe SVG elements/backgrounds keep the shared strict asset MIME.
- 3D keeps the catalog-bound object MIME and deterministic placement plan.
- Review-locked pages remove native dragging.
- Executable or externally-referencing SVG data fails closed through the shared parser.

## Interaction contract

| Interaction | Result |
| --- | --- |
| Single click | Select and open detail preview |
| Double click on safe asset | Immediate default use |
| Primary `+` / open CTA | Immediate use, or select rights review when needed |
| Drag handle | Place at the requested canvas location |
| `/` | Focus unified search |
| Favorite | Persist with existing v1 preference storage |
| Successful use | Record in existing recent-use storage |

## Rights and review

- `featured` and `standard` assets use the direct path.
- `caution` assets require an explicit acknowledgement in the detail pane.
- The page-level review lock remains authoritative in both UI and route handlers.
- A route returning `false` or throwing never produces a false success message.

## Content expansion gate

The workspace now combines all currently shipped generated backgrounds, legacy background sections, optional sections, authored scene templates, element catalogs, local assets, BG3D primitives, VRM props, and BG3D scene templates.

The committed quality gate reports the following baseline from the production catalog builder:

| Catalog area | Verified count |
| --- | ---: |
| Unified catalog entries | 431 |
| 2D backgrounds | 89 |
| Story elements | 143 |
| Scene recipes | 53 |
| Interactive 3D entries | 145 |
| Document templates | 18 |
| Non-tool assets with real visual preview | 100% |

`scripts/verify-studio-asset-workspace.mts` fails CI if these minimums or the preview contract regress.

New 2D background packs should be authored as **master environments plus explicit variants**, not inflated independent counts.

Recommended first production target:

| Environment family | Master target |
| --- | ---: |
| School and academy | 10 |
| Home and residential | 10 |
| Office, medical, public | 10 |
| Cafe, shop, commercial | 10 |
| Transport and urban streets | 12 |
| Nature and travel | 8 |
| Historical and traditional | 8 |
| Fantasy | 8 |
| Science fiction | 4 |
| Total | 80 |

Each master may define day/night/weather, wide/medium/close composition, foreground/midground/background layers, perspective guides, character-safe regions, line/color/tone variants. Product copy must show master and variant counts separately.

### Publication quality gate

A public asset must satisfy all applicable rules:

- visual preview exists;
- preview matches the actual inserted result;
- source and rights metadata are complete;
- 3D has a resolvable catalog source and safe runtime fallback;
- scene recipe produces a bounded valid summary;
- title, category, search keywords, and use action are present;
- performance-heavy sources remain lazy;
- all mutations are undoable by the owning Studio route.

## Regression coverage

- unified search and categories;
- direct insertion and double-click fast path;
- scene recipe visual summary and direct application;
- 3D rich source resolution, hover turntable, and interactive detail mode;
- rights acknowledgement only for caution assets;
- placement controls in selected detail;
- favorite/recent persistence;
- explicit drag handle and legacy fallback;
- safe SVG background drag and executable SVG rejection;
- lazy boundary and duplicate-menu removal;
- library deep link and AI zero-result handoff;
- 18 document templates with canonical page composition and visual navigation;
- catalog quantity and preview-quality gate.

## Deliberate compatibility decisions

- Existing catalog types are not migrated destructively.
- Existing library/market UI remains reachable.
- Existing insertion hub remains in the repository for dependent surfaces and rollback, but the production asset popover uses the new workspace.
- Existing MIME contracts and editor ownership remain unchanged.
- 3D model editing still opens the owning BG3D or VRM editor; the workspace adds discovery, real preview, and direct drag placement rather than duplicating editor controls.
