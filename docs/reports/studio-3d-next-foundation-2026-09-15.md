# Studio 3D Next 기반 구현 — 2026-09-15

기준 브랜치: `feat/studio-3d-next-foundation-20260915`
기준 통합 head: PR #1427 `de69a8f92b3d74d5dd51b5ce75560bf05c282e0f`

## 목적

기존 Studio 3D에는 BG3D 장면 편집, Hybrid DCC 메시 편집, 캐릭터·포즈, 샷, LT/톤,
semantic pass와 고해상도 출력이 각각 존재하지만, BG3D의 snapshot 배열 history와 전문 DCC
진입 경계가 제품 전체를 연결하는 공통 계약이 아니었다.

이번 변경은 다음 두 기반을 실제 제품 경로에 연결한다.

1. renderer-neutral typed command timeline
2. BG3D canonical scene을 보존한 뒤 기존 Hybrid DCC 정밀 모델링 작업 공간으로 전환하는 제품 흐름

## 구현 내용

### Typed command timeline

`scene3d/studio-scene3d-command-core.ts`가 다음을 제공한다.

- canonical state encoding과 SHA-256 identity
- immutable command commit, transaction, undo, redo
- bounded checkpoint/history retention
- stale worker 결과를 차단하는 revision fence
- pointer gesture begin/preview/commit/cancel
- deterministic reducer replay 검증
- branch edit 시 redo 폐기
- camera-only rebase처럼 undo step을 만들지 않는 anchor 교체

BG3D는 transitional alias와 history adapter를 사용한다. 기존 `historyRef`를 다른 코드가 직접
수정하지 못하도록 integration test로 제한하고, restore, debounced edit, immediate edit,
undo/redo, durable attachment deletion reset을 하나의 timeline으로 통합했다. 기존 렌더러와
컴포넌트가 참조하는 legacy snapshot 배열은 adapter가 projection으로만 유지한다.

### Scene3D 문서 명령

`scene3d/studio-scene3d-document-command.ts`는 순수 operation을 원자적 문서 command로
묶으며 성공한 transaction에서만 revision을 한 번 증가시킨다.

- multi-entity transform
- hierarchy reparent 및 cycle 차단
- physical camera patch/activation
- semantic output 설정
- document id/revision precondition
- locked entity와 존재하지 않는 entity/camera fail-closed 처리

### BG3D → 정밀 모델링

BG3D의 웹툰 프로 도구에 **정밀 모델링 워크스페이스 열기**를 추가했다.

1. 현재 viewport camera를 포함해 live runtime을 canonical BG3D SceneDocument로 변환한다.
2. node/attachment 안전 예산이나 손실 없는 projection 조건을 만족하지 않으면 전환하지 않는다.
3. DCC 접근 권한이 pending/blocked이면 기존 navigation gate의 사유를 표시하고 BG3D를 닫지 않는다.
4. 접근 가능할 때 canonical 장면을 복구 원본으로 보존한 뒤 Hybrid DCC `model` 작업 공간을 연다.
5. DCC에서 생성한 authoritative half-edge mesh는 기존 검증·원자 저장·GLB derivative 경계를
   통해 다시 BG3D로 전달된다.

BG3D primitive/model을 B-Rep 또는 CAD 형상으로 조용히 추정 변환하지 않는다. 정밀 DCC에서
새로 authoring한 geometry만 authoritative source가 되며, 기존 BG3D 장면은 복귀 가능한 원본으로
남는다.

## 안전 불변식

- engine object, GPU resource, Blob URL, credential은 command/document 경계를 통과하지 않는다.
- no-op은 revision과 undo depth를 증가시키지 않는다.
- stale worker fence는 상태를 변경하지 않는다.
- 취소된 gesture는 history를 남기지 않는다.
- undo/redo는 physics runtime source와 camera projection을 같은 snapshot에서 복원한다.
- backing model bytes 삭제 뒤 과거 snapshot으로 attachment를 부활시키지 않는다.
- DCC route를 열 수 없을 때 BG3D 장면을 닫지 않는다.
- DCC → BG3D는 검증된 GLB derivative와 canonical scene만 사용한다.

## 검증

- TypeScript 전체 검사 통과
- architecture validation 통과
- 변경 TypeScript ESLint zero-warning 통과
- typed command/document/history/Pro Suite 집중 검사 46개 통과
- Studio shell, DCC product gate, BG3D shot/camera/transform, Scene3D contract 회귀 60개 통과
- 접근 권한 fail-closed 보강 후 집중 회귀 12개 통과

위 검증은 SHAPER 또는 Shapr3D와 동일 자산을 사용한 직접 작업시간·픽셀 품질 비교를 뜻하지
않는다. 이번 변경의 완료 범위는 공통 명령 코어와 실제 제품 DCC 연결이다. 기존 Hybrid DCC가
보유한 selection, extrude, bevel, boolean, modifier, precision input, room authority, GLB handoff를
BG3D 제품 흐름에서 안전하게 사용할 수 있게 한 기반 구현이다.
