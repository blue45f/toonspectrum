# SHAPER 패리티 체크리스트 — character-lab 집계표

상태: current (집계 2026-10-02 00:55 UTC, core 작성). 영역 원본은 `docs/parity/{state,humanoid,outfit,animation,render,export,vision}.md`이며
이 표는 그 원본과 디스크의 테스트 파일을 core가 합친 것이다. 7개 영역 원본이 모두 제출되어 "(임시)" 행은 없다(render는 render-beta 갱신본, 2026-10-02).

최종 실행 기록(typecheck·테스트 파일/케이스 수·eslint·build·프로브)은 §15에 있다. **실GPU(하드웨어)·WebGPU 검증은 하나도 수행하지 못했다.**
2026-10-02부터 소프트웨어 렌더러(SwiftShader) WebGL2 실브라우저 실측이 일부 행에 있고(§13, 약칭 SW), 이는 가시성·알파 규약·콘솔 오류 수준의 증거일 뿐 실GPU 품질·성능 증거가 아니다.

열 의미
- **구현 상태**: 구현됨 / 부분 / 미구현 / 구현 중(임시)
- **Node 검증**: 이 컨테이너(GPU 없음)에서 vitest로 통과한 테스트 파일(`src/` 기준 경로)
- **브라우저 검증**: `미검증` 또는 `YYYY-MM-DD·기기·backend`(README §4 절차 수행 후 기록). `SW` = 소프트웨어 렌더러(SwiftShader) WebGL2 실측(§13)
- **비고**: 베타 표기·사유·다른 영역 의존

요구 1~11은 사용자 요구(LEAD_BRIEF §1)를 다음과 같이 나눈 것이다: ① 15슬롯 프리셋 조립 ② 파라메트릭 체형·얼굴 ③ 표정·포즈·손(+IK·관절 드래그)
④ 게임엔진급 렌더링(PBR/IBL/그림자/후처리/툰, WebGPU/WebGL2 명시 선택) ⑤ 헤어·의상 2차 물리 ⑥ 모델 위 드로잉(UV 페인트) ⑦ 투명 배경 PNG
⑧ 레시피 저장/불러오기·glTF ⑨ 레이어 PSD ⑩ 참고 이미지 추천·사진 포즈 인식 ⑪ Blender 제작 패키지 레인. 마지막 §12는 셸·경계(core) 공통 품질이다.

## 1. 15슬롯 프리셋 조립 (SHAPER 14 카테고리 + 표정)

| 항목 | 구현 상태 | Node 검증 | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| 15슬롯 어휘·한글 라벨·그룹(얼굴/몸·의상/연기) 동결 | 구현됨 | `contracts/slots.test.ts` | — | `CHARACTER_SLOT_KINDS`, 절차·제작 소스 공통 키 |
| 슬롯별 프리셋 id 어휘(외형 ≥4·표정 ≥12·포즈 ≥10·손 ≥8, Blender HairStyle 6종 포함) | 구현됨 | `contracts/preset-vocabulary.test.ts` | — | `SLOT_PRESET_IDS`, `MIN_PRESETS_PER_SLOT` |
| 외형 12슬롯 × 64 프리셋(patch·requires·conflictsWith) | 구현됨 | `presets/appearance-presets.test.ts` | 미검증(썸네일 픽셀) | state-presets 원본 §1 |
| 연기 30 프리셋(표정 12·포즈 10·손 8) 카탈로그 항목 | 구현됨 | `animation/presets/index.test.ts` | 미검증 | animation 원본 |
| 카탈로그 병합(64+30)·불변식(id 유일·어휘·patch 스키마·본 이름·정규화·슬롯 최소 개수) | 구현됨 | `contracts/catalog.test.ts`, `app/shell/catalog-registry.test.ts`, `app/shell/lab-runtime.test.ts` | — | 위반은 failure 이벤트로 노출하고 런타임은 계속 만든다 |
| 슬롯 탭 15 + 카드 그리드 + 선택 표시 + 카드 클릭 = `slot/apply` 1회 | 구현됨 | `app/shell/panels/SlotPanel.test.tsx`(jsdom) | 미검증(레이아웃) | 액세서리 "없음" 카드 |
| 슬롯 능력 배지(unavailable=disabled+사유, partial=경고+사유), 미지원 프리셋 "미적용"+사유, 충돌 "겹침 주의" | 구현됨 | `SlotPanel.test.tsx`, `state/apply-plan.test.ts` | — | 다른 프리셋으로 대체하지 않음 |
| 썸네일 카드(ready/pending/failed 사유), 가시 슬롯 우선 직렬 큐, 캐시 키(슬롯·patch 키 제외·셰이딩 모드) | 구현됨 | `app/shell/thumbnail-scheduler.test.ts`, `app/shell/thumbnail-driver.test.ts`, `state/thumbnail-cache.test.ts` | 미검증(썸네일 픽셀) | `renderThumbnail`은 엔진; core가 catalog를 4번째 인자로 넘겨 재생성 최소화. 소스 로드·첫 적용이 끝난 뒤에만 요청(`applyLoop.settled()`). 지오메트리 슬롯 7개는 임시 소스로 프리셋별로 그려진다(§4·§12) |
| 슬롯 레일(15칸, 현재 프리셋·능력 배지) | 구현됨 | `app/shell/SlotRail.test.tsx`(jsdom) | 미검증 | core |
| 레시피 reducer(명령 11종)·undo/redo 1 명령 = 1단계·coalesce 250 ms·용량 200 | 구현됨 | `state/recipe-reducer.test.ts`, `state/history.test.ts`, `state/lab-store.test.ts` | — | 거부 명령은 failures에 한글 사유 |

## 2. 파라메트릭 체형 9 · 얼굴 15

원본: [`parity/humanoid.md`](parity/humanoid.md)(humanoid, 14파일·152케이스 자체 실측).

