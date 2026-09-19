# 브러시 정밀 고도화: 구현 계약과 전환 계획

작성일 2026-09-20. 상태: **제안 설계 / 런타임 미구현**.
검토 기준: main `7e7f99325852f052ab3470cdc71adb9f42d5ce4f`, PR #1847 head `8a6b28a599573f11a8d300c1cd7624a5d4fef388`.
기존 `brush-unified-experience-design-20260920.md`의 범주·후보를 대체하지 않고, 후속 구현의 조건을 정밀화한다. 사용자 화면에 버전을 다시 노출하지 않으며 내부 실행 정체성과 과거 획을 보존한다.

## 새로 확인한 코드 경계

경로는 `apps/web/src/domains/creator/` 아래다.
- `brush/studio-brush-selection-snapshot.ts`: enginePrograms가 없는 선택은 withoutMaterial(current.enginePrograms)를 사용하며 기존 oil/watercolor/composition이 남을 수 있다. legacy 호환 동작을 삭제하기보다 exact 경로를 독립 구성해야 한다. 전체 제품에서 버그를 재현했다는 뜻은 아니다.
- `brush-lab/brush-studio-v6-product-bridge.ts`: 저장 후 재조회로 material version/fallbackPolicy를 검사한다. 새 계약은 전체 semanticHash·원본 hash까지 검증한다.
- `brush/studio-brush-library-sqlite-repository.ts`: payload/색인 일치 검사·quota 오류·SQLite/memory-session 구분·비교 후 복구가 이미 존재한다. 새 저장 시스템을 만들지 않고 재사용한다.
- `brush/studio-brush-engine-program-set.ts`: material/oil/watercolor/composition과 unknown well-formed ID를 다루므로 decode와 실행 가능성을 분리해야 한다.
- `brush/studio-stroke-surface-route.ts`: pointerdown route 고정·소유자 검증은 보존한다. batch 순서·finalSeq·frame 인계·commit은 별도 계약으로 보강한다.
- `brush-lab/brush-studio-v6-material-palette-cache.ts`: 현재 색 쌍/provider별 32-entry LRU다. 순수 팔레트에 미래의 바탕 의존 cache key를 무조건 추가하지 않는다.

## 결정 목록

| ID | 결정 |
| --- | --- |
| D01 | 원본 내용 복원과 명시적 설정 상속 |
| D02 | 실행 전 과정의 capability 교집합과 재료 교환 등급 |
| D03 | 좌표·필압·방향·시간·출처의 공통 입력 |
| D04 | 순서·중복·취소·최종 인계의 상태 기계 |
| D05 | flow·stroke opacity·coverage·도막 두께 분리 |
| D06 | KM 도막과 일반 RGBA의 차이를 보존 |
| D07 | 상태 있는 물감의 영역·시간·의존성 Undo |
| D08 | 픽셀·재료·재현 기록의 논리 원자 commit |
| D09 | bounded 타일·halo·난수·종류별 cache |
| D10 | 자산부터 다음 획 반응까지 다층 품질 검증 |
| D11 | 대표 브러시 여섯 개의 기능 카드 |
| D12 | 기존 결과를 보존하는 비교 실행·단계 승격 |

## D01 — 원본·표시·실행 정체성

`libraryEntryId`는 이름·즐겨찾기 같은 관리 단위, `semanticHash`는 실행 설정과 자산 내용, `sourceArtifactHash`는 가져온 원본 바이트, `executionHash`는 구현·셰이더·색/시간/난수 규칙, `effectiveHash`는 명시적 override와 교정을 반영한 실행값이다. 이름 변경은 semanticHash를 바꾸지 않는다. 원본 bytes와 실행 정규화값은 모두 보존하며 미지원 필드를 조용히 버리지 않는다.

`BrushOpenResult = exact | read-only | conversion-required`로 제안한다. exact의 무편집 저장은 semanticHash/sourceArtifactHash를 유지한다. 실제 엔진이 읽을 수 없는 원본 옵션은 바이트를 보관하더라도 exact 실행을 허용하지 않는다. 파싱 성공과 실행 가능은 다르다. 알 수 없는 실행 의미를 null/default로 낮추지 않는다.

