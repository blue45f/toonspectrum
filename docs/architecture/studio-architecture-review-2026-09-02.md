# ToonSpectrum Studio 아키텍처·성능 개선 외부 검토 (2026-09-02)

- 출처: ChatGPT 공유 대화 「아키텍처 성능 개선 검토」
  (https://chatgpt.com/share/6a971776-f7f4-83ee-8186-d1127baa70b0, 모델 `gpt-5-6-pro`)
- 검토 대상: 저장소 `main` 커밋 `e90aadbe` 시점 소스 + https://www.toonstudio.cloud/studio
- 반영 대상 커밋: `56e7148a` 이후 (브랜치 `claude/document-review-detailed-50249d`)
- 반영 방식: §A에서 주장 하나하나를 현재 소스와 대조했고, §B에 이번 웨이브에서 실제로 바꾼 것과
  로드맵으로 넘긴 것을 나눴다. §C는 검토 원문이다(인용 마커만 제거, 문장은 그대로).
- 관련 결정: [ADR-0019](../adr/0019-renderer-role-ledger-single-authority.md),
  [ADR-0020](../adr/0020-editor-client-ui-command-boundary.md),
  [ADR-0021](../adr/0021-stroke-budget-myb-disposition-execution-profiles.md),
  로드맵 [architecture-review-roadmap-2026-09-02](../rewrite/architecture-review-roadmap-2026-09-02.md)

## A. 주장 검증 대장

판정 기준: **확인** = 현재 소스에서 그대로 재현됨 · **부분** = 결론은 맞지만 수치/세부가 다름 ·
**stale** = 검토 시점 이후 이미 바뀌었거나 검토가 본 상태가 현재와 다름 · **미확인** = 근거를 찾지 못함.

| # | 검토 주장 | 판정 | 현재 소스 근거 | 이번 반영 |
| --- | --- | --- | --- | --- |
| 1 | `StudioCuttoonEditorHost.tsx`가 약 61,947행 | **부분** | 실측 30,961행(`wc -l`). 수치는 2배 과장이나 "이름만 바뀐 모놀리스"라는 결론은 유효 | 행수 ratchet(≤31,000)로 재증가 차단 |
| 2 | `ViewSessionCore/Rest`가 수백 필드를 전부 `any`로 넘기는 closure bag | **확인** | `studio-cuttoon-editor/StudioCuttoonEditorViewSessionCore.ts`·`Rest.ts` 각 552개 `any`, 파일 상단 `eslint-disable no-explicit-any` | `any` 개수 ratchet |
| 3 | `StudioPage.tsx` 크기 테스트가 문제를 숨김 | **확인** | `studio-page-entry-size-boundary.test.ts`가 진입 파일 <10,000행만 검사 | 삭제 → `studio-host-architecture-ratchet.test.ts`(역방향 import 금지·setter·any·브라우저 API 접근 ratchet) |
| 4 | `StudioLeftToolRail`이 `setTool` 등 다수 setter를 직접 받음 | **확인** | `StudioLeftToolRailProps`에 `Dispatch<SetStateAction>` 17개 | `setTool` 제거(핸드 토글·선택 복귀를 명명된 핸들러로), setter 수 ratchet |
| 5 | 린트 예외가 임시 상태를 영구화 | **확인** | `eslint.config.mjs` 예외 2블록(컴파일러 탈락 4글롭 + closure bag 45글롭) | 글롭을 `eslint.legacy-exceptions.json` 원장으로 분리, 신규 추가 금지 테스트 |
| 6 | `.myb` importer가 존재하지 않는 `dabs_per_radius` 키를 읽어 spacing이 기본 10%로 떨어짐 | **확인** | `packages/studio-format-gateway/src/myb.ts`; 코퍼스 5개 전부 `dabs_per_actual_radius`(oss-hybrid는 `dabs_per_basic_radius`도) 사용 | 실제 키 합산(DPAR+DPBR)으로 수정, 코퍼스 기반 테스트 추가 |
| 7 | `smudge`를 적용하고도 unmapped로 보고, 테스트가 그 상태를 고정 | **확인** | `format-gateway.test.ts` 39행 `toEqual(["color_h","smudge"])` | `MybSettingDisposition` 5분류 도입, `unmappedSettings`는 파생값으로 유지 |
| 8 | Hokusai 최종 픽셀은 원본 payload를 다시 읽어 영향 없음 | **확인** | `packages/studio-brush-platform/src/raster-compile.ts`가 `sourcePayload`를 재해석 | provider-native 목록 드리프트 가드 추가 |
| 9 | Quick Start가 blocking modal로 첫 획을 막음 | **stale(부분)** | 2026-08-08 감사 이후 backdrop은 `pointer-events-none`으로 바뀌어 캔버스 클릭은 통과. 그러나 `aria-modal` 포커스 트랩·전면 blur backdrop·상단 중앙 배치는 남아 있음 | 비모달 우하단 카드로 전환, backdrop 제거, Esc는 카드 내부 포커스일 때만 |
| 10 | 기본 도구가 `select`라 첫 획 전에 전환이 필요 | **확인** | `useState<Tool>("select")` (host 5048행), `showQuickStart`가 `tool !== "draw"`를 요구 | 신규/빈 문서는 draw, 기존 문서는 마지막 도구 복원(`primary-tool` 선호값) |
| 11 | 매뉴얼은 "WebGPU 기반 캔버스", 경계 감사는 Konva 권위 | **확인** | `STUDIO_MANUAL.md:26` vs `docs/rewrite/current-studio-boundary.md` §1 | 매뉴얼 문장 수정, 렌더러 역할 문서를 원장에서 자동 생성 |
| 12 | 실험 진입점이 `src` 최상위에 제품 소스와 혼재 | **확인** | `src/hand-compare-main.ts`, `src/props-compare-main.ts`, `src/hybrid-dcc-e2e-main.tsx` + 루트 html 3개 | `tools/browser-harnesses/`로 이동, `validate:architecture`가 재발 차단 |
| 13 | 패키지 설명이 "V11/V12" 단계명에 묶임 | **확인** | `packages/*/package.json` description 6개 | 책임 기반 문구로 교체 |
| 14 | `studio-project-model` 책임 과다(IR+CommandBus+journal+recovery+browser/node) | **확인** | `exports`에 `./node`, `./browser` 하위 런타임 포함 | 분리는 P1 로드맵(경계 테스트 먼저) |
| 15 | dab 고정 상한 32,768 증가가 다음 병목을 만듦 | **확인** | `e90aadbe`; `STUDIO_DYNAMIC_BRUSH_DAB_CAP_RANGE.max`, 수채 상한 동일 | `StrokeBudget`(byte/time 예산) 도입, 기존 상한은 예산에서 파생(수치 동일, 행동 불변) |
| 16 | vNext가 Memory64를 강하게 전제 | **확인** | `docs/studio-browser-native-engine-vnext-2026-07-27.md` "A missing Memory64 capability fails closed" | ADR-0021: 기본 wasm32 + OPFS windowing, Memory64는 대형 문서 조건부 |
| 17 | `/studio`에 COOP/COEP/CSP `wasm-unsafe-eval`·Worker 허용이 이미 설정 | **확인** | `vercel.json` 55·67·68·74·75행 | 변경 없음(회귀 테스트 목록은 로드맵) |
| 18 | Safe Mode·저장소 압박 복구가 제품 경로에 배선 | **확인** | `studio-safe-mode-runtime.ts`, `StudioReliabilityStatusRail.tsx`, `studio-recovery-guide.ts` | 변경 없음 |
| 19 | libmypaint parity 코퍼스 2개, 대형 브러시는 프록시 | **부분** | `libmypaint-parity.test.ts`: 코퍼스 `wash-soft`·`ink-crisp` 2개, 프레임 192×96, large lane은 radius 상향 프록시(180px이라는 수치는 소스에 없음) | 1,000px·장시간 wet·smudge·random dynamics 게이트는 P4 로드맵 |
| 20 | Pixi WebGPU는 성숙 중, Vello Hybrid는 초기 단계 | **확인(외부)** | upstream `vello_hybrid` sparse-strip은 `unavailable-upstream-api`. 제품의 "V13 Hybrid"는 Classic + FrameGraph compositor다 | 역할 원장: Pixi=선택 오버레이 island primary(상시 오버레이 호스트, 브러시/hit-test 권위 없음), upstream Vello Hybrid sparse=lab |
| 21 | Vello CPU는 reference, Hybrid는 lab, Raw WebGPU가 GPU 주 권위 | **조정 필요** | ADR-0018(2026-08-31)은 Vello WebGPU/WASM을 2D 문서 픽셀 목표 엔진으로 확정. 원장 작성 시 `studio-vello-hub-document-hybrid-v13`이 기본 활성·`documentAuthority=true`임을 확인(08-11 경계 감사의 "selection overlay 한정"은 stale) | ADR-0019: 권위별 분리 — 문서 벡터 island=Vello Classic(현재 primary), 래스터 브러시 커밋=Canvas2D(현재)→raw WebGPU 브러시 런타임(목표), Vello CPU/libmypaint=reference, CanvasKit=`path-ops-quality` 단독 소유 |
| 21a | Paper.js는 의존성만 있고 호출부 없음(검토 §8은 "편집 친화 기하"로 유지 권고) | **stale** | `studio-engine-vector-geometry-provider.ts`가 `import("paper")`로 지연 로드 | 원장: provider |
| 22 | Hokusai route 수 문서 불일치 | **미확인** | 검토가 지목한 문서 위치를 찾지 못함 | 로드맵 P0 잔여로 기록 |
| 23 | Three/Babylon/Pixi가 모두 3D scene owner가 되면 안 됨 | **확인** | Three(+three-vrm)가 `vrm/`·`bg3d/` 주 소유, Babylon은 `studio-bg3d-babylon-specialist-entry.ts` 전문 진입 | 역할 원장: Three=primary(scene-3d), Babylon=provider |
| 24 | CRDT에 픽셀을 직접 넣지 않음 | **확인(현행 일치)** | `docs/studio-crdt-webgpu-architecture-2026-07-16.md`: 패치는 content-addressed PNG 에셋 | 변경 없음 |
| 25 | Zod를 hot path에서 쓰지 말 것 | **확인(현행 일치)** | `brush/`·`canvas/`·`render/` 비테스트 파일의 `from "zod"` import 0건 | 변경 없음(ratchet은 후속) |
| 26 | 검토 기준 커밋 `e90aad…` | **확인** | 현재 HEAD `56e7148a`는 그 위에 soak CI 커밋 1개만 추가 | — |

## B. 이번 웨이브에서 반영한 것 / 넘긴 것

### 반영(P0 + P1 착수)

1. `.myb` spacing·smudge 계약 수정과 `MybSettingDisposition` 5분류, 실제 코퍼스 테스트 — ADR-0021.
2. Renderer Role Ledger(`primary / provider / reference / lab`, 18개 엔진, 12개 권위)와 lab 엔진 제품
   import 0건 계약, `docs/engines/renderer-roles.md` 자동 생성(`verify:studio-renderer-roles`), 매뉴얼
   문구 정정 — ADR-0019.
3. `EditorClient` 계약(`getSnapshot/subscribe/dispatch → CommandReceipt`)과 React 훅
   (`useEditorSelector`, `useEditorCommand`) — ADR-0020. 호스트 배선은 P1 잔여.
4. 툴 레일에서 `setTool` setter 제거(명명된 핸들러로 대체), setter·`any`·행수·브라우저 API 접근
   ratchet 테스트, feature→host 역방향 import 금지, 린트 예외 원장 분리 — ADR-0020.
5. Quick Start 비모달 카드, 신규 문서 기본 브러시 진입, 마지막 도구 복원 — 검토 §2·§11 P0.
6. `StrokeBudget` 도입(기존 dab 상한을 예산에서 파생, 수치 동일) — ADR-0021.
7. 실험 하니스 `tools/browser-harnesses/` 이동, `validate:architecture` 재발 방지, 패키지 설명
   책임 기반 문구.

### 로드맵으로 넘긴 것

`studio-project-model` 분리, `apps/studio-web` 이동, 런타임 소유자 7종 분해, WebGPU shadow
compositor, OPFS command journal + tile shard, BrushGraph V2, Konva 권위 제거 —
[architecture-review-roadmap-2026-09-02](../rewrite/architecture-review-roadmap-2026-09-02.md).

---

## C. 검토 원문

## ToonSpectrum Studio 소스·UI/UX·렌더링 엔진 고도화 검토

분석 기준은 **2026년 9월 2일**, 저장소 `main`의 확인 시점 최신 커밋 `e90aad…`입니다. 최신 커밋에서도 긴 연필 스트로크를 위해 `StudioDrawNode`의 Canvas2D 패스 호출을 묶고, 브러시 dab 상한을 최대 32,768개까지 올리는 최적화가 이루어졌습니다. 이는 현재 제품의 병목이 여전히 Konva/Canvas2D 커밋 렌더링 경로에 존재한다는 직접적인 증거입니다.

UI 평가는 현행 소스, 사용자 매뉴얼, 저장소의 Playwright UX 감사와 브라우저 계약 테스트를 교차 검증했습니다. 다만 이 세션에서는 운영 SPA 클릭 자동화 연결이 인증되지 않아, 실제 배포 화면의 픽셀 단위 회귀 재현은 범위에서 제외했습니다.

---

### 핵심 결론

#### 1. 기술이 부족한 프로젝트가 아니라, 기술이 너무 많은 프로젝트입니다

이미 저장소에는 다음이 함께 존재합니다.

- Konva/Canvas2D 제품 렌더러
- Raw WebGPU 브러시·필터 실험
- Hokusai Rust/WASM 자연 매체 엔진
- libmypaint WASM 비교 엔진
- CanvasKit/Skia Worker
- Vello CPU/WGPU 후보
- PixiJS WebGPU/WebGL 오버레이
- p5.brush WebGL2 Worker
- Paper.js, Rough.js, perfect-freehand
- Krita 계열 브러시 커널
- OPFS 타일 저장소
- GPU 엔진 토너먼트와 격리 정책

현재 가장 필요한 것은 엔진을 더 추가하는 것이 아니라,

> **하나의 문서 권위, 하나의 명령 권위, 하나의 주 GPU 프레임 그래프 아래에 여러 전문 엔진을 종속시키는 것**

입니다.

#### 2. WebGPU + WASM 전환은 충분히 가능합니다

다만 “Canvas를 WebGPU로 바꾼다”는 표현은 정확하지 않습니다. WebGPU 역시 결과를 `GPUCanvasContext` 또는 Worker의 `OffscreenCanvas`에 표시합니다. 없애야 하는 것은 Canvas 요소가 아니라 **Canvas2D와 Konva가 브러시 픽셀·문서 표시·포인터 처리의 최종 권위를 동시에 가지는 구조**입니다. WebGPU는 GPU 렌더링과 컴퓨트의 주 권위로, WASM은 결정적 CPU 커널과 포맷·기하·복구 처리로, WebGL2는 제한적 호환 경로나 전문 효과 제공자로 배치하는 것이 맞습니다.

#### 3. 가장 큰 병목은 렌더러보다 6만 줄짜리 세션 모놀리스입니다

`StudioPage.tsx` 자체는 얇은 진입점으로 바뀌었지만, 실제 편집기 상태와 동작은 `StudioCuttoonEditorHost.tsx`에 옮겨졌고 파일은 약 **61,947행**까지 이어집니다. 즉 파일 이름만 바뀌었지 상태 소유권과 결합도는 아직 해소되지 않았습니다.

더 심각한 증거는 `StudioCuttoonEditorViewSessionCore`입니다. 이 타입은 AI, 캔버스, 브러시, 협업, 애니메이션, 3D, 저장, UI 상태 등 수백 개 필드를 전부 `any`로 전달하는 “원래 closure bag” 역할을 합니다. 컴포넌트 분리는 이루어졌지만 아키텍처 분리는 이루어지지 않은 상태입니다.

#### 4. 공격적인 브러시 엔진 고도화는 가능하며, 오히려 ToonSpectrum의 가장 강한 차별화 지점이 될 수 있습니다

하지만 Hokusai, libmypaint, Krita, p5.brush, 자체 WebGPU 브러시를 각각 별도 기능처럼 계속 붙이는 방식은 유지비가 폭발합니다. 모든 브러시를 하나의 얕은 공통 포맷으로 억지 변환해서도 안 됩니다.

가장 좋은 구조는 다음 두 표현을 동시에 보존하는 것입니다.

- 편집 UI와 검색·미리보기를 위한 **공통 BrushGraph IR**
- Hokusai `.myb`, Krita, ABR 등 원본 엔진 의미를 보존하는 **Provider-native authoritative payload**

---

## 1. 현재 구조의 평가

| 영역 | 평가 | 핵심 판단 |
|---|---:|---|
| 제품 기능 폭 | 9/10 | 드로잉·웹툰·3D·애니메이션·AI·협업까지 매우 강함 |
| 엔진 연구·실험 | 9/10 | 일반 웹 편집기보다 훨씬 공격적 |
| 테스트·계약 의식 | 8/10 | 브라우저·품질·결정성·스토리지 테스트가 다양함 |
| 렌더링 권위 수렴 | 4/10 | Konva와 여러 GPU island가 병존 |
| 코드 유지보수성 | 2/10 | 6만 줄 host, `any` closure bag, 광범위한 린트 예외 |
| UI 발견 가능성 | 5/10 | 기능 폭에 비해 초기 진입과 패널 밀도가 높음 |
| WebGPU 이전 준비도 | 7/10 | 기술 검증과 배포 헤더는 준비됐으나 제품 권위 전환이 남음 |

### 잘된 부분

현재 ADR은 큰 방향을 제대로 잡았습니다. 문서 ID와 프레젠테이션 ID를 구분하고, `/studio` 라우팅 및 수명주기를 외부 경계로 분리한 뒤 기존 편집기를 strangler 방식으로 점진 분해하도록 결정했습니다. 전면 재작성보다 훨씬 안전한 선택입니다.

패키지 분리도 이미 시작됐습니다.

- `studio-project-model`
- `studio-command-registry`
- `studio-engine-registry`
- `studio-brush-platform`
- `studio-engine-skia`
- `studio-engine-vello`
- `studio-format-gateway`
- `studio-hokusai-wasm`

처럼 주요 축이 패키지로 나뉘어 있습니다.

브러시의 라이브 프리뷰와 커밋 결과가 달라지는 문제, 긴 스트로크가 중간에서 잘리는 문제, 저장 실패 및 Safe Mode 등 실제 제작 도구에서 중요한 품질 문제를 별도 테스트와 복구 경로로 다루고 있는 것도 강점입니다. 최신 코드에는 과거 dead code였던 Safe Mode와 저장소 압박 복구도 제품 경로에 배선되어 있습니다.

### 가장 큰 구조 문제

#### `StudioPage` 크기 테스트가 문제를 숨깁니다

현재 테스트는 `StudioPage.tsx`가 특정 크기 이하인지 확인하지만, 실제 구현을 `StudioCuttoonEditorHost.tsx`로 옮기는 것으로 조건을 통과할 수 있습니다. “진입 파일이 작다”와 “편집기 아키텍처가 분리됐다”는 전혀 다른 조건입니다.

파일 크기 대신 다음을 검사해야 합니다.

- 한 런타임이 소유할 수 있는 상태 종류
- feature → host 역방향 import 존재 여부
- UI 컴포넌트가 받을 수 있는 command 수
- raw React setter 전달 개수
- `any` 공개 타입 개수
- 브라우저 API 직접 접근 위치
- 문서 mutation 권위 개수
- 렌더러가 문서 의미를 소유하는지 여부

#### UI 컴포넌트가 명령이 아니라 setter 묶음을 받습니다

`StudioLeftToolRail`은 선택/그리기 전환에 단일 명령을 사용해야 한다고 주석으로 명시하면서도, 여전히 `setTool`, `setMenu`, `setPixelTool`, `setDrawShape`, `setQuickShapeActive`, `setReferencePanelOpen` 등 많은 setter를 직접 받습니다. 이는 동일한 사용자 명령이 진입점마다 서로 다른 부수효과를 만들 위험을 남깁니다.

모든 UI 진입점은 다음 셋만 받아야 합니다.

```ts
export interface EditorClient {
 getSnapshot(): EditorSnapshot;
 subscribe(listener: () => void): () => void;

 dispatch(
 command: StudioCommand,
 options?: DispatchOptions,
 ): Promise<CommandReceipt>;
}
```

메뉴, 단축키, 툴 레일, radial HUD, 모바일 도크, AI action이 모두 동일한 `dispatch()`를 호출해야 합니다.

#### 린트 예외가 임시 상태를 영구화하고 있습니다

기계적 추출 영역에 `no-explicit-any`, Hooks 의존성, purity, React Compiler 등의 규칙이 광범위하게 꺼져 있습니다. 이 상태에서는 파일을 더 나눠도 closure 결합이 유지됩니다.

린트 규칙을 한 번에 켜기보다 경계를 순차적으로 좁혀야 합니다.

1. 새 파일은 예외 금지
2. feature별 typed facade 생성
3. closure bag에서 해당 feature 필드 제거
4. 해당 디렉터리의 Hooks·purity 규칙 복구
5. 마지막에 host 예외 삭제

#### `studio-project-model`의 책임이 너무 넓습니다

현재 이 패키지는 IR, CommandBus, append-only journal, crash recovery를 함께 소유하며 browser/node 하위 런타임까지 포함합니다. 순수 문서 모델과 런타임·저장소가 같은 패키지에 있으면 대부분의 하위 패키지가 필요 이상으로 큰 의존성을 갖게 됩니다.

다음처럼 분리하는 편이 좋습니다.

- `studio-document`: 스키마, ID, 불변식, 마이그레이션
- `studio-command`: 명령과 receipt
- `studio-history`: undo/redo 및 command journal
- `studio-runtime`: 세션 orchestration
- `studio-storage`: OPFS, checkpoint, recovery

---

## 2. 현재 UI/UX 기능과 개선 방향

매뉴얼 기준 Studio는 다음 작업면을 제공합니다.

- 좌측 도구 레일
- 중앙 저작 캔버스
- 우측 레이어 및 속성 Inspector
- 하단 애니메이션·3D 컨트롤
- 자연 매체·Wet Ink·QuickShape
- 3D 마네킹과 VRM 포즈
- 웹캠 모션 캡처
- CAD·3D 모델 선화 추출
- Smart Gap Fill 및 FX
- 웹툰 컷 분할·내보내기

기능 폭은 충분히 경쟁력이 있습니다. 문제는 **전체 기능을 한 작업면에서 항상 발견 가능하게 만들려고 한다는 것**입니다.

### 초기 진입 마찰

2026년 8월 8일 저장소의 Playwright UX 감사에서는 게스트 첫 획 전에 다음 두 동작이 필요했습니다.

1. 온로드 Quick Start 모달 닫기
2. 기본 선택 도구에서 브러시 도구로 전환

당시 1440×900 화면에서 도구 레일 34개 중 19개가 화면 밖에 있었고, Inspector는 한 번에 33개 속성을 보여주며 점진 공개가 충분하지 않았습니다. 이 감사 이후 radial 메뉴, Command Registry, Safe Mode, More 메뉴 등은 개선됐지만 Quick Start backdrop과 기본 `select` 도구는 현재 소스에도 남아 있습니다.

#### 권장 변경

첫 진입은 다음 상태가 적합합니다.

- 기본 도구: 사용자가 마지막으로 쓴 도구, 신규 사용자는 G-Pen 또는 기본 연필
- 캔버스 중앙 클릭·펜 입력: 즉시 첫 획 시작
- Quick Start: blocking modal이 아니라 우측 하단 비모달 카드
- 빈 캔버스에서 `Esc`: 아무 변화 없음
- 펜이 감지되면 자동으로 펜 친화적 workspace 전환
- 마우스 입력 사용자는 선택 도구 유지 옵션 제공

즉, 신규 사용자에게는 “그리기 우선”, 기존 문서 사용자에게는 “마지막 상태 복구”가 자연스럽습니다.

### 기능 기반이 아니라 작업 기반 Workspace가 필요합니다

상단 메뉴와 Inspector를 계속 확장하는 대신 다음 다섯 작업 공간을 권장합니다.

| Workspace | 전면에 보일 기능 |
|---|---|
| **그리기** | 브러시, 색상, 안정화, 레이어, 선택 |
| **웹툰 구성** | 컷, 말풍선, 텍스트, 대사, 에셋 |
| **3D·배경** | VRM, 마네킹, 배경, 카메라, 선화 추출 |
| **애니메이션** | 타임라인, 키프레임, 오디오, 카메라 |
| **검토·게시** | 댓글, 협업, 권리 감사, 내보내기 |

문서와 undo history는 그대로 유지하고, workspace는 **같은 명령 집합의 노출 방식만 변경**해야 합니다. ADR에서 문서 정체성과 프레젠테이션 정체성을 분리한 원칙과도 맞습니다.

### 도구 레일

현재처럼 30개 이상의 기능을 동일 위계로 두기보다 8개 정도를 1차 도구로 유지하는 편이 좋습니다.

- 선택
- 브러시
- 지우개
- 채우기
- 도형
- 텍스트·말풍선
- 컷
- 보기·손

나머지는 press-and-hold flyout, `More`, command palette, radial HUD로 이동합니다.

저장소에는 이미 radial pointer/pen 메뉴와 durable Quick Access 모델이 있고 Command Registry를 공유하도록 설계되어 있으므로, 새 체계를 만드는 대신 이 경로를 주 UI로 승격하면 됩니다.

### Inspector

Inspector는 “기능 목록”이 아니라 “현재 대상의 다음 행동”을 보여줘야 합니다.

예를 들어 브러시 도구에서는 처음에 다음만 노출합니다.

- 크기
- 불투명도
- 색상
- 안정화
- 브러시 선택
- 혼합·재질 요약

그 아래에 `세부 브러시 설정`을 두어 tip, spacing, grain, velocity, tilt, wetness 등을 펼칩니다.

선택 대상이 없을 때는 33개의 비활성 속성을 보여주기보다 다음처럼 작업을 안내합니다.

- 그리기 시작
- 이미지 가져오기
- 컷 만들기
- 3D 포즈 열기
- 최근 에셋

### 신뢰성 UX

현재 Safe Mode와 저장소 복구가 제품 경로에 들어간 점은 좋습니다. 여기에 사용자가 이해할 수 있는 3단계 상태를 제공해야 합니다.

- **표시 중**: 현재 화면에 보이는 획
- **처리 중**: 자연 매체 시뮬레이션 또는 고품질 커밋 진행
- **저장됨**: OPFS 또는 서버 내구성 확보

GPU device loss, 저장소 quota, 협업 연결 끊김을 각각 다른 토스트로 흩뿌리지 말고 `작업 상태 센터`로 묶는 것이 좋습니다.

---

## 3. 권장 모노레포 폴더 구조

현재 `apps`에는 API만 있고, 웹 애플리케이션은 루트 `src`에 discovery, Studio, 각종 비교 harness가 혼재합니다.

또한 `src` 최상위에 `hand-compare-main.ts`, `props-compare-main.ts`, `hybrid-dcc-e2e-main.tsx` 같은 실험 진입점이 제품 소스와 함께 있습니다. 이 코드는 `tools` 또는 `tests/harnesses`로 내려야 합니다.

### 목표 구조

```text
apps/
 discovery-web/ # 작품 탐색, 커뮤니티, 마켓
 studio-web/ # 편집기 UI와 EngineClient만
 api/
 realtime-gateway/ # 협업 WebSocket/CRDT gateway
 export-worker/ # 서버 고해상도 export
 desktop-shell/ # 추후 Tauri/Electron 선택 사항

packages/
 studio-document/ # 순수 문서 스키마, ID, 마이그레이션
 studio-command/ # 명령, capability, receipt
 studio-history/ # undo/redo, journal, checkpoint
 studio-runtime/ # 세션 actor와 orchestration
 studio-engine-client/ # UI ↔ Worker 프로토콜

 studio-render-ir/
 studio-render-webgpu/
 studio-render-webgl2/ # 제한적 호환·전문 provider
 studio-render-cpu/ # WASM reference/oracle
 studio-render-export/

 studio-brush-ir/
 studio-brush-compiler/
 studio-brush-webgpu/
 studio-brush-hokusai/
 studio-brush-libmypaint/
 studio-brush-krita/

 studio-storage-opfs/
 studio-collaboration/
 studio-format-gateway/
 studio-command-registry/
 studio-plugin-sdk/
 studio-ui/
 studio-engine-labs/ # Vello Hybrid, WESL 등 실험 격리

crates/
 studio-geometry-kernel/
 studio-brush-kernel/
 studio-raster-kernel/
 studio-codec-kernel/
 studio-vello-adapter/

tools/
 benchmarks/
 visual-goldens/
 browser-harnesses/
 corpus-builders/
```

### `apps/studio-web` 내부

```text
src/
 app/
 StudioApp.tsx
 providers/
 routing/

 shell/
 StudioShell.tsx
 menus/
 workspace/
 reliability/

 features/
 drawing/
 model/
 controller/
 ui/
 adapter/
 selection/
 layers/
 comic/
 text/
 animation/
 scene3d/
 collaboration/
 publishing/

 engine/
 EditorClient.ts
 editor-snapshot.ts
 worker-bootstrap.ts
 capability-profile.ts
```

### 의존 방향

```text
UI
 ↓
feature controller / use-case
 ↓
command + document domain
 ↓
runtime ports
 ↑
WebGPU / OPFS / CRDT / API adapters
```

반드시 지킬 규칙은 다음과 같습니다.

- `studio-document`는 React, DOM, Worker, OPFS를 import하지 않음
- 렌더러는 문서 스키마를 직접 mutation하지 않음
- UI는 OPFS나 GPUDevice에 직접 접근하지 않음
- feature는 `StudioCuttoonEditorHost`를 import하지 않음
- 모든 문서 변경은 command와 receipt를 남김
- 브러시 provider는 문서 의미나 undo history를 소유하지 않음
- 실험 엔진은 `studio-engine-labs` 바깥에서 직접 import 금지

---

## 4. 6만 줄 Host를 실제로 분해하는 방법

파일을 UI 영역별로 더 자르는 것만으로는 해결되지 않습니다. 현재 `ViewSessionCore & ViewSessionRest`처럼 거대한 props 객체가 계속 전달되기 때문입니다.

다음 런타임 소유자로 상태를 나눠야 합니다.

### `StudioDocumentRuntime`

소유 대상:

- 현재 문서
- command 적용
- document revision
- undo/redo
- dirty state
- checkpoint
- migration

React state가 아니라 독립 store 또는 actor여야 합니다.

### `ToolRuntime`

소유 대상:

- 현재 도구
- pointer state machine
- 임시 selection
- stroke begin/move/end/cancel
- quick shape
- modifier key
- predicted sample

`pointerdown → drawing → settling → committed` 상태를 명시적인 state machine으로 관리합니다.

### `ViewportRuntime`

소유 대상:

- zoom, pan, rotation
- visible bounds
- tile residency request
- hit-test request
- cursor HUD 위치
- device pixel ratio

### `RenderRuntime`

소유 대상:

- GPUDevice
- pipeline cache
- texture pool
- tile atlas
- transient stroke surface
- committed tile composition
- device-loss recovery

### `DurabilityRuntime`

소유 대상:

- OPFS tile shard
- append-only command journal
- checkpoint
- quota
- recovery generation
- accepted durable prefix

### `CollaborationRuntime`

소유 대상:

- CRDT/session clock
- role 및 lock
- remote command
- presence
- server durability barrier

### `ExportRuntime`

소유 대상:

- export snapshot
- font and asset resolution
- color-space conversion
- page slicing
- server/local export 선택

UI는 이 런타임들의 전체 상태를 한 객체로 받지 않고, 필요한 selector와 명령만 구독합니다.

```ts
const brushUi = useEditorSelector(selectBrushUi);
const selectionUi = useEditorSelector(selectSelectionUi);

const chooseBrush = useEditorCommand("brush.choose");
const setBrushSize = useEditorCommand("brush.set-size");
```

이렇게 바꾸면 `StudioLeftToolRail`이 `setTool`과 20개 setter를 받을 이유가 사라집니다.

---

## 5. WebGPU + WASM + WebGL 조합의 현실적인 설계

### 권장 역할 분담

| 기술 | 권장 역할 | 맡기지 말아야 할 역할 |
|---|---|---|
| **Raw WebGPU** | 브러시 deposition, 필터, 타일 합성, 색상 처리, 최종 표시 | 문서 모델, undo 의미 |
| **Rust/WASM** | 기하, 브러시 resampling, 포맷, 압축, CPU reference, deterministic kernel | 매 포인터 이벤트마다 JS↔WASM 소규모 호출 |
| **WebGL2** | 구형 호환, 일부 전문 FX, 기존 p5/Pixi provider | WebGPU와 동등한 두 번째 주 합성기 |
| **Canvas2D** | 디버그, 극단적 fallback, 작은 썸네일 | 긴 스트로크·대형 문서 주 렌더러 |
| **Konva** | 마이그레이션 중 선택·텍스트 overlay | 브러시 픽셀 권위 |
| **CanvasKit** | 고품질 export와 path/text 검증 oracle | 상시 live editor 주 엔진 |
| **Vello CPU** | vector golden/reference | 문서 권위 |
| **Vello Hybrid** | 연구·벤치마크 | 현재 제품 기본 엔진 |

현재 PixiJS 공식 문서도 WebGPU 구현이 기능적으로 상당히 진행됐지만 여전히 성숙 중이며, 제품 안정성이 우선이면 WebGL 렌더러를 권장하고 있습니다. 따라서 Pixi WebGPU를 전체 Studio의 기반으로 삼기보다는 Raw WebGPU 주 엔진과 분리된 overlay/provider로 유지하는 편이 안전합니다.

Vello Hybrid 역시 CPU 전처리와 GPU 래스터를 결합하는 흥미로운 방향이지만 아직 초기 단계이고 안정 API와 CPU Vello 수준의 기능 일치가 부족합니다. `engine-labs`의 벤치마크 후보가 적절합니다.

CanvasKit은 Skia를 WASM과 WebGL 위에서 사용할 수 있는 강력한 렌더러이므로 export oracle과 path/text 품질 비교에는 유용하지만, 이를 다시 제품의 실시간 주 합성기로 올리면 Raw WebGPU와 리소스·색상·메모리 권위가 겹칩니다.

### 세 기술을 한 프레임 hot path에 동시에 넣으면 안 되는 이유

잘못된 구조는 다음과 같습니다.

```text
WebGPU brush
 → CPU readback
 → WebGL effect
 → CPU readback
 → Canvas2D/Konva composite
```

이 구조는 GPU 가속 이점을 대부분 잃습니다.

올바른 구조는 다음입니다.

```text
Main Thread
 React UI · pointer capture · accessibility
 │
 ├─ MessagePort: commands
 └─ SharedArrayBuffer: pointer samples
 │
 ▼
 Engine Worker
 ┌──────────────────────────┐
 │ input/resample/predict │
 │ brush compile │
 │ WebGPU render graph │
 │ transient + committed │
 │ tile atlas + composition │
 └──────────────────────────┘
 │
 ▼
 OffscreenCanvas present

 Storage Worker
 OPFS journal · tile shards · checkpoint
```

WebGL2 provider는 다음 중 하나만 수행해야 합니다.

- 별도 화면에서 전문 미리보기
- settled 결과를 한 번만 `ImageBitmap`으로 전달
- WebGPU 미지원 환경의 제한된 호환 모드

WebGPU와 WebGL 렌더러가 매 프레임 상호 결과를 복사하는 구조는 피해야 합니다.

### 제품 실행 프로필

WebGPU를 무조건 요구하는 단일 프로필보다 다음처럼 나누는 것이 좋습니다.

#### `pro-webgpu-worker`

- Worker WebGPU
- OffscreenCanvas
- SharedArrayBuffer pointer ring
- OPFS sync access
- 고급 natural media
- 대형 문서

#### `webgpu-worker-lite`

- WebGPU + Worker
- `postMessage` 기반 입력
- wasm32
- 제한된 tile working set
- 일반적인 기본 프로필

#### `webgl2-compat`

- WebGL2
- 기본 래스터·벡터·선택
- Wet simulation, 고급 bristle 제외
- 기존 문서 열람·수정·내보내기

#### `cpu-reference`

- WASM/CanvasKit/Vello CPU
- golden image
- 테스트·export·복구
- 실시간 편집 기본 경로 아님

Safari 26부터 WebGPU가 macOS, iOS, iPadOS 등에 제공되기 시작했지만, 실제 adapter·feature·limit은 장치와 브라우저에 따라 달라질 수 있습니다. 따라서 브라우저 이름이 아니라 실제 capability probe 결과로 프로필을 고정해야 합니다.

### Memory64는 기본 조건에서 빼야 합니다

현재 vNext 문서가 Memory64를 강하게 전제한다면 완화하는 것이 좋습니다. 공식 엔진 분석에서도 Memory64는 4GB를 넘는 주소 공간이 필요할 때 사용하는 기능이지, 더 빠르거나 현대적이어서 사용하는 기능이 아니며 워크로드에 따라 약 10%에서 100% 이상 느려질 수 있습니다.

권장 정책은 다음입니다.

- 기본: wasm32 + OPFS windowing
- 대형 문서: Memory64 capability가 있고 실제 resident memory가 필요한 경우만
- 4GB 이상의 논리 문서는 resident heap이 아니라 tile shard와 windowed mapping으로 처리
- 브러시 Worker와 저장 Worker를 분리하여 대형 저장 I/O가 프레임을 막지 않도록 함

### OPFS 구조

`FileSystemSyncAccessHandle`은 Dedicated Worker에서 사용할 수 있고, 큰 파일의 in-place 업데이트나 SQLite 형태의 접근에 적합합니다. 현재 저장소의 Worker/OPFS 방향은 올바릅니다.

추천 저장 구조는 다음과 같습니다.

```text
/project/
 manifest.json
 journal/
 commands-000001.log
 checkpoints/
 checkpoint-000042.bin
 tiles/
 layer-id/
 mip-0/
 0_0.tile
 1_0.tile
 assets/
 receipts/
```

문서 저장 시 전체 JSON과 전체 PNG를 매번 다시 쓰지 않고,

- command journal append
- 변경 tile write
- 일정 revision마다 checkpoint
- content hash 기반 asset deduplication

을 수행해야 합니다.

### 배포 조건

현재 `/studio`에는 이미 다음이 설정되어 있습니다.

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`
- CSP의 `wasm-unsafe-eval`
- Worker 허용

따라서 SAB와 WASM thread를 위한 기반은 상당 부분 준비돼 있습니다.

다만 다음 회귀 테스트를 반드시 추가해야 합니다.

- Google 로그인·OAuth 흐름
- 외부 이미지의 credential 제거 영향
- signed URL 이미지 및 3D texture
- marketplace asset
- WebSocket·Realtime
- service worker update
- iframe 및 팝업 opener 관계

---

## 6. WebGPU 렌더 그래프 제안

### 단일 GPUDevice 원칙

Studio 세션당 하나의 `GPUDevice`와 하나의 리소스 관리자를 두어야 합니다.

```text
DeviceManager
 ├─ PipelineCache
 ├─ ShaderRegistry
 ├─ TexturePool
 ├─ TileAtlas
 ├─ UniformRing
 ├─ StagingPool
 ├─ RenderGraph
 └─ DeviceLossCoordinator
```

Pixi, 자체 WebGPU, Vello가 각각 `requestAdapter()`와 `requestDevice()`를 호출하면 메모리 압박과 device-loss 복구가 복잡해집니다. 전문 provider가 주 그래프에 들어오려면 host가 제공하는 제한된 GPU capability 또는 중간 표현을 사용하도록 해야 합니다.

### 프레임 그래프

```text
1. Pointer sample consume
2. Resample / stabilize / predict
3. Dab or mesh generation
4. Tile binning
5. Brush deposition
6. Natural-media simulation
7. Layer effects
8. Selection / mask
9. Scene composite
10. Color management
11. Present
12. Asynchronous durability receipt
```

#### transient와 committed 분리

- `transient stroke texture`: 현재 그리는 획, 낮은 latency
- `committed tile texture`: 확정된 문서 픽셀
- `prediction texture`: 시각적 예측 전용, 저장 금지

`pointerup` 시 예측 구간을 그대로 저장하지 말고 실제 accepted sample prefix로 다시 확정해야 합니다.

### 타일

고정 256×256 하나로 결정하기보다 실제 장치별로 64, 128, 256 후보를 벤치마크하는 것이 좋습니다.

- 작은 타일: sparse update와 wet halo 처리에 유리
- 큰 타일: dispatch와 metadata 비용 감소
- 브러시 크기가 매우 큰 경우: macro tile 또는 multi-tile dispatch
- 필터: mip-aware working set

색상과 마스크도 모두 RGBA16F로 만들 필요가 없습니다.

- 최종 고정밀 color: 필요할 때 RGBA16F
- 일반 작업 color: RGBA8 또는 RGB10A2 후보
- mask: R8/R16
- wetness: R16F
- velocity: RG16F
- pigment field: 브러시 모델별 packed texture

### 긴 획 상한

최근 dab 상한을 32,768까지 올린 것은 잘림을 막지만, 고정 상한 증가는 결국 다음 병목을 만듭니다.

- 메모리 급증
- 배열 재할당
- pointerup commit spike
- undo payload 증가
- 저사양 기기 정지

`maxDabs` 대신 다음 예산으로 바꾸는 것이 적합합니다.

```ts
interface StrokeBudget {
 maxResidentBytes: number;
 maxSamplesPerFrame: number;
 maxDirtyTiles: number;
 maxCommitWorkMs: number;
 spillPolicy: "chunk" | "checkpoint" | "degrade";
}
```

즉 획은 무제한에 가깝게 받을 수 있지만, 내부에서는 chunked accepted prefix와 tile flush로 처리해야 합니다.

---

## 7. 브러시 엔진의 공격적 고도화

### 현재 Brush IR은 provider 능력보다 너무 얕습니다

현재 `BrushProgramIR`은 다음 정도를 표현합니다.

- pressure·velocity·tilt·twist 등의 동적 입력
- EMA 또는 spring 안정화
- 세 종류 geometry
- round/stamp/image tip
- none/smudge/wet mixing
- vector/raster output

반면 Hokusai 래스터 컴파일러는 opacity, hardness, 여러 dab 밀도, tracking, color 변화, smudge 길이·반경, elliptical dab, random offset, paint mode 등 훨씬 많은 `.myb` 설정을 처리합니다. 공통 IR이 provider 원본 의미보다 훨씬 작습니다.

### 즉시 수정해야 할 `.myb` 계약 문제

현재 importer는 `dabs_per_radius`라는 키를 읽습니다. 하지만 실제 corpus와 Hokusai/libmypaint 경로는 다음 키를 사용합니다.

- `dabs_per_basic_radius`
- `dabs_per_actual_radius`

실제 저장소의 `wash-soft.myb`도 `dabs_per_actual_radius`를 사용합니다. 따라서 importer가 만드는 공통 IR의 spacing 요약값은 기본 10%로 떨어질 수 있습니다.

또한 importer는 `smudge`를 `mixing.kind`와 `strength`에 적용하면서 `MAPPED_SETTINGS`에는 넣지 않아 결과적으로 “적용됐지만 unmapped”라고 보고합니다. 현재 단위 테스트도 이 잘못된 상태를 정상 결과로 고정하고 있습니다.

다행히 최종 Hokusai 렌더 경로는 원본 `.myb` payload를 다시 authoritative하게 읽기 때문에 Hokusai 최종 픽셀 자체가 spacing 기본값으로 바뀌지는 않습니다. 문제는 다음 영역입니다.

- 가져오기 직후 설정 UI
- 공통 preview
- 검색·분류 metadata
- 다른 provider로 compile하는 경로
- 사용자에게 표시되는 미매핑 경고

수정 원칙은 다음과 같습니다.

```ts
type SettingDisposition =
 | "mapped-exact"
 | "mapped-summary"
 | "provider-native"
 | "parsed-inert"
 | "unsupported";
```

`unmappedSettings: string[]` 하나로 모든 상태를 표현하지 말고, 위처럼 의미를 구분해야 합니다.

또한 실제 MyPaint brush corpus를 테스트 fixture로 사용해야 합니다. synthetic fixture만으로는 실제 cname 불일치를 놓치기 쉽습니다.

### BrushGraph V2

```ts
interface BrushProgramV2 {
 identity: BrushIdentity;
 input: InputGraph;
 stabilizer: StabilizerGraph;

 tip: TipGraph;
 geometry: GeometryGraph;
 spacing: SpacingGraph;

 deposition: DepositionGraph;
 material: MaterialGraph;
 simulation: SimulationGraph;
 compositing: CompositingGraph;
 postProcess: PostProcessGraph;

 output: BrushOutputPolicy;
 determinism: DeterminismContract;

 nativePayloads: ProviderPayload[];
 editableProjection: BrushEditableProjection;
}
```

#### `TipGraph`

- analytic circle·ellipse
- image stamp
- signed-distance-field nib
- rake·comb
- multi-bristle
- dual tip
- rotating calligraphy nib
- sampled 3D tip

#### `InputGraph`

- pressure
- velocity
- acceleration
- direction
- tilt altitude·azimuth
- twist
- barrel rotation
- stroke time
- distance
- custom input
- deterministic random
- paper coordinate

#### `DepositionGraph`

- pigment amount
- opacity
- flow
- edge concentration
- grain adhesion
- color pickup
- eraser·lock alpha
- texture mask
- underpaint interaction

#### `SimulationGraph`

- none
- smudge
- wet diffusion
- watercolor transport
- oil impasto
- ink bleed
- bristle drag
- particle scatter

### GPU 브러시 파이프라인

```text
SAB pointer samples
 ↓
WASM/SIMD resampler
 ↓
stabilizer + prediction
 ↓
dab/strand/mesh generator
 ↓
WebGPU tile binning compute
 ↓
deposition compute pass
 ↓
optional material simulation
 ↓
composite + transient present
```

JS는 매 dab 객체를 만들지 않아야 합니다. 다음과 같은 SoA buffer를 사용합니다.

```text
x[]
y[]
pressure[]
tiltX[]
tiltY[]
time[]
flags[]
```

WASM과 WebGPU가 동일한 packed layout을 읽도록 하면 JS 객체 할당과 serialization을 크게 줄일 수 있습니다.

### 고급 수채화

타일당 다음 field를 유지합니다.

- pigment concentration
- water quantity
- flow velocity
- paper height
- saturation
- drying state

고정 timestep을 사용하고, 각 tile에 halo 영역을 두어 인접 tile 간 확산을 처리합니다. 전체 캔버스를 매 frame 시뮬레이션하지 않고 wet active set만 돌립니다.

품질 단계는 다음처럼 둡니다.

- Draft: 간단한 edge darkening
- Balanced: 제한된 advection·diffusion
- Pro: pigment 분리, paper grain, backrun, granulation
- Settle: pointerup 이후 추가 시뮬레이션
- Export: 결정적 고품질 재계산

### Bristle·Rake·Fur

각 털을 JS 객체로 만들면 안 됩니다. GPU storage buffer에 strand 상태를 저장하고 다음 요소로 제어합니다.

- root offset
- stiffness
- drag
- pigment load
- random seed
- contact state
- strand lifetime

브러시 1개당 수십~수백 strand를 GPU에서 계산하면 oil, rake, dry brush, fur, hair, grass 표현을 크게 강화할 수 있습니다.

### 벡터·래스터 하이브리드

모든 브러시를 순수 vector 또는 순수 raster로 양분할 필요가 없습니다.

- 문서에는 centerline과 pressure profile을 editable proxy로 보존
- 화면에는 GPU raster tile로 즉시 표시
- 크기·색상·일부 dynamics 변경 시 다시 bake
- 최종 export는 고품질 raster
- 단순 pen은 vector outline도 함께 보존

이 방식이면 자연 매체 품질과 편집 가능성을 동시에 확보할 수 있습니다.

### 플러그인 브러시

임의 WGSL을 그대로 허용하면 보안·GPU hang·메모리 문제가 생깁니다. 대신 제한된 DSL 또는 WESL subset을 제공합니다.

플러그인이 선언할 수 있는 것은 다음 정도로 제한합니다.

- 입력 channel
- uniform parameter
- tip function
- deposition function
- bounded neighborhood
- 최대 storage size
- 최대 pass count

컴파일 시 정적 resource budget을 검사하고, 서명된 marketplace package만 제품 경로에서 실행하도록 합니다.

---

## 8. 기존 엔진·라이브러리의 역할 재정의

현재 전략 문서는 외부 엔진이 canonical document나 brush pixel authority를 갖지 못하도록 명시합니다. 이 원칙은 반드시 유지해야 합니다.

### 제품 유지

#### Hokusai

- `.myb` 원본 자연 매체 provider
- 현재 WASM 격리 구조 유지
- 원본 payload authoritative
- 장기적으로 일부 deposition만 WebGPU로 이식
- 전면 재구현 전까지 품질 기준점 역할

#### libmypaint WASM

- 모든 사용자에게 기본 제공하는 제품 엔진보다는 fidelity reference
- Hokusai가 표현하지 못하는 brush setting 비교
- import compatibility와 회귀 테스트 기준
- 실제 브러시 corpus 확대

현재 parity 테스트는 구성 자체는 좋지만 brush corpus가 두 개이고 대형 브러시 테스트도 약 180px proxy입니다. 1,000px brush, 장시간 wet stroke, smudge, random dynamics를 실제 gate에 넣어야 합니다.

#### CanvasKit

- path operation
- font/text shaping 결과 검증
- 고해상도 export oracle
- 브라우저별 픽셀 비교

#### Paper.js·Lyon

- Paper.js: 편집 친화적 vector geometry
- Lyon: 긴 path tessellation WebAssembly 후보
- 제품 문서에는 provider 객체가 아니라 plain geometry만 저장

#### Vello CPU

- deterministic vector reference
- golden renderer
- export 후보

### `engine-labs`에 격리

- Vello Hybrid
- Pixi WebGPU
- p5.brush
- Glance
- WESL custom shader
- Photon
- tiny-skia
- experimental bristle solver
- WebGPU fluid solver

격리 기준은 단순 feature flag가 아니라 별도 package boundary여야 합니다.

### 축소 또는 제거

#### Konva

단계적으로 다음 역할만 남깁니다.

1. 기존 문서 호환 표시
2. selection transformer
3. text 편집 overlay
4. 접근성용 DOM companion

브러시, filter, raster layer composite 권위에서는 제거합니다.

#### 중복 3D 엔진

Three, Babylon, Pixi가 모두 production scene owner가 되면 안 됩니다. 3D 문서 의미와 viewport renderer의 주 소유자를 하나로 정하고, 나머지는 importer·전문 provider·실험으로 제한해야 합니다.

---

## 9. 에디터 엔진의 공격적 고도화

### 명령과 receipt 기반 Event-Sourced Editor

모든 문서 변경은 다음 형태를 갖도록 합니다.

```ts
interface StudioCommand {
 id: CommandId;
 documentId: DocumentId;
 baseRevision: Revision;
 actorId: ActorId;
 payload: unknown;
}

interface CommandReceipt {
 commandId: CommandId;
 acceptedRevision: Revision;
 inverse?: StudioCommand;
 dirtyRegions: readonly TileRegion[];
 assetRefs: readonly AssetHash[];
 durableState: "memory" | "opfs" | "server";
}
```

이렇게 하면 undo, autosave, collaboration, export invalidation이 각자 문서를 재해석하지 않아도 됩니다.

### CRDT에는 픽셀을 직접 넣지 않습니다

협업 동기화 대상은 다음입니다.

- stroke command
- vector object
- layer operation
- text operation
- camera·timeline keyframe
- comment
- asset hash

대형 tile byte는 content-addressed blob 또는 checkpoint로 전송합니다. CRDT에 수백 MB 픽셀을 직접 넣으면 병합과 메모리가 비효율적입니다.

### Tool State Machine

브러시 도구 예시는 다음과 같습니다.

```text
idle
 └─ pointerDown
 ↓
capturing
 ├─ move → appendAcceptedSamples
 ├─ cancel → rollbackTransient
 └─ pointerUp
 ↓
settling
 ├─ naturalMediaStep
 ├─ commitTiles
 └─ receipt
 ↓
durablePending
 ├─ OPFS success → idle
 └─ failure → recoveryRequired
```

device loss, pointer cancel, route change, collaboration lock가 각각 어떤 상태에서 허용되는지 명시할 수 있습니다.

### Plugin SDK

플러그인은 React 내부 상태나 GPUDevice를 직접 받지 않고 capability를 요청해야 합니다.

```ts
interface StudioPluginManifest {
 commands?: CommandContribution[];
 panels?: PanelContribution[];
 importers?: FormatContribution[];
 brushes?: BrushContribution[];
 effects?: EffectContribution[];
 requiredCapabilities: StudioCapability[];
 resourceBudget: PluginResourceBudget;
}
```

실행 환경은 다음 세 가지로 구분합니다.

- UI iframe/Worker sandbox
- deterministic WASM kernel
- 제한된 shader DSL

---

## 10. 코드 고도화 세부 방안

### source-string 테스트 제거

현재 일부 테스트가 여러 파일의 소스 문자열을 이어 붙여 특정 import나 심볼 문자열이 있는지 검사합니다. 이는 리팩터링을 막고 실제 동작보다 파일 모양을 보존합니다.

다음 테스트로 교체해야 합니다.

- public API type contract
- dependency graph contract
- mounted lifetime test
- command receipt test
- pointer behavioral test
- visual golden
- worker protocol test
- bundle chunk test
- durability recovery test

### Zod 위치 제한

Zod는 다음 경계에서만 사용합니다.

- 네트워크
- 파일 import
- worker initial handshake
- persisted checkpoint
- plugin manifest

포인터 샘플이나 frame loop 안에서는 사용하지 않습니다. hot path에는 검증 완료된 packed typed array를 전달합니다.

### 브라우저 API 중앙화

다음 접근은 feature 컴포넌트에서 금지합니다.

- `navigator.gpu`
- `navigator.storage`
- `indexedDB`
- `showOpenFilePicker`
- `new Worker`
- `OffscreenCanvas`
- `WebSocket`

각각 infrastructure adapter가 소유해야 합니다.

### GPU 리소스 수명

모든 GPU resource에 owner generation을 둡니다.

```ts
interface GpuResourceHandle<T> {
 generation: number;
 owner: RuntimeOwnerId;
 byteSize: number;
 resource: T;
 release(): void;
}
```

문서 전환, route 전환, device loss 시 이전 generation callback이 새 세션에 반영되지 않도록 차단합니다.

### 패키지 명세에서 V11/V12 제거

현재 여러 패키지 description과 주석이 특정 설계 문서의 “V11”, “V12” 단계에 묶여 있습니다. 패키지의 장기적 의미를 버전 번호가 아닌 책임으로 설명하는 것이 좋습니다.

예:

- `V11 input pipeline` → `engine-neutral pointer and stroke compilation pipeline`
- `V11 stable IR` → `canonical Studio document and command contracts`

### 문서 자동 생성

현재 매뉴얼은 중앙 캔버스를 “WebGPU 기반”이라고 설명하지만, 현행 경계 감사에서는 Konva가 표시와 포인터 권위를 유지한다고 명시합니다. 이와 같은 문서·제품 상태 차이를 줄여야 합니다.

다음은 registry에서 자동 생성합니다.

- 지원 브라우저
- 활성 엔진
- 브러시 provider 수
- import/export 지원 상태
- experimental 기능
- 현재 fallback
- 미지원 setting

---

## 11. 단계별 전환안

### P0 — 권위와 계약 정리

가장 먼저 해야 할 작업입니다.

- `.myb` 실제 spacing 키 수정
- `smudge` disposition 수정
- 실제 MyPaint corpus 기반 테스트
- Hokusai route 수 문서 불일치 정리
- 모든 렌더러 역할을 `primary / provider / reference / lab` 중 하나로 고정
- 새 코드의 `any`·raw setter·host import 금지
- Quick Start를 비모달로 변경
- 신규 문서 기본 브러시 진입

완료 조건:

- 적용한 setting을 `unmapped`로 표시하는 사례 0건
- product renderer authority 1개
- command authority 1개
- 신규 UI가 host setter를 직접 받지 않음

### P1 — EditorClient와 런타임 분해

- `EditorClient` 도입
- `StudioDocumentRuntime`
- `ToolRuntime`
- `ViewportRuntime`
- `DurabilityRuntime`
- `CollaborationRuntime`
- UI를 selector + command 방식으로 전환
- `ViewSessionCore/Rest` 제거 시작
- React Compiler 및 Hooks 규칙 feature별 복구

완료 조건:

- `StudioCuttoonEditorHost`는 runtime 조합과 shell mount만 담당
- host 목표 크기 500~1,000행
- feature 공개 타입에 `any` 없음
- raw React setter가 feature 경계를 넘지 않음

### P2 — WebGPU Shadow Renderer

기존 Konva 결과와 병렬로 GPU 결과를 생성하되 사용자에게는 기존 결과를 보여줍니다.

- Worker-owned GPUDevice
- committed raster tile composite
- brush transient surface
- dirty tile tracking
- pixel diff
- frame timing
- memory pressure 측정
- device-loss recovery

완료 조건:

- 주요 브러시 visual corpus 허용 오차 통과
- stroke hot path GPU readback 0회
- pointer 중 main-thread long task 0회
- 새 GPU 경로가 disabled 상태에서도 문서 의미 동일

### P3 — WebGPU Writable Tile Authority

- 신규 문서부터 GPU tile을 authoritative raster로 사용
- Konva는 selection/text overlay
- OPFS tile shard와 command journal 연결
- accepted-prefix durability
- migration adapter
- 브라우저 capability profile 적용

완료 조건:

- 새 문서에서 Canvas2D brush commit 없음
- device loss 후 checkpoint 복구
- 동일 command log 재생 결과가 허용 범위 내 결정적
- 대형 문서에서 resident memory 예산 유지

### P4 — BrushGraph V2

- Tip/Material/Deposition/Simulation graph
- Hokusai native payload + editable projection
- WebGPU wet media
- bristle/rake
- dual tip
- vector-raster editable proxy
- plugin brush DSL

완료 조건:

- 1,000px 실제 브러시 테스트
- 30분 연속 스트로크 stress
- 수채화 settle 중 UI 응답성 유지
- live/commit/export 품질 불일치 없음

### P5 — Legacy 제거

- Konva 브러시 픽셀 권위 삭제
- Canvas2D 긴 획 경로 삭제
- source-string 테스트 삭제
- closure bag 삭제
- 린트 예외 삭제
- 실험 패키지의 제품 직접 import 삭제

---

## 12. 반드시 운영 지표로 잡아야 할 기준

### 입력과 표시

- 120Hz 장치에서 pointer-to-visible p95 목표: 한 frame 이내
- 60Hz 저사양 장치에서 p95 목표: 두 frame 이내
- 실제 sample과 predicted sample을 분리 측정
- pointer move 중 50ms 이상 main-thread long task 0건

### GPU

- stroke hot path GPU→CPU readback 0회
- frame마다 pipeline 생성 0회
- texture allocation은 pool 사용
- GPU byte budget 초과 시 명시적 degradation
- device loss 복구 테스트

### 메모리

- 문서 전체 raster resident 금지
- visible + active wet + undo window만 resident
- per-stroke 고정 dab 상한 대신 byte/time budget
- 8시간 soak test에서 증가 추세 없음

### 내구성

- accepted command prefix가 checkpoint 이후 항상 재생 가능
- pointerup 직후 탭 종료 복구
- quota 부족 복구
- OPFS corruption 시 마지막 정상 checkpoint 복구
- 협업 follower → leader 전환 중 중복 저장 방지

### 품질

- 실제 MyPaint brush corpus
- pen, pencil, watercolor, oil, smudge, eraser
- 작은 점, 긴 선, 고속 flick, 느린 곡선
- 압력 0→1 및 1→0
- tilt/twist
- 1,000px 브러시
- Chrome, Safari, Firefox 및 주요 GPU vendor 비교

---

## 최우선 실행 항목

| 우선순위 | 작업 | 이유 |
|---:|---|---|
| 1 | `.myb` spacing·smudge 계약 수정 | 이미 확인된 실제 호환성 오류 |
| 2 | Renderer Role Registry 고정 | 엔진을 더 추가하기 전에 권위 충돌 차단 |
| 3 | `EditorClient` 도입 | UI setter와 closure bag 분해의 시작점 |
| 4 | `ViewSessionCore/Rest` 제거 | 유지보수성의 가장 큰 병목 |
| 5 | Quick Start 비모달화·기본 브러시 진입 | 가장 저렴한 UX 효과 |
| 6 | `studio-project-model` 책임 분리 | 패키지 의존 방향 정상화 |
| 7 | 웹 앱을 `apps/studio-web`로 이동 | discovery와 편집기 배포·번들 분리 |
| 8 | WebGPU Worker shadow compositor | 낮은 위험으로 실제 성능 데이터 확보 |
| 9 | OPFS command journal + tile shard 연결 | 대형 문서와 복구의 기반 |
| 10 | BrushGraph V2 | 자연 매체·플러그인·provider 수렴 기반 |

### 최종 판단

ToonSpectrum은 WebGPU 편집기로 고도화할 수 있는 준비가 상당히 되어 있습니다. 현재의 문제는 기술 난이도보다 **제품 경로의 권위가 Konva, Canvas2D, WebGPU island, 여러 WASM provider 사이에 분산돼 있다는 것**입니다.

가장 공격적이면서도 성공 가능성이 높은 방향은 다음 한 문장으로 정리됩니다.

> **React는 UI만, Worker는 편집기 세션을, WebGPU는 화면 픽셀을, WASM은 결정적 커널을, OPFS는 내구성을 소유하고, 모든 외부 엔진은 명확한 provider 역할만 갖도록 재편해야 합니다.**

이 순서를 지키면 Hokusai, libmypaint, Krita, Vello, CanvasKit, Pixi 등의 실험 자산이 부채가 아니라 강력한 “전문 엔진 포트폴리오”가 됩니다. 반대로 6만 줄 host와 복수 렌더링 권위를 유지한 채 엔진만 더 추가하면 성능은 일부 개선되더라도 전체 복잡도와 회귀 위험이 더 빠르게 증가합니다.