| 항목 | 구현 상태 | Node 검증 | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| 파라미터 키·범위·클램프, morph 이름 규칙(`param:<key>:±`)·FACS 16 이름·Blender 별칭 24 | 구현됨 | `contracts/morph-names.test.ts` | — | core 계약 |
| 플랜: 파라미터 ± 분리 가중치 [0,1], 파츠 가시성·재질·색 | 구현됨 | `state/apply-plan.test.ts` | 미검증(엔진 반영) | state-presets |
| 절차 휴머노이드 케이지(몸 쿼드 1,076·머리 589, 닫힌 다양체·좌우 거울)·Catmull-Clark 0/1/2회·UV 아틀라스 | 구현됨 | `domains/humanoid/geometry/{cage,head-cage,subdivision,sweep,uv-layout}.test.ts` | 미검증(텍스처 이음매) | 기본 세분 1 = 정점 12,987 · 삼각형 22,052(≤140k 예산) |
| 입(구멍·주머니·턱 jaw 웨이트)·눈 4파츠×6×5 스타일·눈썹·속눈썹·치아·혀 | 구현됨 | `geometry/{mouth-pocket,small-parts}.test.ts`, `skeleton/jaw-weights.test.ts`, `humanoid-model.test.ts` | 미검증 | 입 안 UV 섬 어둡게는 render가 구현(§4 `render/mouth-shade`, 화면 시각 확인은 미검증) |
| 체형 9 ± = 18 morph·얼굴 15 ± = 30 morph·FACS 16 델타(필드 기반 컴팩트 서포트, 좌우 대칭·누출 점검) | 구현됨 | `domains/humanoid/morph/morph.test.ts`, `humanoid-model.test.ts` | 미검증 | morph 이름 64개(계약 동결). 연구 목표 100+(ARKit 52 확장)는 미구현 |
| 55본 rest 스켈레톤·충돌 캡슐 14·자동 스킨 웨이트(캡슐 거리+라플라시안)·CPU 스키닝 참고 구현 | 구현됨 | `domains/humanoid/skeleton/skeleton.test.ts`, `humanoid-model.test.ts` | 미검증(GPU 스키닝 일치) | |
| 체형 morph가 움직이는 관절 위치(`HumanoidModelData.jointOffsets`): 생성(humanoid) + 엔진 소비(render: 본 rest에 w×오프셋, 역바인드 재생성) | 구현됨 | `domains/humanoid/humanoid-model.test.ts`·`morph/morph.test.ts`(새 팔꿈치 기준 회전 거리 보존), `render/babylon-joint-offsets.test.ts`(해석적 기대값), `app/render-humanoid-link.integration.test.ts`(실제 humanoid 결과 ↔ 기준 구현 1e-4 m) | 간접 확인만(§4): 메시 자체의 GPU 스키닝 직접 비교 미검증 | core가 `jointOffsets?`를 계약에 올렸고(2026-10-01) render-beta가 소비를 구현해 humanoid 원본 §4.1 요청을 닫았다 |
| `buildHumanoidModel`(outfit DI 병합·규약 적용·재생성 키 `geometryKeyOf`·역할 고정 partId) | 구현됨 | `domains/humanoid/humanoid-model.test.ts`, `app/humanoid-outfit.integration.test.ts`(실제 outfit·플래너·물리), `app/composition.test.ts`, `app/null-engine.integration.test.ts`(skipped 0) | 미검증(실제 렌더 형상) | composition이 `buildHumanoidModel`을 꽂았다. partId 팔레트는 희소할 수 있다(`allocatePartIds` 주석에 예외 명시) |
| 메시 파츠 정합성(`validateMeshPartData`)·partId 할당 | 구현됨 | `contracts/mesh-data.test.ts`, `app/shell/procedural-source.test.ts` | — | core |
| ParamPanel(슬라이더 coalesceKey·숫자 입력·팔레트·신체 지표 요약) | 구현됨 | `app/shell/panels/ParamPanel.test.tsx`(jsdom 15케이스) | 미검증(레이아웃) | composition 조립 완료, `cl-param-*` 스타일은 core CSS |

## 3. 표정 · 포즈 · 손 포즈 (+IK · 관절 드래그)

| 항목 | 구현 상태 | Node 검증 | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| 55본 어휘·부모 트리·IK 체인·스코프·관절 제한 표 | 구현됨 | `contracts/bones.test.ts` | — | core |
| 해석적 two-bone IK(폴·각 제한·도달 불가 사유) | 구현됨 | `animation/two-bone-ik.test.ts` | 미검증 | animation |
| IK 목표(손·발 4체인) → Pose, swing-twist 클램프 보고 | 구현됨 | `animation/ik-apply.test.ts` | 미검증 | |
| FABRIK 보조 체인(척추·손가락, 원뿔·힌지) | 구현됨 | `animation/fabrik.test.ts` | 미검증 | 연구 채택 기법 |
| 관절 제한 분해·클램프·위반 목록 | 구현됨 | `animation/joint-limits.test.ts` | 미검증 | |
| 관절 드래그(화면 평면 회전→로컬 포즈→클램프) | 구현됨 | `animation/joint-drag.test.ts`, `app/shell/panels/viewport-interactions.test.ts` | 미검증(실제 핸들 드래그·1 드래그 = 1 undo 단계) | 뷰포트 핸들은 ViewportPane(render, 조립 완료) |
| 표정 합성(프리셋+FACS 슬라이더 우선·길항 완화)·포즈 스코프 병합 | 구현됨 | `animation/expression-blend.test.ts`, `animation/pose-blend.test.ts` | 미검증 | |
| 표정 12·포즈 10·손 8 프리셋 데이터 | 구현됨 | `animation/presets/{expression,pose,hand-pose}-presets.test.ts` | 미검증 | 자체 저작(`license: "original"`) |
| 참조 스켈레톤·FK | 구현됨 | `animation/reference-skeleton.test.ts`, `animation/skeleton-fk.test.ts` | — | |
| PosePanel(카드·스코프 4·IK 목표·폴·클램프)·ExpressionPanel(카드·세기·FACS 16 슬라이더) | 구현됨 | `app/shell/panels/PosePanel.test.tsx`, `app/shell/panels/ExpressionPanel.test.tsx`(jsdom) | 미검증 | `expression/set`의 `coalesceKey?`는 state(f8026bd3)가 history에 전달해 슬라이더 드래그가 1 undo 단계로 병합된다 |

## 4. 게임엔진급 렌더링 — 웹 WebGPU/WebGL2 명시 선택

원본: [`parity/render.md`](parity/render.md)(render 영역 + render-beta 갱신, 2026-10-02). 이 컨테이너에는 실GPU가 없다. Node에서는 **NullEngine**까지,
이번 집계부터 Chrome 151 + **SwiftShader(소프트웨어 렌더러) WebGL2**로 실브라우저 실측을 더했다(아래 '브라우저 검증' 열의 `2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2` 표기).
이 실측은 셰이더 컴파일·픽셀 존재·상대 비교·콘솔 오류까지만 보증하며 **실GPU 품질·성능·WebGPU 경로의 증거가 아니다**(WebGPU는 소프트웨어 폴백 어댑터라 `webgpu-fallback-adapter`로 차단되는 것이 정상).
베타 기능 4종은 기본 꺼짐이며 엔진 능력을 확인하고 지원하지 않으면 한글 사유와 함께 켜지지 않는다(자동 대체 없음). 토글은 엔진 세션 상태라 레시피(`ShadingProfile`, core 동결 strict 계약)에 저장하지 않는다.