설정 우선순위는 `새 자산 기본값 → 자산별 개인 override → 사용자가 명시적으로 유지한 도구값`이다. preserveKeys 기본은 비우고, 색/크기 유지 여부를 UI에서 따로 선택한다. 이전 oil/watercolor/physics는 암묵적으로 유지하지 않는다. 구형 호환 경로는 구형 영수증에만 남긴다. 변경 저장은 새 불변 자산으로 만들고 과거 획 참조는 유지한다.

## D02 — 실제 실행 가능성

입력 모델→형상/접촉→도포/재료→광학→표면 writer→표시/출력을 하나의 계획으로 검증한다. 필요한 lifecycle(live/settle/replay/export), 입력 채널, 회전·반전·투명도·pickup 표면 조건, memory/texture 한도, snapshot/restore 가능성을 교집합으로 판정한다. 제작기와 원고가 같은 판정 함수를 사용하며 WebGPU 존재/라이브러리 설치만으로 사용 가능이라 표시하지 않는다.

재료 교환은 (A) 최종 RGBA, (B) RGB에서 복원한 가상 안료, (C) 공통 calibrated K/S·농도·두께로 구분한다. B는 명시된 근사이고 C는 데이터·단위·상태 계약의 검증이 필요하다. libmypaint 픽셀을 다른 광학 엔진에 전달하는 것만으로 원본 안료가 복원되지 않는다. 여러 kernel을 Session으로 감싸는 것만으로 물리 상호운용성이 생기지 않는다.

## D03 — 공통 입력

제안 sample은 seq/timeUs/xDoc/yDoc, pressureRaw|null/pressureEffective, tiltX/Y|null, azimuth/altitude|null, twist|null, down/move/up, 출처(device-api/derived/mouse-policy/replayed), transformEpoch를 보존한다. 0은 유효값이고 null은 채널 없음이다. 브라우저가 보고한 값이 실제 센서 정확도를 보증하지 않는다. 교정은 한 번만 하고 replay에 중복 적용하지 않는다.

CSS px·문서 단위·raster pixel·물리 길이를 구분한다. 회전/반전은 좌표뿐 아니라 방향·twist 부호 규칙도 변환한다. 비균일 변환의 접촉면은 타원이므로 크기 스칼라로만 축약하지 않는다. singular transform은 거부한다. 이전 material 입력 경계의 시간/tilt 축약을 보존한 legacy 재생과 새 rich-input 경로를 분리한다.

raw/move 중 하나를 정본 transport로 정하고 coalesced 목록과 부모 이벤트를 중복 누적하지 않는다. timestamp만으로 중복 제거하지 않고 같은 위치의 압력 변화도 남긴다. 큰 시간 역행은 clock-discontinuity로 실패한다. 도포량은 `거리당 양×Δs + 시간당 양×Δt`, twist는 원형 보간, 급회전은 코너 보존 규칙을 사용한다. 가상 시간은 고정 dt이며 React render 횟수로 전진하지 않는다. 배경 탭은 기본 freeze다.

## D04 — 세션·순서·인계

상태는 PREPARING→READY→DRAWING→DRAINING→SETTLING→COMMIT_PENDING→COMMITTED→DISPOSED이며 FAILED/CANCELLED는 별도 종료 경로다. 메시지에는 sessionId/epoch/executionHash/seqStart/seqEnd/batchDigest, 응답에는 processedThrough/presentedThrough/frameId/materialRevision/status가 필요하다. 같은 seq/digest 재전달은 ack만, 같은 seq/다른 digest는 충돌, gap은 bounded 대기/재전송이다.

finalSeq 전체 처리·예측 폐기·정착 목표 완료 전 commit하지 않는다. 예측은 scratch state만 바꾸고 정본 reservoir·PRNG·이력은 건드리지 않는다. canonical frame과 같은 임시 frame을 한 번만 인계해 농도 중복과 공백을 막는다. commit/dispose는 멱등이고 cancel 후 늦은 완료로 상태를 되살리지 않는다.

backpressure는 표시 빈도를 낮추되 accepted 표본을 버리지 않는다. 유한 메모리로 무한 입력을 보장할 수 없으므로 hard limit에서는 입력 세션을 명시 종료하고 수집된 안전 구간을 복구/별도 적용할 선택을 제공한다. device loss는 기존 정상 문서를 보존하며 동일 executionHash 복원이 검증된 경우에만 복구를 제시한다. 다른 renderer로 자동 치환하지 않는다.

