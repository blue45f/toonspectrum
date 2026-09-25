# Studio 라이브 캔버스 제스처 아키텍처

- 상태: **단일 `DrawEl` 크기 조절·회전 vertical slice 구현 완료**
- 범위: 공통 수명주기, transient preview, durable commit, renderer handoff
- 최종 갱신: **2026-09-26**

## 결정

캔버스 제스처는 renderer와 무관한 하나의 수명주기를 사용한다.

1. 문서 lease를 획득하고 변경 불가능한 source identity를 캡처한다.
2. 절대 좌표 transient frame을 latest-frame mailbox에 넣는다.
3. animation frame마다 최신 frame 하나만 표시한다.
4. 유일한 durable commit 전에 renderer claim을 닫는다.
5. commit 성공·실패 뒤 retained terminal preview를 authoritative source와 인계한다.
6. Escape, pointer cancel, blur, hidden document, source/selection 변경, disable, unmount,
   preview 실패, commit 실패에서 모든 claim을 해제한다.

pointer 이동은 scene state, history, autosave, CRDT를 쓰지 않는다. pointer-up만 durable boundary이며
기존 문서 commit을 정확히 한 번 호출한다.

공통 interface는
`apps/web/src/domains/creator/studio-live-canvas-gesture.ts`에 있다. Konva, React, brush, storage,
history, collaboration을 알지 못한다. CanvasKit, Vello, WebGPU adapter도 같은 transient interface를
구현할 수 있다.

## 변형 표시 전략

모든 stroke에 빠르고 정확한 단일 표시 방식은 없다. 단일 draw 변형은 capability와 비용에 따라 다음
순서를 사용한다.

| frame 조건 | 표시 방식 | 비용 | 정확성 근거 |
| --- | --- | ---: | --- |
| renderer가 matrix equivalence를 증명 | 격리 wrapper의 retained affine | O(1) scene write + 격리 Layer paint | renderer signature/capability |
| exact-safe이고 work budget 이하 | 격리된 model draft | 표시 frame마다 O(points + stroke render) | pointer-up과 같은 planner·renderer |
| exact-safe지만 budget 초과 | source 유지, release-only | drag 중 O(1) | 무제한 rAF long task 방지 |
| malformed transient frame | 마지막 정상 표시 유지 | O(1) | 다음 event에서 복구 가능 |
| commit 불가 또는 renderer 부적격 | neutral release-only | O(1) | 다른 모양의 근사 금지 |

`push()`는 mailbox를 교체하고 callback을 최대 하나만 예약한다. classification, model planning,
React publication, Konva write, clip 계산은 pointer event가 아니라 rAF callback 안에서 실행한다.

현재 admission 대상인 `causal-ink`, `calligraphy-segments`, `perfect-outline`은 spacing, quantization,
radius, topology 규칙 때문에 모두 `model-draft-only`다. retained affine tier는 미래 renderer가
동등성을 증명할 때만 사용한다.

## O(1) admission과 안전 예산

제스처 시작 시 source complexity fact를 bounded snapshot으로 만들고, frame admission은 O(1)로
판정한다. 100k sample stroke를 clone·stringify·path scan한 뒤 거절하지 않는다.

- Causal 경로: `sampleCount + ceil(pathLength / 0.5)` 보수적 dab 상한
- coverage: renderer diameter, 최대 pressure radius, target scale, Stage scale, DPR 포함
- Calligraphy/Perfect Freehand: source sample 수가 아니라 renderer-expanded worst case를 비용에 반영
- 허용 상한: path command 2,048, serialized coordinate scalar 8,194, backing pixel 4,000,000
- Calligraphy 구조 상한: `208S - 2` outline scalar, `108S + 2` Canvas command
- Perfect Freehand 구조 상한: `28 * max(N, 5) + 42` outline point
- generic 경로: 회전 paint AABB와 zoom/DPR path sweep을 함께 계산
- clip 비용: scene element 수로 제한
- Konva Layer: 선택 객체 AABB뿐 아니라 실제 backing store 전체 draw 비용을 반영

이 값은 문서 제한이 아니라 라이브 preview 안전 상한이다. browser p95 증거 없이 올리지 않는다.

## exact model-draft surface

exact fallback은 document `elements` 배열을 바꾸지 않는다.
`studio-live-transform-draft-store.ts`에 변형된 `DrawEl` 하나를 publish하고
`StudioLiveTransformDraftNode`만 subscribe한다. 따라서 전체 document tree가 아니라 stroke 하나만
React에서 다시 계획한다.