| 항목 | 구현 상태 | Node 검증 | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| backend 선택: `probeGpu`(requestAdapter만) + `selectBackend`(요청 backend만 판정, 소프트웨어 어댑터·한계 미달 등 차단 사유) | 구현됨 | `render/capability/select-backend.test.ts` | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2: WebGPU 명시 선택 → `[webgpu-fallback-adapter]` 사유가 배너에 보이고 WebGL2는 자동 생성되지 않음(프로브). 실 어댑터 성공 경로 미검증 | 자동 대체 없음 |
| 엔진 세션: 차단→failed·factory 미호출, 초기화 실패/timeout(15 s)→failed·WebGL2 미생성, ready·diagnostics, device lost→lost, 겹친 선택 세대 처리 | 구현됨 | `app/shell/engine-session.test.ts` | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2: WebGL2 ready·diagnostics(어댑터 문자열)가 TopBar·HUD에 표시. 실제 `device.lost` 미검증 | core; 엔진 모듈은 composition의 동적 import 1곳 |
| 엔진 팩토리(WebGPU `initAsync`·WebGL2 옵션·timeout·부분 disposer·device.lost→lost·fallback 없음)·Babylon import 정책(서브패스·side-effect 한 곳·직렬화 청크) | 구현됨 | `render/engine-init.test.ts`, `render/babylon-engine-factory.test.ts`(실제 Babylon 생성자·`navigator.gpu` 스텁), `render/babylon-import-policy.test.ts`, `architecture.test.ts` | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2: WebGL2 `Engine` 생성 성공. WebGPU 성공 경로·실제 device.lost 미검증 | 빌드 청크: 진입 `index` 945 kB, 엔진 `babylon-character-engine` 881 kB, 지연 청크 `node-toon-material` 200 kB·`ibl-shadows` 78 kB·`openpbr*`·`rapier` 2.3 MB·`vision_bundle` 135 kB(§15) |
| 장면(우수 좌표·투명 clear·톤맵·key/fill 광원·캡처 카메라, 절차 메시 CCW 감김)·캐스케이드 그림자(CSM·PCF/PCSS, 미지원 시 단일 생성기 + 사유) | 구현됨(가용성 게이트) | `render/babylon-character-engine.test.ts`, `render/camera-framing.test.ts`, `render/scene-features.test.ts`, `render/babylon-render-integrations.test.ts` | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2: 장면이 뜨고 PBR·툰 캡처 성공(전신 T-포즈 캐릭터 가시). 그림자 품질 미검증 | **결함 수정(render)**: 앞면 컬링으로 툰·법선 패스가 뒷면을 그리던 것 |
| 절차 소스 바인딩(VertexData·스킨 4가중치·morph·partId)·제작 패키지 GLB 로드(실제 Orion 등 2종)·헤어 LOD/`_Outline` 정책 | 구현됨 | `render/babylon-character-engine.test.ts`, `render/babylon-package-load.test.ts`(31) | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2: 절차 소스 형상 확인(캡처·스크린샷). 제작 패키지 GLB 렌더(텍스처 디코드·KHR 재질)는 미검증 | 규약 밖 메시는 숨기고 한글 notes |
| **PBR 재질**(피부 SSS·헤어 이방성·눈 클리어코트·의상 sheen)·**툰 ShaderMaterial**(GLSL+WGSL 2벌, 램프·림·얼굴 SDF 그림자·hull/edge 외곽선) | 구현됨 | `render/material-presets.test.ts`(확산 프로파일 g==b 불변식), `render/shader-sources.test.ts`, `render/face-sdf.test.ts`, `render/toon-reference.test.ts`(CPU 기준식=셰이더 상수), 엔진 테스트 | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2: **PBR lit 12.6 %·툰 lit 13.3 % 불투명 면적**(프로브, 1024² 투명 PNG), GLSL 컴파일 성공, 진단 console 오류 0. **WGSL·WebGPU·실GPU 셰이딩 품질 미검증** | **결함 수정(실브라우저로 발견, render)**: IBL 텍스처가 임시 장면과 함께 파괴돼 PBR이 영원히 미준비(lit 완전 투명)·캡처가 재질 준비를 기다리지 않음·Babylon `addDiffusionProfile` (r,b,g)/(r,g,b) 불일치로 console.error 113회·툰 과노출(광원+환경 합 정규화) |
| **NodeMaterial 툰(베타)** — 코드 구성 그래프 120블록, `ToonParams`가 기본 툰과 동일 의미 | 구현됨(베타, 기본 꺼짐) | `render/babylon-node-toon.test.ts`(그래프 해석기 = CPU 기준식, 무작위 300 프래그먼트 1e-9), `render/babylon-beta-features.test.ts` | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2(render 실측): 기본 툰과 픽셀 차이 0. WGSL·WebGPU 미검증 | PBR 모드에서 켜면 '대기'(툰 전용). 동적 청크 |
| **IBL Shadows(베타)** — `IblShadowsRenderPipeline` | 구현됨(베타, 능력 게이트) | `render/babylon-beta-features.test.ts`(가짜 파이프라인 10: 게이트·수명·dispose 누수 0) | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2(render 실측, 노이즈 PNG는 playwright 라우트 스텁): 켜면 화면이 달라지고 끄면 원래와 같음. 실GPU 그림자 품질·실제 노이즈 수신 미검증 | PBR·OpenPBR만 그림자를 받음. 외부 요청(assets.babylonjs.com) UI에 고지 |
| **OpenPBR(베타)** — `OpenPBRMaterial`, 프리셋 파라미터 매핑 | 구현됨(베타, 능력 게이트) | `render/openpbr-mapping.test.ts`, `render/babylon-beta-features.test.ts`, `render/babylon-capture-readiness.test.ts` | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2(render 실측, 노이즈 PNG 스텁): lit 가시, 기본 PBR과 12.6 % 픽셀 차. 스텁 없는 실제(외부 차단) 상황은 render.md §7.2 참조. 실GPU 품질 미검증 | **페인트 데칼 불가**(OpenPBR에 decalMap 없음)·SSS 근사를 UI에 고지 |
| **투영 페인트(베타)** — `MeshUVSpaceRenderer` + `projection-paint-driver`(overlay→`PaintLayer` 합성, 스트로크당 `paint/stroke` 1토큰) | 구현됨(베타, GPU readback 레인만) | `render/projection-paint.test.ts`, `render/babylon-beta-features.test.ts`, `app/shell/panels/projection-paint-driver.test.ts`(23: undo 바이트 원복·redo·보간·읽기 중 새 스트로크 거절) | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2(render 실측): 스탬프 10회 모두 CPU pick UV 위치에 알파 255(행 순서 뒤집힘 없음). 포인터 흐름(ViewportPane) 통합·실GPU 미검증 | 한계: sRGB 블렌딩 미세 차이·얇은 부위 반대편 미도장·UV 랩 없음·NullEngine 불가 |
| 절차 스카이 IBL(`HDRFiltering.prefilter`)·후처리(FXAA·블룸·샤프닝·MSAA, SSAO2·TAA 베타, 가용성 게이트) | 구현됨 | `render/procedural-sky.test.ts`, `render/babylon-render-integrations.test.ts`(IBL이 엔진의 실제 장면에서 생성됨), 엔진 테스트 | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2: IBL 환경 텍스처가 장면 수명과 같아 PBR 준비됨. 후처리 품질 미검증 | NullEngine은 IBL·TAA 미지원 → `unavailable` 사유(거짓 '활성' 결함 수정) |
| 멀티패스 캡처(flat·lit·normal·depth·part-id·material-id)·readback 변환·**재질 준비 폴링(`material.isReady(mesh)`, 90 s 초과 시 `capture-shader-timeout` LabFailure)**·캡처 직렬화·HUD(p95·gpu ms) | 구현됨 | `render/babylon-capture.test.ts`, `render/babylon-capture-readiness.test.ts`, `render/material-readiness.test.ts`, `render/readback.test.ts`, `render/frame-stats.test.ts`, `render/synthetic-projection.test.ts`, `app/null-engine.integration.test.ts` | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2: flat·lit·normal·part-id 패스 모두 비어 있지 않음, 투명 PNG 알파 규약(모서리 0·투명 RGB 0) 통과(프로브). **readPixels 행 순서·premultiply 상수(`RTT_READBACK_*`)는 실GPU·WebGPU 미검증** | NullEngine은 `provenance.synthetic=true`·`backend="null"` 합성 래스터 |
| 썸네일(현재 리그에 플랜 일시 적용) + 임시 소스(`thumbnailSources`, `ThumbnailRequest.source`)로 지오메트리 프리셋 카드를 그 프리셋으로 그림 | 구현됨 | `render/babylon-thumbnail.test.ts`(11), `app/null-engine.integration.test.ts`, `app/composition.test.ts` | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2: 슬롯 카드 썸네일 6개 pending→이미지·실패 0(프로브), 헤어 카드마다 모양이 다름(2026-10-01 스크린샷). 실GPU 미검증 | core가 level 0 임시 절차 소스를 만들어 보낸다 |
| pick(스킨·morph 반영 삼각형 레이캐스트)·페인트 텍스처 업로드(`invertY=false`)·물리 다리(DI provider)·GLB export(+**dense morph → sparse 정리**, Orion 12.36→3.61 MB) | 구현됨 | `render/babylon-paint-pick.test.ts`, `render/triangle-pick.test.ts`, `render/babylon-physics-bridge.test.ts`, `render/glb-sparse-morph.test.ts`, `render/babylon-glb-sparse-export.test.ts` | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2(render 실측): GLB 3.12→2.15 MB(기본 절차 캐릭터). 외부 뷰어에서 sparse가 열리는지·페인트 decal 합성·UV 방향 미검증 | render가 `pickWithRay`의 bind 포즈 결함을 자체 레이캐스트로 교체 |
| **체형 morph 관절 오프셋 소비**(`HumanoidModelData.jointOffsets`: 본 rest에 w×오프셋, 역바인드를 morph된 rest에서 재생성) | 구현됨 | `render/joint-offsets.test.ts`, `render/babylon-joint-offsets.test.ts`(해석적 기대값 <0.01 mm, 대조군 70 mm 어긋남), `app/render-humanoid-link.integration.test.ts`(실제 `buildHumanoidModel` 결과가 humanoid 기준 구현과 1e-4 m 일치) | 간접 확인만(2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2: 팔 길이·팔 들기 상태의 투영이 CPU pick과 0 px 일치). 메시 자체의 GPU 스키닝 직접 비교 미검증 | humanoid §4.1 요청을 닫음 |
| **머리 morph 54개 텍스처 모드·한계 보고**·**입 안 UV 섬 어둡게** | 구현됨 | `render/morph-limits.test.ts`, `render/babylon-render-integrations.test.ts`, `render/mouth-shade.test.ts`, `app/render-humanoid-link.integration.test.ts`(UV 레이아웃 상수 일치) | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2: morph 54타깃 텍스처 모드·층 한계 2048·약 3.3 MB. **화면에서 입 안이 실제로 어두운지 시각 확인은 미검증** | humanoid §4.2·§4.3 요청을 닫음. Babylon이 층 한계 초과 시 무음 attribute 모드(8개)로 내려가는 것을 사유와 함께 보고 |
| ViewportPane(캔버스 등록·도구 막대 프레이밍 3종·HUD·관절 핸들 SVG·드로잉 오버레이)·RenderPanel(모드·품질·톤맵·그림자·후처리·IBL·툰 옵션·**베타 4 토글**·가용성 표·HUD 표) | 구현됨 | `app/shell/panels/ViewportPane.test.tsx`(29), `viewport-interactions.test.ts`(12), `render/viewport-math.test.ts`, `app/shell/panels/RenderPanel.test.tsx`(30), `app/composed-app.smoke.test.tsx` | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2: 캔버스에 캐릭터·관절 핸들·HUD 표시, 렌더 탭 마운트(프로브). 실제 포인터·카메라 조작·관절 드래그·키보드 미검증 | composition 조립 완료, `cl-viewport-*`·`cl-render-*` 스타일은 core CSS(HUD는 우상단 모서리에 가둠) |
| 엔진 상태 배지·실패 배너(코드·한글 사유·detail 접기·닫기만) | 구현됨 | `app/shell/engine-status-text.test.ts`, `app/shell/FailureBanner.test.tsx`, `app/shell/TopBar.test.tsx` | 2026-10-02·Chrome for Testing 151 headless·Linux·SwiftShader(소프트웨어 렌더러)·webgl2: WebGPU 차단 사유가 배너에 `[코드]: 사유`로 표시(프로브) | core |