## D05 — 서로 다른 네 가지 값

flow는 접촉 적재량, strokeOpacity는 격리된 획 전체 표시 강도, coverage는 면적 덮임, filmThickness는 도막 두께다. wash는 offscreen 획에 opacity를 한 번 적용하고 build-up은 접촉별 누적을 허용한다. 신규 opacity 규칙을 기존 per-contact opacity 영수증에 소급 적용하지 않는다. 광학 안료 농도와도 구분한다.

신규 RGB 표면의 작업 색 공간·선형/premultiplied 규칙을 고정하고 기존 renderer는 legacy 계약을 보존한다. 데이터 텍스처(농도·높이·법선)에 sRGB 감마를 적용하지 않는다. 알파 0의 숨은 RGB를 검정 안료로 픽업하지 않는다. 반투명 경계는 흰/검정/유색 바탕에서 따로 검사한다.

## D06 — KM 도막을 임의 배경의 정적 RGBA로 보존할 수 없는 이유

균질 확산 도막은 파장별 바탕 B에 대해 F(B)=R+T²B/(1−RB), 고정 source-over RGBA는 불투명 바탕에서 G(B)=aC+(1−a)B다. F''(B)=2RT²/(1−RB)³이 0이 아닌 도막은 affine RGBA로 임의의 바탕 위에서 정확히 재현할 수 없다. R=0/T=0 등 특수 경우는 제외한다. 이는 선택한 모델의 대수적 결론이며 모든 광학의 완전한 모델이라는 뜻은 아니다.

예: R=.2,T=.6이면 F(0)=.2,F(1)=.65,F(.5)=.4이다. 양끝을 맞춘 affine 모델은 .5에서 .425를 내므로 .025 차이가 생긴다. 단일 파장 예제이고 실제 물감 측정이 아니다.

저장은 (1) 확인한 바탕을 포함한 flattened PNG, (2) 편집 가능한 재료 상태와 광학 구현, (3) 지정 바탕 집합에서 평가한 근사 transparent PNG로 구분한다. 출력 RGB만으로 뒤의 임의 바탕에 동일 물리 효과를 보장하지 않는다. K/S 혼합 농도 단위, grid, illuminant/observer, binder/substrate 조건을 고정하고, 다른 조건은 검증된 변환 없이는 혼합하지 않는다.

## D07 — 재료 영역·시간·Undo

MaterialDomain은 호환된 안료·순서·가상 시간을 공유하는 상호작용 영역이다. 독립 RGB 획과 구분한다. pickup은 확정 영역 상태를 읽고 같은 획 안에서는 앞선 접촉을 순서대로 반영한다. 동시 tick solver는 별도 double-buffer 규칙을 고정한다. 읽은 영역 revision을 보존해 동시 수정 충돌을 감지한다.

Undo는 pigment masses/water/thickness/binder/reservoir/RNG/clock까지 복원한다. A 도막을 읽은 B가 남아 있는데 A만 되돌리면 B도 영향을 받을 수 있다. 선형 Undo는 직전 상태를 복구하고, 선택적 Undo는 의존하는 후속 구간을 같은 엔진으로 재생하거나 명시적 불가로 알린다. 그림만 되돌리고 숨은 상태를 남기지 않는다.

기본 이동은 확인한 결과를 보존하는 frozen transform이고 새 바탕에 물리를 다시 계산하는 reflow는 별도 동작이다. drying은 명시적 tick 기록과 이력 묶음 정책을 갖는다. 협업의 비가환 혼합은 영역별 정본 순서/fencing epoch를 사용하고 RGBA 또는 일반 속성 CRDT 평균으로 재료를 합치지 않는다. offline 변경은 분기와 명시적 합성/재생 대상으로 둔다.

## D08 — 문서·저장 확인

SQLite 원자성은 DB가 관리하는 변경 범위다. 외부 OPFS blob와 GPU 상태까지 자동 트랜잭션이 되지 않는다. 기존 DB 포트를 확장해 `blob staging→내용 검증·저장→단일 DB transaction으로 참조/StrokeReceipt/영역 revision/Undo 연결→durable ack` 순서를 검증한다. 동일 transactionId 재시도는 중복 생성하지 않는다.

