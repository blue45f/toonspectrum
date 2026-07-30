# 컷 레이어 분리(Scene Layer Lift) 설계

## 1. 제품 목표

`컷 레이어 분리`는 평면 이미지 한 장을 웹툰 편집에 유용한 레이어로 다시 구성하는
ToonSpectrum의 독립 기능이다. 특정 상용 제품의 이름, 화면, 모델, 가중치, 출력 예제를
복제하지 않는다. 공개적으로 알려진 “평면 이미지를 편집 가능한 구성요소로 바꾼다”는 문제를
ToonSpectrum의 문서·마스크·그룹·히스토리 계약 위에서 별도로 해결한다.

최종 목표 출력은 다음과 같다.

```text
컷 레이어 분리 · 2026-07-30 [그룹]
├─ 효과
├─ 편집 가능한 대사
├─ 소품
├─ 캐릭터
├─ 배경
└─ 원본 백업 [숨김·잠금]
```

1차 베타는 정적 이미지 한 장에서 `원본 백업 + 배경 + 전경`만 만든다. OCR, 글꼴 복원,
복수 소품의 의미 분류, 그림자·효과 분리는 별도 품질 게이트를 통과한 뒤 추가한다.

## 2. 사용자에게 보장할 불변식

- 원본 요소는 덮어쓰거나 삭제하지 않고 숨김·잠금 백업으로 남긴다.
- 배경과 전경은 원본의 위치, 크기, 회전, 좌우·상하 반전을 보존한다.
- 출력 요소는 하나의 연속된 레이어 그룹을 이룬다.
- 적용은 문서 커밋 한 번으로 끝나며 Undo 한 번으로 정확히 원상 복구된다.
- 분석 중 원본, 선택, 페이지, 권한, 협업 문서 세대가 달라지면 결과를 적용하지 않는다.
- 로컬 처리가 실패하거나 신뢰도가 낮아도 이미지를 자동으로 외부 서비스에 보내지 않는다.
- 원격 보완은 전송 대상, 제공자, 비용 범주를 보여 준 뒤 사용자가 다시 실행해야 시작한다.
- 원격 또는 로컬 공급자의 잘못된 크기·바이트·스키마 결과는 부분 적용하지 않고 거부한다.

## 3. 1차 처리 파이프라인

```text
선택 ImageEl
  → mutation ticket + source fingerprint
  → CORS-safe 픽셀 디코드
  → 로컬 foreground confidence mask
  → threshold / feather / morphology / 작은 섬 제거
  → 포함·제외 마스크 교정
  → 투명 전경 합성
  → 전경 영역 확장 mask
  → 로컬 content-aware background repair
  → 결과·예산·stale 재검증
  → 원본 백업 + 배경 + 전경 그룹을 단일 commit
```

기존 MediaPipe 셀피 세그멘터는 사람 중심 베타 공급자로만 사용한다. 일반 일러스트와 소품
분리를 지원한다고 과장하지 않는다. 이후 ONNX 공급자를 추가할 때는 런타임 라이선스뿐 아니라
모델 가중치의 상업 사용·재배포 조건, SHA-256, 입력/출력 텐서 계약을 별도로 고정한다.

## 4. 모듈 경계

- `studio-layer-lift-contract.ts`
  - 오케스트레이션이 마스크 정제·합성을 끝낸 뒤 교환하는 최종 RGBA/alpha8 결과 계약
  - 버전·종류 식별자, 엄격한 입력/결과 스키마, 예산, 오류, 공급자 영수증
- `studio-layer-lift-mask.ts`
  - DOM 없는 confidence resample, threshold, feather, morphology, 연결 요소, 통계
- `studio-layer-lift-plan.ts`
  - 현재 문서와 산출물에서 다음 `elements/groups/selection`을 만드는 순수 트랜잭션 계획
- `studio-layer-lift-local-provider.ts`
  - 로컬 모델의 수명, 취소, 세대 검사, 원시 confidence mask 반환
- `studio-layer-lift-worker-protocol.ts`
  - transferable buffer, backpressure, timeout, cancel, stale epoch
- `StudioLayerLiftPanel.tsx`
  - 분석 진행, 원본/합성/마스크/배경/전경 미리보기, 교정, 적용

React 컴포넌트는 모델이나 OpenCV를 정적으로 import하지 않는다. 패널을 열고 유효한 요청이
확정된 뒤에만 공급자와 Worker를 지연 로드한다.