Draft root는 기존 `studio-single-object-drag-layer`의 첫 child로 항상 mount한다.

- 추가 full-DPR canvas를 만들지 않는다.
- exact transform 밖에서는 pixel-empty다.
- source wrapper, proxy, Transformer보다 아래에 위치한다.
- handle보다 아래에서 정확한 draft를 표시한다.
- main document Layer repaint는 begin/finish에 제한한다.

transform draft는 settled geometry를 사용하지만 `renderPurpose="transform-draft"`로 document-owned
진단, committed coverage cache, living-ink background bake, GPU bristle request를 억제한다.
`exposeSceneIdentity={false}`로 authoritative element identity도 노출하지 않는다.

source visibility를 바꾸기 전 synchronous renderer barrier를 통과하고 source가 속한 Layer를 그린다.
역전환에서는 source attr·visibility를 복구하고 현재 Layer의 pixel receipt를 받은 뒤 draft를 제거한다.
동일한 JavaScript turn 안에서 빈 frame이나 source+draft 중복 frame을 표시하지 않는다.

## 소유권과 terminal handoff

모든 model-draft claim은 증가하는 generation과 page/master scope를 가진다. 오래된 rAF callback,
cleanup, receipt, page teardown은 더 새 generation이나 다른 surface의 draft를 변경할 수 없다.

정상 pointer-up 흐름:

1. exact terminal candidate를 동기적으로 만든다.
2. lifted node를 풀기 전에 candidate를 표시한다.
3. document commit을 실행한다.
4. commit 성공 후 store를 `handoff`로 전환한다.
5. Stage host의 authoritative model receipt를 기다린다.
6. layout effect에서 draft를 지우고 source wrapper를 복구한다.
7. source 복구와 claim release가 모두 확인된 뒤 writer lease를 해제한다.

commit 거절·예외에서는 source를 먼저 동기적으로 그린 뒤 candidate를 지운다. React render가
중단되거나 unmount되어 receipt가 오지 않으면 bounded timeout이 같은 source-first transfer를 수행한다.

## 불변식

- source bounds와 array input channel은 bounded immutable gesture-start snapshot이다.
- element identity와 monotonic document/mutation generation이 lease를 보호한다.
- 모든 frame은 absolute이며 delta를 누적하지 않는다.
- `offer`는 transient-only, `commit`은 scene/history/CRDT의 유일 writer다.
- session은 callback 실행 전에 seal되며 re-entrant cancel도 두 번 resolve하지 않는다.
- proxy, renderer, Layer, clip, wrapper, chrome, lease cleanup을 각각 시도한다.
- close/settle 실패 시 bounded exponential backoff로 재시도하고 ownership 복구 전에는 lease를 풀지 않는다.
- exact/retained live path는 isolated drag-Layer lift preflight를 통과한 경우에만 사용한다.
- cached, clipped, masked, backdrop-sensitive, stacking-sensitive, non-liftable stroke는 release-only다.
- 선택 wrapper 위에 일반 authored paint leaf가 있으면 exact lift를 거절한다.
- panel clip membership은 commit과 같은 transformed point geometry로 계산한다.
- preview subtree는 authoritative `studioElementId`를 노출하지 않는다.
- terminal draft는 authoritative receipt, rollback, 새 generation, safety timeout에서만 사라진다.

## 현재 capability 경계

현재 vertical slice는 positively allowed된 renderer·complexity·composition을 가진 단일 selected
`DrawEl`을 처리한다. 허용된 ink renderer는 uniform, non-uniform, rotated frame에서 exact model draft를
사용하고 budget 초과 stroke는 UI를 막지 않고 release-only로 남긴다.

resize·rotation은 기존 한 번의 document commit에서 point로 bake하므로 undo, autosave, CRDT 의미가
갈라지지 않는다.

제한:

- selected wrapper가 authored painting sibling 중 최상위여야 한다.
- cached/clipped/masked/backdrop-sensitive stroke는 release-only다.
- sample별 calligraphy orientation은 256 sample preflight 뒤에만 scan한다.
- 임의의 draw/text/frame/image multi-selection은 아직 live exact를 보장하지 않는다.
- 현재 `DrawEl.strokeWidth`는 scalar다. non-uniform transform은 X/Y scale의 기하평균 규칙을 사용한다.
  비등방 nib는 별도 model/CRDT/export 결정이 필요하다.

## 장기 목표: renderer-neutral object matrix