화면 표시/rendered, 문서 반영/document-committed, 로컬 저장/locally-persisted, 원격 동기화/remote-synced를 구분한다. 낙관적 문서 표시는 허용해도 영구 저장 전에는 저장 중으로 표시한다. 결과 PNG는 저장됐지만 재료 state가 실패한 경우 완료가 아니다. quota/crash/lease 상실 시 완전한 이전 또는 새 revision만 공개한다.

참조 없는 staging blob는 유예 후 수거한다. GC는 문서·Undo/Redo·임시 commit·공유/export 참조를 확인한다. 현재 화면에 없다는 이유로 삭제하지 않는다. 파괴적 migration 없이 append-only 확장·구형 영수증 보존부터 시작한다. VFS/브라우저의 실제 flush·동시성 동작은 별도 fault injection으로 검증한다.

## D09 — 타일·수치·캐시

128/256/512px core tile을 benchmark 후보로 둔다. halo는 실제 kernel 영향 반경으로 계산하고 이웃을 동일 tick에서 읽는다. 반복 solver는 substep마다 halo를 갱신하거나 유효 반경을 확장한다. core만 최종 write하며 seam을 이중 합성하지 않는다.

256²×38×float32 한 필드는 9.5MiB다. halo 8px를 포함한 272² double buffer는 21.44921875MiB, 타일 8개면 171.59375MiB다. 전체 2048² 단일 분광 필드는 608MiB다. 배열 크기 계산이며 GPU 실제 측정이 아니다. 히스토리/표시/기타 필드는 별도다.

FP16·LUT·축소 기저는 오차 검증 후 채택한다. 질량 보존·분광 RMSE·표시 색차와 이후 10회 혼합/덧칠 반응을 따로 검사한다. GPU마다 부동소수점이 byte-identical할 것이라 약속하지 않는다. 난수는 semanticHash/seed/contact index/branch/effect channel 기준이며 tile/worker 배치가 결과를 바꾸지 않게 한다. 순차 난수 provider는 소비 순서와 checkpoint를 보존한다.

순수 palette cache는 실제 색/provider 의존만, tip cache는 자산/mip, 물리 출력은 영역 revision/바탕/시간/입력 prefix/유효설정을 사용한다. viewport pan은 재료 재계산 원인이 아니다. false hit와 무제한 key 증가를 모두 검사한다.

## D10 — 품질 인증 계층

E0 원본/semantic/execution hash, E1 정규 입력·접촉·시간, E2 재료/RNG state, E3 픽셀/알파/경계, E4 이후 추가 혼합·픽업·재습윤 반응, E5 실제 작화 과제로 나눈다. 지금 RGB가 비슷해도 다음 획의 혼합이 달라지면 재료 동등성이 아니다. 서로 다른 모델의 색 차이를 물리 정확도의 순위로 쓰지 않는다.

ΔE00는 지정 바탕·색 관리 조건에서 쓰며 alpha/edge/clip/seam은 별도다. 평균뿐 아니라 p95/p99/최대 오차와 영역별 실패를 기록한다. 기존 평균1/p95 2 제안은 초기 후보이지 모든 재료에 강제하는 공통 숫자가 아니다. deadzone·조건부 옵션은 유효 조건에서 영향성을 검사하고 단조성이 없는 설정을 단순 단조 테스트로 판정하지 않는다.

최초 로드·예열 append·tile compute·전송·present·commit·encode·persistence를 분해 측정한다. 장치·부하·해상도·입력·순서·반복 수를 기록하고 지원 불가 측정은 불가로 남긴다. 실물 pen-to-photon은 JS 시간과 구분한다. shadow 비교 실패는 자동 renderer 전환으로 숨기지 않는다.

## D11 — 대표 기능 카드

| 카드 | 모델·대표 조절값 | 필수 검증 |
| --- | --- | --- |
| B01 옆면 흑연 | 방향 타원 접촉, tooth·입자·폭·버니싱 | 회전/tilt, 압력0, 지우고 재채색 |
| B02 잔량 갈필 | 다발·거리당 소모, 적재·갈라짐·소모 길이 | chunk 독립, dwell 정책, reservoir Undo |
| B03 치즐 마커 | 방향 팁·격리 wash, 각도·flow·획 opacity | 자교차/별도 획 구분, handoff 농도 |
| B04 문서 해칭 | 고정 위상·압력 밀도, 간격·폭·각도 | pan/zoom/tile/DPI 불변 의미 |
| B05 이중색 필버트 | 다발별 reservoir·광학, 적재 분할·mix·ridge | 색 공급/pickup 분리, 뒤집기·재열기 |
| B06 결정적 잎 | 변형 tip·안정 난수·최소 간격 | batch/tile 분할, overlap·회전·재생 |

