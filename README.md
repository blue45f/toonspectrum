# ToonStudio — 기획부터 연재까지 이어지는 웹툰 제작 환경

> 아이디어부터 완성된 원고까지, 하나의 작업 흐름으로.
> **기획·2D·3D·협업·검수·내보내기**를 브라우저에서 연결하고, Spectrum 탐색·리서치 계층으로 다음 작품과 제작 근거를 찾습니다.

**ToonStudio**가 대외 주 제품이며, **Spectrum**은 작품 검색·랭킹·비교·리서치를 담당하는 내부 제품 계층입니다. 외부 플랫폼의 유료 본문이나 회차 이미지를 호스팅하지 않으며, 공개 메타데이터와 사용자가 만든 작품·리뷰·창작 리소스만 각 정책 범위에서 다룹니다.

<br/>

<p align="center">
  <img src="docs/screenshots/home.png" alt="ToonStudio 홈 — 기획부터 연재까지 이어지는 웹툰 제작 흐름" width="820" />
</p>
<p align="center">
  <img src="docs/screenshots/home-mobile.png" alt="ToonStudio 모바일 홈" width="240" />
</p>

<br/>

## 현재 저장소와 개발 기준

2026-09-26 기준 ToonStudio 저장소는 하나의 모노레포에서 Web, Admin, API, Mobile, Desktop Sync,
선택형 서비스와 Studio 핵심 패키지를 함께 관리합니다. 도메인은 `packages/domains/*`로 분리하지 않고
각 애플리케이션 안에서 논리적으로 구성합니다.

```text
apps/
  web/                 사용자·창작자용 Vite/React 애플리케이션
  admin-web/           독립 관리자 UI, 기능 이전 중
  api/                 NestJS API
  mobile/              Capacitor Android/iOS wrapper
  desktop-sync/        로컬·클라우드 양방향 동기화
services/
  creator-inference/   선택형 GPU 추론 서비스
packages/
  contracts/           Web/Admin/API가 실제로 공유하는 runtime-neutral 계약
  studio-*/            Studio 문서·명령·렌더링 focused package
tests/integration/     앱·패키지 사이 교차 경계 테스트
tools/                 제품 번들 밖의 authoring·automation·DCC 도구
openwiki/              코드 기반 탐색 문서
docs/                  현재 문서, ADR와 역사적 증거
```

- **현재 구조:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **문서 지도:** [docs/README.md](docs/README.md)
- **목표와 마이그레이션:** [docs/architecture/modular-monorepo-target.md](docs/architecture/modular-monorepo-target.md)
- **Studio 현재 경계:** [docs/architecture/studio-current-boundaries.md](docs/architecture/studio-current-boundaries.md)
- **운영·배포 권위:** [DEPLOY.md](DEPLOY.md)와 [최소 비용 배포 정책](docs/operations/minimum-cost-deployment-policy.md)
- **AI/문서 탐색:** [openwiki/quickstart.md](openwiki/quickstart.md)
- 문서 권위는 **source/tests → 기계 원장·ratchet → 현재 아키텍처 문서 → ADR → 역사 자료 → OpenWiki** 순서입니다.

## 왜 만들었나 — 기존 서비스의 빈자리

네이버·카카오·리디 등은 모두 **자기 플랫폼 안에 독자를 가두는** 워터가든입니다. 독자는 작품이 "어디서, 얼마에" 볼 수 있는지 여러 앱을 오가며 확인해야 하고, 신뢰할 만한 통합 평점·리뷰도, 웹소설 원작과 웹툰화의 연결도 한눈에 보기 어렵습니다. ToonSpectrum는 그 공백을 정확히 겨냥합니다.

### 차별화 기능 (기존 서비스 대비)

| 기능 | 네이버/카카오/리디 | ToonSpectrum |
| --- | :---: | :---: |
| 플랫폼 무관 통합 작품 DB | ✕ | ✓ |
| **크로스플랫폼 "어디서 봐" 라우터** (무료/기다무/유료 비교) | ✕ | ✓ |
| 투명 산식 다축 랭킹 (6개 축) | △ 단순 조회수 | ✓ |
| 신뢰 가능한 소셜 리뷰 + **가변 별점**(별/10점/100점) | △ | ✓ |
| 스포일러 토글 + 리뷰 태그 | ✕ | ✓ |
| **원작 ↔ 웹툰 ↔ 영상화 어댑테이션 그래프** | ✕ | ✓ |
| 통합 장르 스펙트럼 / 태그 디스커버리 | △ | ✓ |
| **취향 프로필 분석 + 추천** | ✕ | ✓ |
| **대중용 트렌드·데이터 대시보드** | ✕ | ✓ |

자세한 경쟁 분석은 [`docs/competitor-analysis.md`](docs/competitor-analysis.md) 참고.

<br/>

## 핵심 화면