## 5. 헤어 · 의상 2차 물리

원본: [`parity/outfit.md`](parity/outfit.md)(outfit-physics, 19파일·56케이스 자체 실측).

| 항목 | 구현 상태 | Node 검증 | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| 물리 계약(ChainDef·ChainAnchor·캡슐·영수증·한도) | 구현됨 | `contracts/recipe.test.ts`·`contracts/mesh-data.test.ts`(스냅샷) | — | core, `character-physics.md` 반영 |
| 헤어 7 스타일(카드·스트랜드 번들·구역 데이터·`hair_<style>_<i>_<j>` 보조 본·ChainAnchor·결정성) | 구현됨 | `domains/outfit/hair-builder.test.ts` | 미검증(이방성·알파 카드 표시) | |
| 상의 5·하의 5(스커트 `skirt_*` 체인)·신발 4·액세서리 6 절차 파츠, 몸 스킨 웨이트 상속, 체형 morph 전파·관통 ≤ 1% | 구현됨 | `domains/outfit/{garments,follow-body,index}.test.ts` | 미검증(재질 표시) | `createOutfitBuilder`, 조립 규약은 humanoid가 적용(§2) |
| 결정적 XPBD 체인(길이 보존·에너지 단조 감소·settle·역산 회전 FK 오차 ≤ 1e-4)·캡슐 SDF 충돌 관통 0 | 구현됨 | `domains/physics/chain/{constraint,determinism,energy,settle,back-solve}.test.ts`, `domains/physics/core/{vec,noise}.test.ts`, `domains/physics/collision/capsule.test.ts` | 미검증(settle→캡처 PNG 해시 2회 동일) | `cross-engine-f32` 결정성 범위, SHA-256 영수증 |
| cloth(치마·망토) 솔버 | 구현됨 | `domains/physics/cloth/cloth.test.ts` | 미검증(정점 버퍼 갱신은 render) | self-collision v1 비활성 |
| provider: builtin-pbd(가용)·rapier(실제 wasm init·step, 동적 import)·havok(unavailable 사유)·factory·Worker 프로토콜 | 구현됨 | `domains/physics/{builtin-provider,rapier-provider,havok-provider,provider-factory}.test.ts`, `rapier/rapier-protocol.test.ts`, `app/null-engine.integration.test.ts`(builtin-pbd↔rapier 전환) | 미검증(rapier 브라우저 성능·Worker 경로) | `@babylonjs/havok` 미설치(라이선스·lockfile 승인 필요). 활성 provider HUD·provenance 기록은 render |
| WebGPU compute 체인 커널 | 미구현(설계만) | — | — | 입자 > 2,048일 때 권장 항목, 현재 예산(1,024)은 CPU로 충분(outfit 원본 §2) |
| PhysicsPanel(provider 라디오·상태·사유·settle·재생) | 구현됨 | `app/shell/panels/PhysicsPanel.test.tsx`(jsdom) | 미검증(실제 rAF 미리보기) | composition 조립 완료, `cl-physics-*` 스타일은 core CSS |
| 적용 루프: provider 변경 시만 `setPhysicsProvider`, 실패 사유 노출·같은 provider 재시도 없음 | 구현됨 | `app/shell/apply-loop.test.ts` | — | core |