모든 카드는 선택→exact 편집→sandbox→원고→cancel→Undo→저장/재열기→출력을 통과해야 한다. 범위/성능값은 실제 provider와 목표 장치 측정으로 확정한다. 기존 64종 후보와 중복이면 이름을 늘리지 않고 기존 브러시를 개선한다. 현재 카드는 구현 완료가 아닌 제안이다.

## D12 — 단계별 전환

| 작업 | 의존 | 완료 기준 |
| --- | --- | --- |
| W01 원본 resolver | 없음 | 무편집 semantic/source hash 유지 |
| W02 effective 설정 | W01 | A→B→A 순서 독립과 preserveKeys 명시 |
| W03 입력 adapter | 없음 | 제작/원고 좌표·시간·방향 동일 |
| W04 세션·인계·계측 | W02,W03 | 순서/중복/취소/finalSeq 통과 |
| W05 저장·복구 | W01,W04 | blob/receipt/state fault injection 통과 |
| W06 대표 전체 여정 | W04,W05 | 기존 contact와 native/vector의 전 과정 통과 |
| W07 재료 domain | W06 | pickup·clock·미래 반응 동등성 |
| W08 여섯 대표·규모 | W07 | 품질·타일·장치별 작화 검증 |

## 제안 인수 사례 T01–T18

이 표는 테스트 구현/실행 결과가 아니라 **앞으로 구현할 acceptance 명세**다.

| 사례 | 결정/작업 | 통과 조건 |
| --- | --- | --- |
| T01 무편집 원본 왕복 | D01/W01 | semanticHash/sourceArtifactHash 유지 |
| T02 선택 순서 독립 | D01/W02 | A→B→A에서 이전 enginePrograms 잔존 없음 |
| T03 미지원 옵션 보존 | D01/W01 | 원본 bytes 보존, unsupported exact 실행 차단 |
| T04 메타데이터 분리 | D01/W01 | 이름 변경에 semanticHash 불변 |
| T05 회전 지원 | D02/W04 | 원고/제작 capability 판정 동일 |
| T06 재료 교환 등급 | D02/W07 | RGB 출력을 calibrated 안료로 오인하지 않음 |
| T07 필압 영값 | D03/W03 | 0/없음/마우스 정책 구분, 교정 한 번 |
| T08 방향 순환 | D03/W03 | 359°→1°와 viewport 변환의 정확한 의미 |
| T09 transport 중복 | D03/W03 | raw/move/coalesced 중복 방지, 압력 변화 보존 |
| T10 시간 불연속 | D03/W03 | 동일시각 순서·역행 거부·freeze 재현 |
| T11 거리/시간 도포 | D03/W03 | batch1/7/64에서 의미 동일, airbrush dwell |
| T12 중복 batch | D04/W04 | same seq/digest는 ack만, 도포는 한 번 |
| T13 순서 충돌 | D04/W04 | 다른 digest/gap 명시 거부·대기 |
| T14 예측 격리 | D04/W04 | 예측 on/off에 canonical state 불변 |
| T15 종료 barrier | D04/W04 | finalSeq/settle 이전 commit 없음 |
| T16 늦은 완료 | D04/W04 | 취소/페이지 변경 후 적용 없음, 자원 회수 |
| T17 표면 인계 | D04/W04 | 반투명 획의 이중 합성/공백 없음 |
| T18 wash/build-up | D05/W06 | 자교차·별도 획을 계약대로 처리 |

## 제안 인수 사례 T19–T36