- **홈** `/` — 에디토리얼 히어로, 실시간 인기 랭킹, 장르 스펙트럼, 어댑테이션 스포트라이트, 큐레이션 레일
- **통합 검색** `/search` — 질의 + 패싯 필터(유형·장르·상태·플랫폼·평점·이용가·무료) + 정렬 + 그리드/리스트
- **통합 랭킹** `/ranking` — 인기·급상승·평점·정주행 몰입·완결·신작 **6개 축**, 기간(일/주/월/전체), **순위 산식 투명 공개**
- **탐색** `/explore` — 18개 장르 색상 스펙트럼 + 태그 클라우드로 떠나는 발견
- **연재 캘린더** `/calendar` — 연재요일 메타데이터 기준 요일별 보드 + **표시할 플랫폼 멀티셀렉트 필터**(원하는 플랫폼만 골라 보기)
- **작품 상세** `/title/[slug]` — "어디서 봐" 라우터, 평점 분포·정주행 지표, 어댑테이션 그래프, 리뷰, 비슷한 작품
- **리뷰 피드** `/reviews` — Letterboxd 감성의 한 줄 리뷰 피드 (스포일러 블러·공감·정렬)
- **인사이트** `/insights` — 장르·플랫폼·연도·평점·가격·어댑테이션을 시각화한 트렌드 대시보드
- **내 서재** `/library` — 관심/평가/완독 관리, **취향 분석**, 맞춤 추천, 컬렉션
- **창작 스튜디오** `/studio` — 멀티페이지 컷·말풍선·표준 3D 파일/VRM·최대 64개 샷 보드와 컷별 LT Worker 합성 PNG 일괄 렌더·권한 검증형 IndexedDB 원자 복구·공개 manifest v3 Worker ZIP 패키징·
  시간대 무드 리그·가림 관계 인지 선화·의미 재질 분석·로컬 사진 포즈 스캔·시각적 관절/손목 IK·결정론적 물리 배치·분석적 IK·
  벡터/래스터 소재·기본 G펜과 영속 즐겨찾기를 포함한 226종 브러시 카탈로그·VRM `baseColor` 표면 직접 페인팅·UV 아일랜드 Worker precompute·
  SHA-256 PNG 무결성 저장/재편집과 기기 간 portable archive·WebGPU dirty-rect 부분 업로드 준비 계층·Studio 전용 COOP/COEP 격리·
  AI 제작 보조·검토·
  복구·Publish Package와 역할 기반 팀 초대·CRC 검증 바이너리 CRDT 동시 편집·화면 공유·기본 비활성인 선택형
  최대 6인 P2P 음성 작업실과 단기 TURN 자격증명·자동 ICE 재협상·
  공유 원본·revision 충돌 방지를 합친 모바일 대응 올인원
  제작실. 컷툰/업로드 작품 형식을 보존한 채 팀 작업 목록에서 바로 전환하며, 상세 벤치마크와 구현 현황은
  [`docs/studio-competitor-features.md`](docs/studio-competitor-features.md)와
  [`docs/studio-3d-webtoon-tool-benchmark-2026-07-19.md`](docs/studio-3d-webtoon-tool-benchmark-2026-07-19.md),
  [2026-07-27 코드 기반 997행 갭 재감사](docs/studio-feature-gap-audit-2026-07-27.md) 참고
- **웹툰 제작·협업 운영** `/production` — Project Brief부터 StoryLock, Story→Art 인수인계, creative branch/merge, 역할별 검수, 발주·계약·마일스톤·권리·크레딧·지급 검증까지 한 정본으로 관리. 외부 연동은 ICS·mailto·Web Push·Google Workspace 최소 scope·자가호스팅 서명·테스트 결제를 무료 우선 정책으로 제공하며 자세한 설정은 [`docs/production-external-integrations.md`](docs/production-external-integrations.md) 참고
- **창작 마켓** `/market` — 스튜디오 커뮤니티 마켓플레이스의 공개 발견 표면. 브러시·필터·팔레트·템플릿·3D 프리셋·3D 에셋·에셋 7종 카테고리(클립스튜디오 ASSETS 스타일의 3D 에셋·소품·모델 거래 및 공유 지원), URL 파라미터 필터(검색·종류·라이선스·태그·배급자)와 커서 페이지네이션 탐색, 라이선스·출처·AI 사용 여부가 명시된 리소스 상세, `/studio?assetMarket=community` 딥링크로 스튜디오 자산 메뉴 커뮤니티 탭 즉시 진입. 전 리소스 무료 공유
- **2D → 3D 변환** `/studio/lift3d` — 캐릭터·소품·배경 원화 한 장을 실루엣 거리장(캐릭터·소품)과 명암 부조(배경)로 읽어 3D 모델로 세우는 스튜디오 도구. 브라우저 안에서만 계산하고(업로드·외부 추론 호출 없음), 결과는 이 앱 자신의 모델 가져오기 게이트를 통과하는 텍스처 GLB 로 나가 배경 3D 씬에 그대로 들어간다. 설계는 [`docs/studio-2d-to-3d-lift.md`](docs/studio-2d-to-3d-lift.md) 참고
- **캐릭터 셰이퍼** `/studio/character` — 프리셋 카드 15슬롯(얼굴형·눈·눈동자·코·입·귀·헤어·체형·상의·하의·신발·액세서리·표정·포즈·손 포즈)로 3D 캐릭터를 세우는 작업실. 카드 한 번이 곧 되돌리기 한 단계이고, 모델이 지원하지 않는 항목은 이유를 적어 두고 몰래 바꿔치기하지 않는다. 참고 이미지 추천·팔레트 추출·사진/웹캠 포즈는 전부 기기 안에서 처리하고, 결과는 투명 배경 PNG 또는 밑색·음영·하이라이트·주선이 나뉜 레이어 PSD 로 나간다. 사용법은 [`docs/studio/character-shaper.md`](docs/studio/character-shaper.md), 소개는 `/shaper`
- **⌘K 커맨드 팔레트** — 어디서든 통합 검색

<br/>

## 디자인 — "활자와 스펙트럼 (Type & Spectrum)"