## 6. 모델 위 드로잉 (UV 페인트)

| 항목 | 구현 상태 | Node 검증 | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| 부위별 RGBA 레이어·소프트 dab·spacing 보간·UV 랩·타일 undo 토큰(1 스트로크 = 1 undo) | 구현됨 | `paint/{paint-layer,uv-stroke,stroke-session,paint-session}.test.ts` | 미검증 | export-paint 원본 |
| 포인터 드라이버(pick→스트로크→업로드→commit 1토큰)·undo 핸들러 | 구현됨 | `paint/paint-bridge.test.ts` | 미검증(UV v 방향·`invertY`) | composition이 `createLabStore({ onPaintUndo })`와 `onSourceLoaded` 재업로드로 배선 |
| PaintPanel(브러시·부위·랩·되돌리기·비우기) | 구현됨 | `app/shell/panels/PaintPanel.test.tsx` | 미검증 | |
| 모델 위 pick→UV→텍스처 업로드(엔진 쪽) | 구현됨 | `render/babylon-paint-pick.test.ts`, `render/triangle-pick.test.ts`, `app/null-engine.integration.test.ts`(소스 재생성 뒤 페인트 레이어 재업로드) | 미검증(UV v 방향·`invertY`·decal 합성) | render 원본 |
| 뷰포트 드로잉 모드(`ui.drawingMode`) 포인터 바인딩(pick→UV 스트로크→업로드→`paint/stroke` 1토큰) | 구현됨 | `app/shell/ui-state.test.ts`, `app/shell/panels/ViewportPane.test.tsx`, `app/composed-app.smoke.test.tsx`(마운트) | 미검증(실제 포인터·UV 정합) | ViewportPane이 `createPointerPaintDriver`를 쓴다(조립 완료, `ViewportPane.test.tsx`) |

## 7. 투명 배경 PNG 출력

| 항목 | 구현 상태 | Node 검증 | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| 요청 해상도(16..4096) lit 패스 캡처·settle N | 구현됨 | `export/export-session.test.ts` | 미검증 | 뷰포트 크기 유도 금지 |
| readback → top-down·straight 변환(알파 극단) | 구현됨 | `export/raster-convert.test.ts`, `shared/typed-array.test.ts` | 미검증(행 순서/premultiply는 backend 상수) | |
| 자체 PNG 인코더/디코더(deflate·CRC32·sRGB) | 구현됨 | `export/png-encoder.test.ts` | 미검증 | 의존성 0 |
| 다운로드(Blob URL revoke 1회) | 구현됨 | `export/save-bytes.test.ts` | 미검증 | `download.browser.ts` |

## 8. 레시피 저장/불러오기 · glTF

| 항목 | 구현 상태 | Node 검증 | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| 레시피 zod 스키마(strict·버전·범위·digest) | 구현됨 | `contracts/recipe.test.ts` | — | core |
| 레시피 파일(`*.character.json`, 페인트 레이어 PNG 내장, 64 MiB 상한) 저장·열기·`recipe/load` | 구현됨 | `export/recipe-file.test.ts`, `export/paint-layer-record.test.ts`, `app/shell/panels/ExportPanel.test.tsx`, `app/recipe-file-interop.test.ts`(두 직렬화 바이트 동일·서로 열기·페인트 내장·손상 JSON 사유 일치) | 미검증(피커) | **core 결정**: 사용자 저장/열기 경로는 `export/recipe-file.ts`(ExportPanel) 하나로 통일. `state/recipe-io.ts`(`character-<digest8>.json`)는 정규형 직렬화·파일 접근 capability 판정용으로 유지하며 두 파서 모두 strict `parseRecipe`라 서로 읽을 수 있다 |
| 브라우저 파일 접근 capability 판정(File System Access / input·download) | 구현됨 | `state/recipe-io.test.ts` | 미검증 | |
| GLB 출력 호출 계약(매직 검사)·실제 엔진 `exportGlb`(Babylon serializer, NullEngine) | 구현됨 | `export/export-session.test.ts`, `app/null-engine.integration.test.ts`(PNG·PSD·GLB·레시피를 실제 엔진으로 끝까지) | 미검증(GLB 실파일 재import·PSD 열기) | `exportGlb`는 render(임시 행 §4) |
| 결정적 직렬화(`stableStringify`)·해시(fnv1a·SHA-256) | 구현됨 | `shared/stable-json.test.ts`, `shared/hash.test.ts` | — | core |

## 9. 레이어 PSD 출력

| 항목 | 구현 상태 | Node 검증 | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| 주선 추출(휘도·알파 Sobel + depth·normal + partId 경계, 검은 재질 회귀 방지) | 구현됨 | `export/line-extract.test.ts` | 미검증 | |
| tone-split(multiply/screen, 재합성 MAE ≤ 2/255) | 구현됨 | `export/tone-split.test.ts` | 미검증(실측) | |
| 레이어 계획(밑색·음영·하이라이트·주선·ID 마스크·참조·페인트, 2048 상한) | 구현됨 | `export/psd-plan.test.ts` | 미검증 | |
| ag-psd 조립·Node round-trip(`testing/psd-canvas-stub`) | 구현됨 | `export/psd-assemble.test.ts` | 미검증(Photoshop/CSP 열기) | 브라우저 캔버스는 `psd-canvas.browser.ts` |
| ExportPanel(PNG·레시피·GLB·PSD 옵션·진행·영수증·실패) | 구현됨 | `app/shell/panels/ExportPanel.test.tsx` | 미검증 | |

## 10. 참고 이미지 추천 · 사진 포즈 인식

원본: [`parity/vision.md`](parity/vision.md)(vision-authored).