최종 목표는 scene node에 versioned finite/invertible `Mat2d`를 저장하는 것이다. pointer-up은 O(1)로
matrix를 commit하고 point/width bake는 명시적 `Flatten/Reshape` 작업으로 interaction path 밖에서
실행한다.

시각 계약은 `Render(T(raw geometry))`가 아니라 `T(Render(raw geometry))`다. symmetry,
bounds-derived primitive, texture/noise brush, calligraphy nib, paper grain, raster surface에서 결과가 다르다.
따라서 outer wrapper가 안정된 z/composite/clip slot을 유지하고 paint·hit shape가 inner content-transform
group 아래에 있어야 한다.

Writer를 켜기 전 reader-first 순서:

1. versioned finite/invertible `Mat2d` 계약 정의
2. project load, autosave, CRDT, mixed-version negotiation, recovery에서 보존
3. transformed bounds, hit test, clipping, render projection 중앙화
4. 모든 export·alternate renderer가 matrix를 소비하거나 명시적으로 flatten
5. matrix 미지원 point-edit tool은 fail-closed 또는 사전 flatten
6. 이후 pointer-up을 O(1) matrix commit으로 전환

첫 writer 범위도 단일 `DrawEl`, translation/rotation/positive uniform scale,
orientation-preserving similarity로 제한한다. shear, reflection, non-uniform scale은 이후 단계다.

## 후속 확장

### 1. 긴 stroke의 progressive 표시

exact geometry와 raster planning을 generation-tagged Worker/OffscreenCanvas 또는 GPU ephemeral surface로
옮긴다. 최신 완료 generation만 표시한다. deadline miss가 나면 같은 gesture 동안 stable proxy를
유지해 모드가 흔들리지 않게 한다. main-thread React에는 거대한 stroke subtree 대신
`ImageBitmap` 또는 surface receipt를 전달한다.

### 2. Multi-selection

같은 transient interface 뒤에 `group-uniform` adapter를 추가한다. 전체 selection을 preflight하고
all-or-none으로 표시한다. 일반 해법은 `planStudioGroupUniformResize`가 만든 격리 ephemeral scene이다.
UI는 document fact와 node resolution만 전달하고 eligibility, cache, clip, mask, renderer ownership은
adapter가 소유한다.

### 3. Drawing gesture

기존 drawing rAF pump를 공통 begin/offer/finish/cancel 수명주기로 감싼다. 전문 incremental renderer는
유지하지만 lease, cancel, late frame, history 규칙을 transform과 통일한다. terminal frame은 기존
one-shot commit으로 seal한다.

### 4. Renderer 교체

geometry planning과 공통 lifecycle은 renderer-free로 유지한다. Konva는 교체 가능한 adapter 하나다.
CanvasKit/Vello/WebGPU adapter는 같은 absolute frame을 받아 retained matrix 또는 ephemeral SceneIR을
표시한다. 미지원 capability는 neutralize하고 release-only를 유지하며 근사하지 않는다.

### 5. 전체 문서 pixel parity

현재 exact lift는 뒤에 보이는 paint sibling이 하나라도 있으면 거절한다. 더 넓히려면 shadow/filter/clip을
포함한 overlap gate, in-place draft slot 또는 prefix/candidate/suffix surface가 필요하다. 원래 z slot을
유지하는 durable scene-node matrix가 선호하는 최종 구조다.

## 릴리스 게이트

- Unit: exactly-once lifecycle, 모든 cancel reason, setup/cleanup 실패, generation 격리,
  commit reject/throw, terminal timeout
- Planner: non-uniform point/width parity, route threshold, coordinate/width 거절, rotation,
  arrow·companion geometry
- Renderer: mode 전환, clip, source visibility, Layer ordering, identity 격리, late callback,
  cancel·commit receipt
- Browser: pointer hold 중 transient motion, mouseup 전 durable/history 불변, release 시 history 1건,
  Escape rollback, native Konva SceneCanvas backing pixel 증거
- Performance: 100+ input event를 frame당 최신 표시 하나로 coalesce, document Layer draw는 begin/finish,
  one-stroke draft memory bounded, geometry/planning 6~8ms, 60Hz p95 16.7ms, fallback tier 33ms

2k/10k/50k sample, causal/perfect/calligraphy, dropped frame, document-Layer draw 수와 GC spike를 ratchet으로
검증한다. Worker/GPU progressive lane이 완성될 때까지 main-thread exact lane은 보수적으로 admission한다.