따뜻한 잉크-블랙 위의 에디토리얼 다크. 디자인 시스템은 `impeccable` 스킬로 확립했습니다.

- **컬러**: OKLCH 토큰. 따뜻하게 틴트된 중립 + persimmon(감/주홍) 시그니처 악센트 + 18개 장르를 색상환에 매핑한 **장르 스펙트럼**
- **타이포**: 데이터/인덱스는 grotesque(Space Grotesk), 한국어 UI는 Pretendard, 문학적 순간은 serif(Nanum Myeongjo)
- **시그니처**: 인덱스 넘버럴, 스펙트럼 바, 타이포그래픽 커버(이미지 없이 활자 포스터), 어댑테이션 그래프
- 토큰·컴포넌트 규약은 [`DESIGN.md`](DESIGN.md), 제품 정의는 [`PRODUCT.md`](PRODUCT.md) 참고

<br/>

## 기술 스택

- **Vite 8** · **React 19** · **React Router 7** · **TypeScript**
- **NestJS API** — 카탈로그·랭킹·커뮤니티·내 서재·인증 엔드포인트
- **Tailwind CSS v4** (CSS-first `@theme` 토큰)
- **Zustand** (+ `localStorage` 영속화) — 평점·리뷰·북마크·취향·컬렉션
- **Motion** — 마이크로 인터랙션 · 스크롤 리빌
- 검색·랭킹·추천·취향분석 로직은 의존성 없는 순수 TypeScript (`lib/`)

## 라이브러리 (용도별)

`package.json` 기준 주요 의존성과 한 줄 용도입니다.

| 라이브러리 | 용도 |
| --- | --- |
| `drizzle-orm` + `pg` (node-postgres) | DB/ORM — PostgreSQL(로컬 docker / Neon 원격) 접근 (`DATABASE_URL`) |
| `react` · `react-dom` | UI 런타임 (React 19, React Compiler 활성) |
| `react-router-dom` | 라우팅 — React Router 7 SPA 라우트 |
| `zustand` | 상태 관리 — 평점·리뷰·북마크·취향·컬렉션 (localStorage 영속화) |
| `react-hook-form` + `@hookform/resolvers` + `zod` | 다중 필드 폼 — 관리자 플랜/캠페인·로그인/가입·리뷰 작성 폼의 상태·검증(`useForm` + `zodResolver`, 폼별 co-located 스키마) |
| `cmdk` | 커맨드 팔레트 — ⌘K 통합 검색 UI |
| `motion` | 애니메이션 — 마이크로 인터랙션·스크롤 리빌 |
| `lucide-react` | 아이콘 셋 |
| `tailwindcss` + `@tailwindcss/postcss` | 스타일 — Tailwind CSS v4 (CSS-first `@theme`) |
| `clsx` + `tailwind-merge` | 클래스 합성·중복 제거 (`cn` 유틸) |
| `vite` + `@vitejs/plugin-react` | 빌드/개발 서버 (Vite 8) |
| `babel-plugin-react-compiler` + `@rolldown/plugin-babel` | React Compiler — 자동 메모이제이션 |
| `drizzle-kit` | DB 마이그레이션·스키마 도구 |
| `typescript` · `eslint` · `typescript-eslint` | 타입 검사·린트 |
| `vitest` | 단위 테스트 |

### Studio 하이브리드 엔진 정책

Studio는 하나의 캔버스 라이브러리에 모든 책임을 몰지 않습니다. 문서·명령·히스토리·협업은
renderer-neutral canonical 모델을 권위로 두고, 아래 엔진을 교체 가능한 provider로 조합합니다.
번들 바이트와 정적 요청 수는 관찰 지표일 뿐 릴리스 차단 조건이 아니며, 픽셀 품질·입력 지연·색
정확도·대형 문서 안정성·기능 확장성을 우선합니다.