| 항목 | 구현 상태 | Node 검증 | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| 비전 계약(모델 id 3종·SHA 고정 여부·상태·추천 타입) | 구현됨 | `contracts/*` | — | core. `MEDIAPIPE_MODELS`에 `handLandmarker`를 추가(2026-10-01). 세 모델 모두 bytes·sha256 미고정이면 UI에 "SHA 미고정·베타" |
| 코사인 Top-K·OKLab k-means(고정 시드)·슬롯별 Top-3 추천·색 추천 | 구현됨 | `domains/vision/{similarity,kmeans-palette,recommend,reference-recommender,image-sampling}.test.ts` | 미검증(실 임베딩 품질) | 썸네일이 없는 프리셋은 추천 불가 사유 표시 |
| 33 랜드마크→본 회전(스코프·미러·가시성)·손 21점 굴곡·오버레이 좌표 | 구현됨 | `domains/vision/{landmarks-to-pose,hand-landmarks-to-pose,landmark-space,landmark-overlay}.test.ts` | 미검증(실 사진) | 손은 굴곡만(벌림·엄지 대립은 2D에서 신뢰 불가해 미적용·베타) |
| MediaPipe 지연 로더(wasm 번들·모델 CDN·SHA·15 s timeout·fail-visible)·세션 | 구현됨 | `domains/vision/{model-assets,vision-session}.test.ts` | 미검증(CDN 로드·추론 품질) | `mediapipe-loader.browser.ts` |
| VisionPanel(모델 상태·참고 이미지 추천·사진/카메라 포즈·손 포즈) | 구현됨 | `app/shell/panels/VisionPanel.test.tsx`(jsdom, 가짜 로더) | 미검증(파일 디코드·카메라·실 모델) | composition 조립 완료, `cl-vision-*` 세부 클래스는 core CSS |

## 11. Blender 제작 캐릭터 패키지 레인

원본: [`parity/vision.md`](parity/vision.md) §1.1, [`authored-asset-pipeline.md`](authored-asset-pipeline.md).

| 항목 | 구현 상태 | Node 검증 | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| manifest 스키마(Blender 실측 키)·index 스키마 | 구현됨 | `contracts/package-manifest.test.ts`, `domains/authored/authored-character-manifest.test.ts` | — | core 계약 + 실제 형식 변환 |
| 능력 판정 표(15슬롯 available/partial/unavailable+사유, `slot-mapping.json` 선언 우선)·SHA 불일치 실패·품질 게이트·AuthoredPackagePlan | 구현됨 | `domains/authored/{package-capability,package-plan,package-load-flow,real-packages}.test.ts` | 미검증(crypto.subtle) | 실제 커밋 패키지 2종(`public/assets/characters`)으로 검증 |
| shape key 별칭 24·본 이름 매핑(VRM/Mixamo/Blender)·메시 역할(`TS_AuthoredHair_<style>_LOD<n>`/`_Outline`)·GLB JSON 청크·VRM 부분 파서(베타) | 구현됨 | `domains/authored/{shape-key-mapping,bone-name-mapping,mesh-role-mapping,glb-json-chunk,vrm-extension-parser,package-index}.test.ts` | 미검증 | |
| 패키지 플랜 레지스트리·`source/set`·`reloadSource` 후 루프 중복 로드 방지·미로드 패키지 failure | 구현됨 | `app/shell/package-plan-registry.test.ts`, `app/shell/lab-runtime.test.ts`, `app/shell/apply-loop.test.ts` | — | core. 패널이 올린 소스를 레시피가 따라잡기 전에는 지우지 않는다(§12) |
| 최소 GLB·manifest fixture | 구현됨 | `testing/minimal-glb.ts`, `testing/manifest-fixtures.ts`(authored·render 테스트가 사용) | — | core |
| glTF 로더(.pure + 매핑 재지정·LOD/Outline 가시성) | 구현됨 | `render/babylon-package-load.test.ts`(31, NullEngine, 실제 패키지 GLB) | 미검증(실제 렌더·헤어 LOD 가시성) | render 원본 §3 |
| PackagePanel(목록·라이선스·SHA·능력표·격차·헤어 LOD·로드) | 구현됨 | `app/shell/panels/PackagePanel.test.tsx`(jsdom + fs 로더, 실제 2종) | 미검증 | composition 조립 완료, `cl-package-*` 스타일은 core CSS |

## 12. 셸 · 경계 · 결정성 (core 공통 품질)