| 사례 | 결정/작업 | 통과 조건 |
| --- | --- | --- |
| T19 투명 픽셀 pickup | D05/W06 | 숨은 RGB가 검정 안료로 유입되지 않음 |
| T20 KM/RGBA 비동등 | D06/W07 | 명시한 반사율 예제 차이 .025, 일반 exact 출력 주장 금지 |
| T21 겹칠/premix | D06/W07 | AB/BA/premix와 중간 spectrum 보존 |
| T22 측정 조건 | D06/W07 | grid/단위/광원 불일치를 검증 없이 혼합 금지 |
| T23 미래 반응 | D07/W07 | 추가 10회 혼합·리프트·재습윤 다축 검증 |
| T24 선택 Undo | D07/W07 | 의존 구간 replay/분기 또는 명시 불가 |
| T25 건조 저장 | D07/W07 | freeze 정책의 재열기 상태 동일 |
| T26 동시 영역 쓰기 | D07/W07 | fencing/정본 순서, 자동 평균 금지 |
| T27 부분 저장 장애 | D08/W05 | 완전한 이전/새 revision만 공개 |
| T28 commit/GC | D08/W05 | transaction 멱등, Undo 참조 blob 보존 |
| T29 tile seam | D09/W08 | halo/core 영향·중복 write·경계 오차 검사 |
| T30 난수 partition | D09/W08 | 같은 seed에 batch/tile 분할 독립 |
| T31 cache 의존 | D09/W08 | 관련 키 invalidate, 무관 pan에 재료 재계산 안 함 |
| T32 다축 시각 | D10/W08 | alpha/edge/clip/색차/분광 별도 판정 |
| T33 조건부 설정 | D10/W08 | 유효 조건 영향, 비활성 이유 표시 |
| T34 여섯 대표 여정 | D11/W08 | B01–B06 전체 lifecycle 검증 |
| T35 구형 획 | D12/W06 | 신규 활성화에 legacy 재생 불변 |
| T36 shadow writer | D12/W06 | 후보는 원고/Undo에 쓰지 않음 |

## 검증·변경 범위

이번 후속 변경은 문서만 추가한다. 36개 사례는 모두 proposed이며 제품 테스트를 실행한 수가 아니다. 설계 아티팩트의 ID·결정/작업 참조·DAG와 메모리 산식, 1파장 KM/affine 반례를 독립적으로 검산했다. 이전 471개 회귀 통과는 앞선 UI 커밋의 기록이지 이번 새 검증 건수가 아니다. 코드·의존성·저장 포맷·운영 설정은 변경하지 않는다.

## 공식 근거

- W3C Pointer Events: https://www.w3.org/TR/pointerevents3/ — coalesced/raw/predicted와 채널 의미.
- Krita Opacity/Flow: https://docs.krita.org/en/reference_manual/brushes/brush_settings/opacity_and_flow.html
- W3C Compositing: https://www.w3.org/TR/compositing-1/ — source-over와 group alpha.
- Finite-layer KM: https://doi.org/10.1186/s41476-017-0068-2 — 두께·바탕·보정 조건.
- SQLite atomic commit: https://sqlite.org/atomiccommit.html
- SQLite WASM persistence: https://sqlite.org/wasm/doc/trunk/persistence.md
- WGSL floating-point rules: https://www.w3.org/TR/WGSL/
- 내부 규칙: `docs/adr/0019-renderer-role-ledger-single-authority.md`, `docs/adr/0021-stroke-budget-myb-disposition-execution-profiles.md`.

PR/main/원격 CI/운영 배포 상태는 별도로 확인한다. 이 문서의 추가는 새 브러시 구현·실측 품질 인증·운영 배포가 아니다.

## 초기 재료 도입의 제한된 수직 범위

첫 물리 material-domain은 같은 레이어·같은 광학 모델·같은 좌표/시간 정책의 영역만 대상으로 한다. 여러 legacy/native 레이어의 합성 RGB를 calibrated 도막처럼 읽지 않는다. '보이는 레이어에서 색 픽업'은 별도의 RGB/가상 안료 모드로 표시하고, 정확 재료 픽업은 호환된 domain에 한정한다. 지원 범위를 넓히려면 각 경계의 변환과 미래 반응 검증이 먼저다.
다음 획이 기존 wet state를 읽기 전에 동일 가상 tick의 처리 완료 barrier를 확인한다. GPU readback은 입력 hot path에서는 피하지만 복구용 checkpoint/출력/저장에서는 비동기로 수행할 수 있다. 무조건 readback 0을 목표로 삼아 복구 가능성을 없애지 않는다.