| 엔진 / 라이브러리 | Studio 역할 |
| --- | --- |
| Raw WebGPU / WGSL | RGBA16F 브러시 타일, 레이어 합성, 필터, readback·device-loss replay의 기본 픽셀 권위 |
| `canvaskit-wasm` (Skia) | 정밀 벡터·패스·텍스트·PDF/출판 렌더링 및 CPU/GPU 품질 기준 |
| `pixi.js` | 별도 투명 surface의 GPU scene graph, z-order, 선택·hover·custom hit-area와 transform overlay |
| `konva` + `react-konva` | 오브젝트·텍스트·말풍선의 선택/변형/히트테스트 overlay — 문서나 브러시 픽셀 권위는 맡지 않음 |
| `paper` + `polygon-clipping` | Bézier 교차·스무딩·단순화·부울·경로 기하 계산(화면 renderer가 아닌 동적 격리 vector geometry provider) |
| Vello 0.10 Classic + `vello_hybrid` 0.2 | 같은 StudioGpuFabric `GPUDevice`를 채택하는 명시 선택형 벡터 provider. Classic과 실제 sparse-strip Hybrid는 별도 backend이며, 지원하지 않는 text·mask·filter 조합은 GPU 제출 전에 fail-closed되고 다른 엔진으로 자동 재시도하지 않음 |
| `@thorvg/webcanvas` 1.1.2 | Vello strict SVG subset 밖의 안전한 filter·mask·text 및 Lottie를 위한 lazy 전문 provider. SVG/Lottie 보안·크기 감사를 먼저 통과하고 WebGPU/WebGL/software 중 하나를 작업 전에 고정하며, 문서 권위나 자동 폴백을 갖지 않음 |
| `perfect-freehand` | 필압을 가진 centerline을 연속 잉크 outline으로 변환하는 실시간 geometry provider — 합성·질감·히스토리는 맡지 않음 |
| `lazy-brush` | 정밀 모드에서만 선택하는 입력 leash/손떨림 보정 — 기본 펜 입력에는 지연을 추가하지 않으며 예측 포인트가 상태를 오염시키지 않음 |
| `roughjs` | 문서에 저장한 seed로 결정적으로 재생하는 손그림 도형 renderer — 자유곡선 브러시 권위는 맡지 않음 |
| `p5.brush` | 검증된 `2.2.1-adapter.3` 어댑터가 전용 Worker의 private OffscreenCanvas WebGL2에서 flow-field·hatch·mass·수채 채움·플랫 워시를 처리하는 격리된 settled-only 예술 브러시 provider — 합성 채움은 별도 메모리 예산을 적용하고 image/custom tip은 실제 어댑터 검증 전까지 fail-closed |
| `rbush` | 대형 2D 문서의 동적 공간 인덱스, point/area hit-test와 topmost 후보 탐색 |
| `harfbuzzjs` | 한글·복합문자·세로쓰기·루비·OpenType/가변 글꼴의 renderer-neutral glyph shaping |
| `@resvg/resvg-wasm` | 제한·정규화된 SVG 가져오기, 미리보기, 결정적 래스터/PNG 출력 |
| `@techstark/opencv-js` | Worker 전용 선택 마스크, morphology, contour/edge, perspective, 영상 처리 provider |
| `onnxruntime-web` | WebGPU/WASM 로컬 AI 추론 — 선택·세그멘테이션·포즈·채색/작화 보조의 서버비 절감 경로 |
| Studio wet-ink binary codec | 물·이동 안료·젖음·고정 얼룩·종이 상태를 보존해 저장 후에도 동일한 물리 시뮬레이션을 재개 |
| `three` + R3F/Drei + `three-mesh-bvh` | 3D 배경/캐릭터와 raycast·surface snap·라쏘·표면 페인팅 가속 |
| `@gltf-transform/*` | GLB/glTF 읽기·정규화·확장·애니메이션·재질·압축·내보내기 파이프라인 |
| `manifold-3d` | 위상적으로 안정적인 3D 부울·절단·단면·CAD형 메시 편집 |
| `xatlasjs` | 단일 전용 Worker 안에서 직접 실행하는 자동 UV 언랩·패킹 WASM, 표면 페인팅/베이크용 atlas와 명시적 해제 |
| `@dimforge/rapier3d-deterministic-compat` | 결정적 3D 물리·충돌·배경 이펙트 시뮬레이션 |
| Studio hybrid textured-vector ink | 편집 가능한 centerline/outline과 R8 브러시 팁·종이 질감, 변형 후 결정적 재샘플링 |
| Studio corrective-driver graph | 뼈 회전·표정·사용자 scalar를 다중 보정 변형에 연결하고 충돌·미리보기·결정적 bake 관리 |
| Studio weighted-deformation oracle + Worker | point·curve·envelope를 정규화 거리 가중치로 혼합해 2D/3D 위치와 UV를 보존하며, 큰 작업은 transfer·취소·timeout·epoch를 갖춘 전용 Worker에서 fail-closed 실행 |
| Studio live-surface effects | 같은 레이어/별도 height map의 서브픽셀 변위와 단일 방향·점 조명을 비파괴 recipe로 재생 |
| Studio multi-light surface oracle + Worker | signed height·roughness·metalness·normal map에 방향·점·스폿 광원, 감쇠·Fresnel·에너지 분할 specular를 결정적으로 합성하고 전용 Worker에서 transfer·취소·timeout·epoch를 fail-closed 처리 |
| Studio spectral pigment mixing | 400–700nm 반사율을 Kubelka–Munk K/S와 유한 두께 two-flux 층으로 혼합하고 CIE 관찰자 근사를 거쳐 scene-linear 색으로 변환 |
| Studio signed impasto height | add·excavate·erase·flatten과 종이/팁 질감, 압력·속도, 보존형 plow를 signed height·색·roughness 채널에 결정적으로 기록 |
| Studio individual-fiber bristle oracle + Worker | seeded 섬유별 강성·splay·bend·종이 접촉·안료 잔량·pickup을 고정 arc-length station으로 계산하고 append/rebuild를 동일 replay로 보존하며 전용 Worker 경계에서 입력·출력 소유권과 취소·복구를 강제 |
| Studio out-of-core export | BigInt/decimal 좌표, lazy row/Morton 타일, exact halo crop, resume 무결성 재검증과 메모리 backpressure로 브라우저 캔버스·상주 메모리보다 큰 원고를 renderer/sink 독립적으로 출고 |
| Studio physics-particle brush oracle + Worker | generic orbital·flow·spring-net 입자를 fixed arc/timestep으로 재생하고 flow field·smoothed chaos·pressure/speed/tilt expression과 exact append/rebuild를 보존하며 전용 Worker에서 모든 실패를 hard terminate·cold restart |
| Studio procedural media-surface oracle + Worker | 독점 종이 스캔 없이 seeded relief·fiber·weave·pore를 생성하고 height·absorbency·grain·flow를 전역 좌표로 평가해 full-frame과 tile+halo 결과를 동일하게 유지하며 전용 Worker에서 typed-array transfer·취소·복구 |