| 항목 | 구현 상태 | Node 검증 | 브라우저 검증 | 비고 |
| --- | --- | --- | --- | --- |
| 조립 루트: 엔진 미선택 시 렌더·factory 호출 없음, 실패 배너 reasonKo, Undo/Redo 활성, 명시 선택→ready→플랜 적용, 언마운트 시 구독 중지 | 구현됨 | `app/shell/CharacterLabApp.test.tsx`(jsdom) | 미검증 | `testing/mock-runtime.ts`로 전체 조립 |
| 조립 실패 화면(카탈로그 불변식 등) | 구현됨 | `app/shell/CompositionFailure.test.tsx` | 미검증 | 빈 화면 대신 원인 표시 |
| 레이아웃 3열·인스펙터 탭 9·미조립 패널 안내 | 구현됨 | `app/shell/WorkbenchLayout.test.tsx`, `app/shell/InspectorTabs.test.tsx`, `app/shell/ui-state.test.ts` | 미검증 | |
| 뷰포트 레지스트리(캔버스 등록·호스트) | 구현됨 | `app/shell/viewport-registry.test.ts` | — | |
| React 컨텍스트(Provider 밖 throw, 선택자, 적용 플랜 스냅샷) | 구현됨 | `app/shell/lab-store-context.test.tsx` | — | |
| 적용 루프(소스→셰이딩→물리→플랜 직렬, device lost 복원, `onSourceLoaded` 훅) | 구현됨 | `app/shell/apply-loop.test.ts`(15케이스) | — | 플랜 revision = history revision |
| 적용 루프 재진입 방지: recipe·revision·capabilities가 바뀐 알림에만 돌고, 같은 엔진에서 실패한 소스·셰이딩·물리 값은 바뀔 때까지 재시도하지 않는다. 소스 로드가 실패하면 이전 소스 키를 버려(엔진 리그 상태를 알 수 없음) 레시피가 이전 소스로 돌아오면 다시 올린다 | 구현됨 | `app/shell/apply-loop.test.ts` | — | **결함 수정**: 이전에는 `failure` 이벤트가 구독자를 깨워 소스 생성 실패 시 마이크로태스크 무한 루프(테스트 워커가 CPU 100%로 멈춤)가 났다 |
| 절차 소스 재생성 키(humanoid `geometryKeyOf`): 헤어·의상·눈 슬롯 변경 = 소스 재생성, 그 밖은 플랜만 | 구현됨 | `app/shell/apply-loop.test.ts`, `app/composition.test.ts`, `app/null-engine.integration.test.ts` | 미검증(실제 재생성 시간·깜빡임) | **결함 수정**: 이전에는 절차 소스 키가 상수라 슬롯 변경이 지오메트리에 반영되지 않았다 |
| 능력 맵: 절차 소스는 처음부터 15슬롯 지원, 엔진 보고(`source/capabilities` 이벤트, history 밖)로 스토어를 맞춘다 | 구현됨 | `app/shell/apply-loop.test.ts`, `state/lab-store.test.ts`, `app/composition.test.ts` | — | **결함 수정**: 이전 초기값이 `ALL_UNAVAILABLE`이라 기본 캐릭터의 모든 슬롯이 미지원으로 계획됐다 |
| `reloadSource`(PackagePanel) 직후 레시피가 따라잡기 전에 루프가 패키지를 지우고 절차 소스를 다시 만들지 않는다 | 구현됨 | `app/shell/apply-loop.test.ts`, `app/shell/lab-runtime.test.ts` | — | **결함 수정**: 이전에는 이중 로드(패키지→절차→패키지)가 났다 |
| 썸네일은 소스 로드·첫 적용 완료 뒤에만 요청, 지오메트리 프리셋은 엔진 `thumbnailSources` 지원 시 임시 소스로 요청 | 구현됨 | `app/shell/thumbnail-driver.test.ts`, `app/shell/thumbnail-scheduler.test.ts`, `app/shell/lab-runtime.test.ts`, `app/composition.test.ts`, `app/null-engine.integration.test.ts` | 미검증(실제 카드 실루엣) | **결함 수정**: 이전에는 엔진 `ready` 직후 소스 없는 엔진에 `renderThumbnail`을 호출했고, 지오메트리 카드가 모두 현재 모델로 그려졌다. render가 `thumbnailSources`를 구현해 해소 |
| 전체 조립 통합(실제 humanoid·state·outfit·physics·export × NullEngine): skipped 0, 표정·포즈·손 30 프리셋, 물리 전환, 썸네일 64, 출력 4종 | 구현됨 | `app/null-engine.integration.test.ts`, `app/composition.test.ts`, `app/humanoid-outfit.integration.test.ts` | 미검증(GPU) | 영역 사이 계약 불일치를 잡는 유일한 층 |
| 기본 캔버스(ViewportPane 미조립 시 폴백) 표시 크기×픽셀비(≤2)로 렌더 버퍼 맞춤 + 엔진 `resize` | 구현됨 | `app/shell/WorkbenchLayout.test.tsx` | 미검증 | 렌더 해상도는 캔버스 속성 기준. 현재 composition은 ViewportPane을 조립해 폴백을 쓰지 않는다 |
| 부트스트랩 진입점(`main.tsx`): 조립 실패 → 위반·오류 원인 화면(빈 화면 금지), 정상 조립 → 엔진 없이 셸, root 요소 없음 → throw | 구현됨 | `app/bootstrap/main.test.tsx`(jsdom, 모듈 레지스트리 리셋 후 `vi.doMock`) | 미검증 | |
| 데스크톱 폭(≥1181px) 레이아웃: 워크벤치를 창 높이에 가둬 좌·우 열이 각자 스크롤, 뷰포트 캔버스는 화면에 고정(좁은 폭은 세로 흐름) | 구현됨(CSS) | — (CSS는 단위 테스트 없음) | 2026-10-01·Chrome for Testing 151 headless·Linux(소프트웨어 렌더) — 1600×1000·1280×720에서 `scrollHeight == innerHeight`, 열 `scrollHeight > clientHeight` 실측 | **결함 수정**: 이전에는 `.cl-app`이 `min-height`만 가져 오른쪽 패널이 길면 페이지 전체가 스크롤되어 슬라이더를 만지는 동안 캐릭터가 화면 밖으로 밀렸다(실브라우저 스크린샷으로 발견) |
| 실브라우저 프로브(셸·백엔드 명시 선택·투명 PNG 알파·카드 1단계·썸네일) | 구현됨 | `scripts/browser-probe.mjs`(Playwright, `CHARACTER_LAB_BROWSER_PROBE=1`) | §13 | 소프트웨어 렌더러에서는 실 GPU 증거가 아니다. PBR이 투명이면 실패한다 |
| 조립 스모크(jsdom): 실제 패널 전부·실제 스토어·실제 humanoid로 모든 인스펙터 탭 마운트, '미조립' 없음, 뷰포트 캔버스로 엔진 선택 | 구현됨 | `app/composed-app.smoke.test.tsx` | 미검증 | 9탭 전부 조립 |
| 모듈 경계 자가 강제(§AGENTS 3, `domains/<영역>` 포함, 앱·루트 vitest 설정 양쪽) | 구현됨 | `architecture.test.ts` | — | 엔진 모듈 존재 시 composition 동적 import 필수 |
| 공유 수학·색·PRNG·해시·typed array | 구현됨 | `shared/{math,color,prng,hash,typed-array,stable-json}.test.ts` | — | |
| 접근성: 키보드 포커스 링(`:focus-visible`)·고대비·강제 색상·감속 모션 미디어 쿼리, 패널 세부 클래스(Param·Vision·Package) | 구현됨 | — (CSS) | 미검증(실제 렌더·대비) | `character-lab.css`. 패널 TSX가 쓰는 `cl-*` 클래스 중 정의 없는 것은 템플릿 접두·구조 훅뿐 |
| 패널 조립 강제: `app/shell/panels/*.tsx`는 전부 composition이 import | 구현됨 | `architecture.test.ts` | — | 새 패널 파일을 추가하고 조립하지 않으면 테스트가 실패한다(ViewportPane·RenderPanel 조립으로 현재 패널 11개 전부 조립) |

## 13. 브라우저 검증 기록

환경 약칭 **SW**: Chrome for Testing 151.0.7922.34 headless · Linux x86_64 · ANGLE Vulkan 1.3 SwiftShader(소프트웨어 렌더러, 하드웨어 GPU 없음). **이 표의 어떤 행도 실GPU·WebGPU 증거가 아니다.**