## 5. 데이터와 저장

초기 결과는 현재 `ImageEl.src`와 같은 표현을 사용하되, 각 출력은 기존 이미지 admission
예산을 통과해야 한다. 분리 한 번이 여러 PNG를 만들기 때문에 저장된 협업 작업에서는 모든
산출물을 먼저 업로드하고 참조를 확보한 뒤 문서를 커밋한다. 일부 업로드만 성공한 상태에서는
문서에 결과를 넣지 않고 업로드 보상 정리를 수행한다.

따라서 raw PNG data URL을 받는 첫 planner는 `local-unsaved` 범위에서만 성공한다. 저장된
작업이나 협업 세션에 연결하는 제품 경로는 background/foreground ID를 먼저 발급하고 같은
ID의 `work-asset://image/<id>` 참조를 일괄 admission한 다음 사용하는 별도 planner가 준비될
때까지 fail-close한다.

CRDT에는 원시 픽셀, confidence map, 마스크 data URL을 직접 넣지 않는다. 승인된 asset
reference와 제한된 의미 역할·공급자 영수증만 전달한다. 로컬 임시 작업은 추후 OPFS
내용주소 저장소가 일반 이미지 hydration 경로와 연결된 뒤 data URL을 대체한다.

## 6. 배경 복원 정책

현재 로컬 content-aware fill은 결정적이고 무료지만 넓은 가림 영역이나 반복 구조에서 품질이
낮을 수 있다. 따라서 배경 복원은 다음 세 상태를 명확히 구분한다.

1. `원본 유지`: 전경 이동 시 가려진 영역이 드러나지 않는 안전 미리보기
2. `로컬 메움`: 서버 비용 없이 빠르게 복원하되 품질 진단을 표시
3. `고급 AI 메움`: 사용자가 명시적으로 선택한 원격 inpaint

네트워크 실패가 비용 청구 여부를 불명확하게 만들 수 있으므로 원격 요청은 자동 재시도하거나
다른 공급자로 자동 전환하지 않는다.

## 7. UX 상태

- `idle`, `unsupported-source`, `model-download`, `analyzing`
- `low-confidence`, `refine-add`, `refine-remove`, `preview`
- `background-repair-poor`, `ready`, `applying`
- `stale-source`, `collaboration-locked`, `asset-quota-exceeded`
- `local-model-unavailable`, `paid-fallback-confirmation`
- `remote-running`, `remote-possibly-charged`, `cancelled`, `applied`

모바일에서는 미리보기 캔버스가 우선이며 하단 시트에 단계·브러시·적용 버튼을 둔다. PC에서는
Inspector의 빠른 이미지 도구에서 진입하되 넓은 교정 화면은 중앙 모달로 연다.

## 8. 품질 및 성능 게이트

- 정적 fixture의 mask IoU와 boundary F-score
- 머리카락·반투명 경계 halo와 원본 알파 보존
- 원본과 `배경 + 전경` 재합성의 픽셀 차이
- 작은 섬 제거 전후의 의미 있는 전경 보존
- 512², 2048², 4096² 입력의 p50/p95 시간과 peak memory
- 취소·페이지 전환·협업 갱신 뒤 stale 결과가 절대 커밋되지 않음
- 적용, Undo, Redo, 저장, 새로고침 뒤 같은 z-order와 그룹 연속성
- 로컬 모드에서 이미지·마스크 네트워크 전송 0건

품질 fixture는 직접 제작하거나 상업 사용 권리가 명확한 자료만 사용한다. 경쟁 제품의 예제나
결과 이미지는 회귀 fixture로 복사하지 않는다.

## 9. 단계별 확장

1. 단일 전경 + 배경 복원 + 원본 백업
2. 마스크 교정과 복수 인물 연결 요소
3. 일반 일러스트·소품용 라이선스 검증 ONNX 공급자
4. 협업 asset batch admission과 CRDT 의미 메타데이터
5. 한국어 OCR과 편집 가능한 `TextEl` 후보
6. 복수 캐릭터·소품·효과 의미 분리
7. 글꼴·자간·회전·외곽선·그라데이션 복원
8. 장면 관계를 보존하는 고급 레이아웃 재구성

각 단계는 이전 단계의 저장·Undo·stale·비용·프라이버시 불변식을 그대로 유지해야 한다.