새 후보는 라이선스·공급망, lazy/Worker 격리, 취소·예산·복구 receipt, 실제 브라우저 품질 게이트를
통과한 뒤 같은 provider 계약 아래 승격합니다. Vello와 ThorVG도 검증된 bounded island만 제품에
연결하며, 지원 범위를 벗어나거나 선택한 backend가 실패하면 다른 엔진으로 자동 전환하지 않습니다.
과거 Vello PoC 실측과 한계는
[`studio-vello-observed-poc.ts`](apps/web/src/domains/creator/render/studio-vello-observed-poc.ts)에 고정합니다.
더 나은 결과가 모든 hard gate에서 확인되면 기존 provider를 교체합니다.
Signature Pad·Atrament·Croquis는 필기 품질 비교용 benchmark oracle일 뿐 런타임 의존성이 아니며,
Fabric.js는 Konva와 장면 모델이 중복되어 제품 런타임 도입 대상에서 제외합니다.
위 표는 provider의 계산·소유권 경계를 설명하며 곧바로 Studio UI 연결 완료를 뜻하지 않습니다.
실제 기능 완료는 선택 UI부터 live/commit, Undo, 저장·재열기, 협업, 내보내기와 실브라우저 검증이
한 수직 경로로 닫힌 경우에만 판정합니다.
상용 기능의 공식 근거, clean-room 독립 구현 경계, 현재 단계와 다음 승격 순서는
[`docs/studio-commercial-clean-room-radar-2026-07-28.md`](docs/studio-commercial-clean-room-radar-2026-07-28.md)에서
지속해서 관리합니다.
이번 provider 파동에서 추가한 제3자 패키지의 정확한 버전·라이선스·원본 저장소는
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)에 별도로 기록합니다.

> 참고: 클라이언트 검색은 입력마다 `/api/search` 네트워크 요청으로 동작합니다. `useDeferredValue`는 네트워크 호출을 디바운스하지 않으므로(메모리 내 파생 렌더만 지연) 검색/팔레트에는 적용하지 않습니다.

## 실데이터 수집과 수동 스냅샷 갱신

작품 데이터의 운영 소스는 검토 후 커밋된 `apps/api/data/catalog.json.gz`입니다. 빌드 시
`pnpm catalog:gen`이 이 파일을 `apps/web/public/data/*.json`으로 변환하고, 정적 호스팅/CDN이
사용자에게 제공합니다. Nest API도 같은 gz 파일을 **부팅 시 한 번만** 읽습니다.

배포된 서비스에는 크롤러 실행, 주기 스케줄러, 카탈로그 쓰기·폴링, 강제 새로고침 API,
관리자 크롤 버튼, DB 카탈로그 스냅샷·실행 이력이 없습니다. 데이터 갱신은 운영자가 로컬에서
명시적으로 실행하고 변경 내용을 검토한 뒤 커밋·재배포할 때만 반영됩니다.

```bash
# 원시 수집 결과만 확인(파일을 수정하지 않음)
pnpm --silent catalog:crawl:manual > /tmp/toonspectrum-catalog.json

# 수집 → 기존 카탈로그와 안전 병합 → 정적 산출물 재생성
pnpm catalog:update:manual

# 작품별 관련 정보도 필요할 때만 수동 갱신
pnpm related:update:manual

# 이미 갱신된 catalog.json.gz로 정적 산출물만 다시 생성
pnpm catalog:gen

# 선택: 공식 KMAS 응답을 기존 카탈로그에 병합
KMAS_PRV_KEY=... pnpm kmas:update-catalog
```

수동 갱신 후에는 `git diff --stat`, 작품 수, 플랫폼별 건수와 샘플 상세를 확인하고 예상치 못한
감소·빈 필드·차단 응답이 없는 경우에만 커밋합니다. 실행 전에 대상 플랫폼의 robots.txt,
이용약관, API 정책, 호출량 제한과 저장 가능한 필드를 다시 확인해야 합니다.

- **웹툰·웹소설 수집기**: `scripts/crawl.mjs`와 `scripts/crawlers/*.mjs`에 19개 공개 카탈로그
  소스가 구현되어 있습니다. `WEBDEX_SOURCE_IDS`와 플랫폼별 cap·delay 환경변수는 로컬 수동
  실행에서만 읽으며 배포 런타임에서는 사용하지 않습니다.
- **부분 실패 방어**: `scripts/merge-catalog.mjs`는 새 결과를 기존 스냅샷에 upsert하고 이번 실행에서
  빠진 작품을 유지해, 특정 플랫폼 차단이 전체 카탈로그 급감으로 이어지지 않게 합니다.
- **런타임 외부 수집 없음**: 검색·탐색·랭킹은 커밋된 스냅샷만 사용합니다. 랭킹은 같은 카탈로그에
  대한 결정적 산식으로 계산하며 요청 시 외부 플랫폼을 조회하지 않습니다.
- **KMAS 보강**: `KMAS_PRV_KEY`가 설정된 서버는 공식 Open API를 통한 선택적 메타데이터 보강을
  지원합니다. 인증키는 서버 secret store에만 두며, 이미지 바이너리는 저장하지 않습니다.
- **표지 썸네일**: 허용된 원격 이미지 URL만 `/api/cover` 정책 경계를 통과시키며 19+ 표지는 항상
  비노출합니다. 공개되지 않는 보조 지표는 추정값으로 표시합니다.