| 날짜 | 기기·OS·브라우저 | backend | 확인 항목 | 결과 |
| --- | --- | --- | --- | --- |
| 2026-10-02 | SW | webgl2 | `scripts/browser-probe.mjs --software --require-ready webgl2`(최종 dist): 셸 마운트(슬롯 15·탭 9)·인스펙터 9탭 순회('미조립' 없음)·제작 패키지 `index.json` 실제 fetch(2종)·레시피 저장→실행 취소→파일 불러오기 왕복·WebGL2 명시 선택 ready(어댑터 문자열 표시)·썸네일 6개 failed 0·**PBR lit 투명 PNG 면적 12.6 %·툰 13.3 %**(모서리 알파 0, 투명 픽셀 RGB 0)·슬롯 카드 클릭 = history 1단계·실행 취소 1단계·pageerror 0·console.error 0 | 통과 11 · 실패 0 · 건너뜀 1(아래) |
| 2026-10-02 | SW | webgpu | WebGPU 명시 선택 | 의도된 실패 `[webgpu-fallback-adapter]`(소프트웨어 폴백 어댑터 차단)가 배너에 보이고 WebGL2는 자동 생성되지 않음. **WebGPU 이후 단계(렌더·썸네일·PNG)는 건너뜀 — WebGPU 렌더는 미검증** |
| 2026-10-02 | SW | webgl2 | 데스크톱 폭 레이아웃(1600×1000·1280×720): 페이지 스크롤 없음(`scrollHeight == innerHeight`), 좌·우 열 `scrollHeight > clientHeight`로 각자 스크롤, 캔버스가 열을 채움, HUD가 우상단에 고정 | 통과(수동 스크립트, 스크린샷 확인) |
| 2026-10-01 | SW | webgl2 | **최초 실브라우저 구동**에서 NullEngine이 놓친 결함 발견: ①PBR lit·뷰포트·썸네일 완전 투명, ②`diffusion profiles` console.error 113회, ③툰 피부·상의 과노출 → render-beta가 근본 수정(`parity/render.md` §5 9–12), ④페이지 전체 스크롤로 뷰포트가 밀림 → core CSS 수정, ⑤`favicon.ico` 404 console 오류 → `index.html` 빈 아이콘 | 수정 뒤 위 첫 행에서 재확인 |
| 2026-10-02 | SW | webgl2 | render-beta 실측(NodeMaterial 툰·IBL 그림자·OpenPBR·투영 페인트·GLB sparse·morph 텍스처 모드 등, 일부는 노이즈 PNG를 playwright 라우트로 대체) | 상세는 `parity/render.md` §7.2 |
| — | 실기기 하드웨어 GPU(Chrome 113+ WebGPU) | webgpu·webgl2 | README §4 절차 전체(관절 드래그·페인트 포인터·비전 모델 로드·PSD/GLB 외부 열기·성능 p95) | **아직 없음** |

## 14. 집계 절차

1. 영역 작업자가 `docs/parity/<area>.md`를 갱신하면 core가 해당 영역 행을 이 표에서 교체한다(열 구조 동일).
2. "(임시)" 행은 원본 제출 시 제거한다. "미구현(집계 시점)" 행은 모듈이 디스크에 생기고 테스트가 통과하면 갱신한다.
3. 브라우저 검증은 §13에 먼저 기록하고 각 행의 열을 `YYYY-MM-DD·기기·backend`로 바꾼다.

## 15. core 최종 검증 기록 (2026-10-02 01:0x UTC, char-core 실측 — render-beta 마무리 뒤의 디스크 상태에서 전부 다시 실행)

| 명령 | 결과 |
| --- | --- |
| `pnpm --filter @toonstudio/character-lab typecheck` | 오류 0 |
| `pnpm exec vitest run apps/character-lab/src/{app,architecture.test.ts,contracts,shared}` (루트 설정) | 54파일 / 369케이스 통과 |
| `pnpm --filter @toonstudio/character-lab exec vitest run src/app src/architecture.test.ts src/contracts src/shared src/state/lab-store.test.ts src/domains/vision` (앱 설정) | 66파일 / 435케이스 통과 |
| `pnpm --filter @toonstudio/character-lab test` (앱 전체, 1회) | 179파일 / 1233케이스 통과(약 48 s) |
| `pnpm exec eslint --max-warnings=0 apps/character-lab` (전체) | 432파일 오류 0 · 경고 0 |
| `pnpm --filter @toonstudio/character-lab build` | 성공. 진입 `index-*.js` 945 kB, 엔진 `babylon-character-engine-*.js` 881 kB(동적 import로만 로드), 지연 청크 `node-toon-material` 200 kB·`ibl-shadows` 78 kB·`openpbr*`·`rapier` 2.3 MB·`vision_bundle` 135 kB |
| `pnpm exec knip --workspace apps/character-lab --include unlisted,unresolved` | 미선언·미해석 import 0 |
| `node scripts/validate-app-boundaries.mjs` · `node scripts/validate-documentation.mjs` · `node scripts/validate-source-layout.mjs` | 모두 통과(`characterLabToApps`·`appsToLabs` 0) |
| `CHARACTER_LAB_BROWSER_PROBE=1 node apps/character-lab/scripts/browser-probe.mjs --software --require-ready webgl2` | 통과 11 · 실패 0 · 건너뜀 1(§13) |

실행하지 않은 것: 루트 전체 `pnpm typecheck`·`pnpm test:root`·`pnpm harness:verify`·`pnpm build`(통합 담당 전용), 실GPU·WebGPU에서의 모든 검증(§13). NullEngine 통합(`app/null-engine.integration.test.ts`)은 장면·플랜·소스·출력 배선까지만 확인하며 셰이더·readback 픽셀·성능은 확인하지 못한다 — 그 틈은 위 소프트웨어 렌더 프로브가 일부 메운다(예: PBR이 투명인 결함은 NullEngine 테스트로는 잡히지 않았다).

## 16. 미해결 항목 (원본 7종 집계 결과, 원칙적으로 영역·통합 담당이 닫는다)

| 항목 | 소유 | 상태 |
| --- | --- | --- |
| 실GPU(WebGPU/WebGL2)에서의 렌더 품질·WGSL(툰·NodeMaterial) 실제 컴파일·readback 행 순서·premultiply 상수(`RTT_READBACK_*`)·성능 목표(1920×1080 p95 ≤ 33.3 ms, §13) | 통합 담당 | 전부 미검증. 소프트웨어 렌더러(WebGL2)로 가시성·알파 규약만 확인 |
| 브라우저 수동 절차(관절 드래그·페인트 포인터·투영 페인트 포인터 흐름·비전 모델 CDN 로드·사진 포즈·PSD/GLB 외부 열기·rapier 브라우저 성능) | 통합 담당 | README §4 절차 미수행 |
| 입 안이 화면에서 실제로 어두운지 시각 확인 | render | 구현·테스트 완료, 화면 확인 미수행 |
| 베타 한계: OpenPBR은 페인트 데칼이 보이지 않음·투영 페인트는 sRGB 블렌딩 미세 차이·얇은 부위 반대편 미도장·IBL 그림자는 툰 재질에 적용 불가(UI에 고지) | render | 한계로 문서화(`parity/render.md` §6) |
| FACS 52(ARKit) 확장·corrective shape·morph 100+ 연구 목표 | contracts(core)+animation+state | 계약 FACS 16 동결로 미구현 |
| WebGPU compute 체인 커널(입자 > 2,048) | outfit-physics | 설계만, 현재 예산은 CPU로 충분 |
| `@babylonjs/havok` provider | 통합 담당 | 미설치(라이선스·lockfile 승인 필요) → unavailable 사유만 표시 |
| MediaPipe 모델(pose·hand·embedder) bytes·sha256 고정 | 통합 담당 | 첫 실기기 검증에서 관측 SHA를 기록해 `contracts/vision.ts MEDIAPIPE_MODELS`에 고정 |
| 루트 배선: `.github/workflows/architecture-boundaries.yml`에 `pnpm --filter @toonstudio/character-lab test` 단계, `scripts/ci-required-vitest-targets.txt`에 `apps/character-lab/src/{architecture,contracts/recipe,state/apply-plan,state/history}.test.ts` 4건, `config/documentation-authority.json`에 `apps/character-lab/docs/` | 통합 담당 | 루트 파일이라 core가 수정하지 않았다(현재 워크플로는 typecheck·build만) |