- **조건부 소스**: 코미코처럼 지역 제한이 있는 소스는 적절한 네트워크 환경에서 수동 실행할 때만
  결과가 채워집니다. 실패한 소스를 자동 재시도하거나 운영 서버에서 대신 수집하지 않습니다.

전체 흐름은 [`docs/data-pipeline.md`](docs/data-pipeline.md), 랭킹·데이터 경계는
[`docs/ranking-architecture.md`](docs/ranking-architecture.md), 법적·운영 체크리스트는
[`docs/COMPLIANCE.md`](docs/COMPLIANCE.md)를 참고하세요.

## 실행

```bash
pnpm install
pnpm dev                    # 사용자 웹: http://localhost:5173
pnpm dev:api                # API: http://127.0.0.1:4001
pnpm dev:all                # 사용자 웹 + API
pnpm dev:admin              # 관리자 UI: http://localhost:4174
pnpm typecheck:admin
pnpm build:admin            # apps/admin-web/dist/
pnpm validate:architecture  # 구조 + source-layout + application boundary ratchet
pnpm build && pnpm start    # 사용자 웹 프로덕션 프리뷰
```

### Studio 3D 에셋 배치 업로드

`toonstudio` 쪽 3D 배경/캐릭터/소품을 `manifest`로 묶어 운영 API에 업로드하려면
[`docs/studio-asset-upload-automation.md`](docs/studio-asset-upload-automation.md)를 그대로 따라오면 됩니다.

현재 기본 절차는 **로컬 생성·검증·dry-run까지만 자동화**합니다. 저장소의 현재 운영 정책은 자동 배포를 금지하므로 `--auto-deploy`를 사용하지 않습니다. 운영 업로드와 Cloudflare/Render 배포는 각각 명시적 승인을 받은 뒤 별도 수행합니다.

```bash
pnpm run studio:toolchain:setup -- --check
pnpm run studio:manifest:generate -- --source-dir ./batch_source --output batch_generated/manifest.json
pnpm run studio:batch -- --source-dir ./batch_source --output batch_generated/manifest.json -- --dry-run --max-items 20
pnpm run studio:upload-assets:dry-run -- --manifest batch_generated/manifest.json --max-items 20
```

실제 운영 반영 전에는 [Studio 에셋 업로드 문서](docs/studio-asset-upload-automation.md)와 [DEPLOY.md](DEPLOY.md)의 수동 승인 정책을 함께 확인합니다. `studio:asset:release`의 과거 `--auto-deploy` 옵션은 호환 목적으로 코드에 남아 있을 수 있으나 현재 승인된 운영 경로가 아닙니다.

### DB 준비 (PostgreSQL / Neon)

DB는 **PostgreSQL**입니다 — 로컬은 docker, 원격·배포는 **Neon**(서버리스 Postgres). `DATABASE_URL`은 필수이며, Studio 다중 인스턴스와 SQL migration에는 transaction pooler가 아닌 `STUDIO_LIVE_POSTGRES_URL` direct endpoint도 필요합니다. 개발/빈 DB는 스키마를 push한 뒤 historical SQL(0001~0019)을 한 번 적용하고, 구조 증명에 성공한 history를 checksum 원장에 채택하면서 genuine pending(0020~0022, 0024~0025)을 적용한 다음 카탈로그를 적재하세요. `0023`부터 배포 원장은 이미 적용한 migration을 다시 실행하지 않으며, 파일 변경·중단 상태·중간 번호 누락을 fail-closed로 처리합니다. 필요한 capability가 빠진 프로세스는 요청 중 DDL을 실행하지 않고 readiness/부팅 단계에서 실패합니다.

**A. 로컬 docker Postgres**

```bash
docker run -d --name wd-pg \
  -e POSTGRES_USER=webdex -e POSTGRES_PASSWORD=webdex -e POSTGRES_DB=webdex \
  -p 55432:5432 postgres:16-alpine
export DATABASE_URL='postgresql://webdex:webdex@127.0.0.1:55432/webdex'
export STUDIO_LIVE_POSTGRES_URL="$DATABASE_URL"
```

**B. 원격 Neon** — `.env.local`에 연결 문자열만 넣으면 크롤·ingest·API가 모두 원격을 사용합니다.

```bash
# .env.local (gitignore됨): 앱 일반 쿼리는 pooler, realtime migration/adapter는 direct endpoint
# secretlint-disable-next-line @secretlint/secretlint-rule-database-connection-string -- placeholder Neon connection template
echo 'DATABASE_URL="postgresql://<user>:<pw>@<host>-pooler.<region>.aws.neon.tech/<db>?sslmode=verify-full"' >> .env.local
# secretlint-disable-next-line @secretlint/secretlint-rule-database-connection-string -- placeholder Neon connection template
echo 'STUDIO_LIVE_POSTGRES_URL="postgresql://<user>:<pw>@<direct-host>.<region>.aws.neon.tech/<db>?sslmode=verify-full"' >> .env.local
set -a; source .env.local; set +a
```

**C. 선택한 완전한 빈 로컬 DB 최초 provision** — 아래 `drizzle-kit push`는 public table이 없는
DB에 처음 한 번만 실행합니다. Drizzle 0.31.x의 반복 push는 FK/unique 재정렬 오류가 있으므로 이미
provision된 DB의 upgrade나 운영 rolling migration에 사용하지 않습니다. migration runner는
`scripts/production-database-migrations.manifest`가 모든 numbered SQL 파일을 정확히 한 번씩
0001부터 번호 누락 없이 정렬해 포함하는지 검사합니다. 최초 `adopt`는 0019까지의 relation,
constraint/index, comment re-anchor, AI gate/receipt, 0017 cutover marker를 먼저 증명한 뒤 해당
checksum을 `adopted`로 기록하며 과거 migration을 재실행하지 않습니다.

수동 DDL 대신 fail-closed bootstrap 명령 하나를 사용합니다. 먼저 `--plan`은 읽기 전용으로
대상 DB, 다른 연결, 기존 application object, migrator/runtime 역할 분리, manifest와 schema
fingerprint를 검사합니다. URL과 비밀번호는 출력하지 않습니다.

```bash
release_sha="$(git rev-parse HEAD)"
MIGRATION_DATABASE_URL="$STUDIO_LIVE_POSTGRES_URL" \
  pnpm db:bootstrap:production-empty -- \
    --plan \
    --allow-loopback \
    --runtime-database-role webdex_runtime \
    --release-sha "$release_sha"
```

계획이 빈 DB임을 확인한 뒤 실행합니다. runtime role이 아직 없을 때만 별도 runtime 연결에
사용할 24자 이상의 비밀번호를 환경변수로 제공합니다. 명령은 `pg_trgm`, 현재 Drizzle base,
reviewed 0001~0019 구조, checksum adoption, 실제 0020~0022/0024~0025 forward migration, runtime 최소
권한, idempotent apply와 전체 capability verifier를 순서대로 수행합니다.

```bash
MIGRATION_DATABASE_URL="$STUDIO_LIVE_POSTGRES_URL" \
BOOTSTRAP_RUNTIME_DATABASE_PASSWORD='<runtime-role-secret-if-missing>' \
  pnpm db:bootstrap:production-empty -- \
    --execute \
    --allow-loopback \
    --runtime-database-role webdex_runtime \
    --release-sha "$release_sha" \
    --confirmation BOOTSTRAP-EMPTY-TOONSPECTRUM-DATABASE
```

대상에 application object가 하나라도 있으면 실행은 거부됩니다. 백업과 대상 DB 확인을 마친
**폐기 가능한 DB**만 계획 출력에 표시된 DB명 결합 토큰을 별도로 추가해 초기화할 수 있습니다.
예: `--reset-confirmation RESET-AND-BOOTSTRAP-TOONSPECTRUM-DATABASE:webdex`. 이 승인은
`public`과 `toonspectrum_ops` application schema의 모든 데이터를 삭제하며 다른 DB 이름에는
재사용할 수 없습니다. 실행 중 schema/migration 소스가 바뀌거나 다른 client가 연결되면 즉시
중단되고, 부분 상태를 자동 채택하지 않습니다.

`--execute`는 사전 점검 뒤 runtime role을 대상 DB에 한정해 일시적으로 `NOLOGIN`으로
전환하고, 전환 직후 다른 client가 끼어들지 않았는지 다시 확인한 다음에만 DDL을 시작합니다.
따라서 `PUBLIC`의 기본 `CONNECT` 권한이 남아 있어도 새 runtime writer는 들어올 수 없습니다.
정상 완료와 포착 가능한 실패에서는 `finally` 경계가 `LOGIN`을 복원하고 최종 verifier가 이를
재확인합니다. 호스트 강제 종료처럼 복원 코드를 실행할 수 없었던 경우에는 fail-closed로
`NOLOGIN`이 남을 수 있습니다. bootstrap 프로세스가 완전히 종료되고 다른 client가 없음을
확인한 뒤 migrator로 `ALTER ROLE webdex_runtime LOGIN;`을 실행하고, 반드시 `--plan`과 capability
verifier를 다시 통과시킨 후 API를 시작합니다. `--plan`은 역할이나 ACL을 변경하지 않습니다.

기존 운영 DB upgrade에는 `drizzle-kit push`를 사용하지 않고, 앱 시작 시에는 어떤 DDL도 실행하지
않습니다.
[production-database-migrations.yml](.github/workflows/production-database-migrations.yml)을
정확한 release commit SHA로 수동 실행하고,
`production-database` GitHub Environment의 required reviewer 승인과
`PRODUCTION_DATABASE_DIRECT_URL` secret, `PRODUCTION_RUNTIME_DATABASE_ROLE` variable을 사용합니다.
direct URL은 runtime 앱 role과 별개인 전용 DDL migrator role이어야 하며 runtime role은 migrator
role을 포함한 다른 role을 상속하거나 DB·extension·`public` 객체를 소유할 수 없고, DB 또는
`public` schema의 `CREATE` 권한과 `toonspectrum_ops` schema/원장 table의 어떤 권한도 가질 수
없습니다. migration runner는 `PUBLIC`과 runtime role의 원장 접근을 매번 회수한 뒤 verifier와
동일한 0024 object-storage 컬럼 권한 계약을 적용하고, 0025 인증 lifecycle 스키마·인덱스와
runtime DML 권한을 검증합니다. runtime
role의 public relation/sequence 최소 DML GRANT와 실제 `DATABASE_URL` canary는
[`DEPLOY.md`](DEPLOY.md)의 운영 전제대로 별도 완료해야 합니다. URL은
구조 파싱 후 `postgresql:`/`postgres:`
protocol, credentialed authority, direct hostname을 확인하고, query는
`sslmode=verify-full&channel_binding=require`만 정확히 한 번씩 허용합니다. `host`, `hostaddr`,
`service`, `port`, `user`, `dbname`, `options`를 포함한 libpq override와 pooler hostname은
거부합니다. DB secret은 URL 검증·migration·capability 검증 step에만 전달됩니다.

최초 원장 도입은 `migration_mode=adopt`와
`ADOPT-TOONSPECTRUM-MIGRATION-HISTORY`, 이후 일반 배포는 `migration_mode=apply`와
`APPLY-TOONSPECTRUM-PRODUCTION-MIGRATIONS`를 사용합니다. 중단되어 `applying`/`failed`가 남으면
일반 실행은 거부되며, 원인을 확인한 뒤에만 `migration_mode=repair`와
`REPAIR-TOONSPECTRUM-MIGRATION-STATE`를 사용합니다. `repair`는 checksum이 일치하는 기존
`applying`/`failed` row만 재개하며, 원장이 없거나 누락된 history/pending migration을 생성하는
우회 경로로 사용할 수 없습니다. durable lock이 남아 있으면 DB에서 확인한 exact 64자리
`ownerToken`을 workflow의 `stale_lock_owner_token`에 입력해야 하고, 획득 후 60분이 지나지 않은
lock은 token이 일치해도 active runner로 간주해 탈취하지 않습니다. 모든 mode는
`NO-STUDIO-WRITERS` 확인과 Environment reviewer 승인을 요구합니다. workflow는 exact checksum
원장, 현재 runtime health relation 전체, comment reanchor, Marketplace generated search/GIN
opclass, `pg_trgm`, `0017` cutover marker를 함께 검증합니다.

이 workflow는 이미 provision된 운영 DB upgrade 전용이며 `user`, `creator_work`,
`creator_work_live_lock` base relation이 없으면 DDL 전에 실패합니다. 새 production DB bootstrap은
별도의 승인·검증 작업으로 먼저 완료해야 합니다. `0017` 최초 cutover와 최초 adoption 전에 모든
Studio writer를 drain해야 합니다. Render pre-deploy 등 다른 migration writer와 동시에 활성화하면
안 됩니다. API writer drain, live-lock revision cutover, retry, emergency rollback 절차는
[`docs/STUDIO-LIVE-LOCK-REVISION-MIGRATION.md`](docs/STUDIO-LIVE-LOCK-REVISION-MIGRATION.md)를 따릅니다.

> 데이터 갱신: 로컬에서 `pnpm catalog:update:manual`을 실행하고 결과를 검토·커밋한 뒤 재배포합니다. 정적 파일과 API 번들은 같은 검토된 스냅샷을 사용하며, 실행 중인 서버는 카탈로그를 다시 읽지 않습니다. 전체 흐름은 [`docs/data-pipeline.md`](docs/data-pipeline.md) 참고.

## 프로젝트 구조

```text
apps/
  web/                       사용자·창작자용 Vite/React Web
    index.html
    vite.config.ts
    src/{app,domains,platform,shared}/
    public/
  admin-web/                 독립 관리자 Web
    src/{app,domains,platform,shared}/
  api/                       NestJS backend
    drizzle.config.ts
    src/{modules,infrastructure,db,server,...}/
  mobile/                    Capacitor Android/iOS wrapper
  desktop-sync/              로컬·cloud 동기화
services/
  creator-inference/         선택형 GPU inference worker
packages/
  contracts/                 교차 앱 runtime-neutral 계약
  core/                      기존 공용 순수 모델·계약
  studio-*/                  Studio engine·document·command package
tests/
  integration/               Web/Admin/API/package 교차 경계 테스트
  benchmarks/                성능·품질 비교
  corpus/                    검증 코퍼스
tools/                       authoring·automation·DCC utility
data/                        검토된 카탈로그·asset release 자료
deploy/                      Cloudflare·Coturn 등 배포 단위
config/                      기계 정책과 아키텍처 ratchet
openwiki/                    탐색·설명 보조 문서
docs/                        현재 문서, ADR, 역사 자료
```

`packages/domains/*`는 만들지 않습니다. 기능은 먼저 각 앱의
`domains/<domain>/<capability>`에 두고, 실제 두 번째 소비자가 생긴 좁은 계약만
`packages/contracts` 같은 focused package로 승격합니다.

<br/>

> **데이터 고지** — 작품 메타데이터와 공개 수치는 공개적으로 접근 가능한 소스에서 수집합니다. 평가 수·평점 분포·완독률·몰입 지수 등 플랫폼이 공개하지 않는 지표는 추정값(≈)으로 표기합니다. 표지 이미지의 저작권은 각 저작권자에게 있으며, 운영 시 플랫폼별 약관·robots·제휴 가능성을 준수합니다.

## 저장소 구조 원칙

배포 가능한 애플리케이션은 `apps/`, 선택형 독립 서비스는 `services/`, 안정된 공용 계약과 엔진은
`packages/`에 둡니다. 교차 앱 테스트는 `tests/integration`, 제품 번들 밖의 제작 도구는 `tools/`가
소유합니다. 정확한 경계와 ratchet은 [ARCHITECTURE.md](ARCHITECTURE.md)를 따릅니다.

### 런타임 소스 지도

Web과 Admin은 `app/domains/platform/shared` 소유권을 사용합니다. API 기능은
`apps/api/src/modules`, 외부 adapter는 `apps/api/src/infrastructure`, schema·migration은
`apps/api/src/db`가 소유합니다. `apps/api/src/server`와 `common`은 점진적으로 축소하는 레거시
경계입니다. 운영 HTTP 진입점은 `apps/api/src/main.ts`입니다.
