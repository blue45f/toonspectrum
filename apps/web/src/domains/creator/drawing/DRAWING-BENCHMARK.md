# 드로잉 기능 벤치마킹 보고서 (2026-09-30)

벤치마크 대상: Clip Studio Paint(CSP), Procreate, ibisPaint, MediBang Paint, Krita
자료: 공식 헬프 문서·공개 튜토리얼·스토어 설명 (공개 자료만 사용)

## 1. 손떨림 보정 (스트로크 스태빌라이저) — 최우선

| 앱 | 명칭 | 스케일 | 방식 |
|---|---|---|---|
| CSP | Stabilization (Tool Property) | 0–100 | 값이 클수록 부드럽게, 태블릿 흔들림 보정 |
| Procreate | StreamLine | 0–100% | 스트로크를 평균 방향으로 끌어당김 (amount + max) |
| ibisPaint | 손떨림 보정 (Stroke Stabilizer) | 0–10 | 끈(pull-string) 방식, v14.1.0에서 "Stroke Prediction" 추가로 레이턴시 예측 |
| MediBang | 보정 | 0–40 | 간단한 스무딩 |
| Krita | Stabilizer | — | Basic/Weighted/Pull-string 3모드 |

### 구현 결정 (toonstudio)
- 레벨 0–100 (CSP 규격), ibisPaint 0–10 매핑 프리셋 제공
- 모드 2종: `smooth`(One-Euro 적응형 로우패스) / `string`(끈 방식, 라인아트용)
- Stroke Prediction: 속도 외삽으로 입력 레이턴시 보상 (ibisPaint v14.1.0 방식)
- 파일: `stroke-stabilizer.ts`

## 2. 퀵쉐이프 (도형 자동 보정)

| 앱 | 명칭 | 동작 |
|---|---|---|
| Procreate | QuickShape | 그리고 뗄 때 홀드(유지) → 라인/호/폴리라인/타원/삼각형/사각형으로 스냅 |
| Procreate | 완벽 도형 | 홀드 중 두 번째 손가락 → 타원→원, 직사각형→정사각형, 삼각형→정삼각형, 라인→15° 스냅 |
| Procreate | 스케일/회전 | 홀드 유지 + 드래그 → 크기/회전 조정 (두 번째 손가락 시 15° 자석 회전) |
| ibisPaint | Smart Shape | v14.1.0 신규, 도형 스냅 |
| CSP | 도형 툴 | 곡선·타원·사각형·다각형 툴, 벡터 스냅 |

### 구현 결정 (toonstudio)
- 홀드 시간 임계값 기본 500ms (설정 가능, Procreate Gesture Controls 대응)
- 분류: 선 / 타원·원 / 직사각형·정사각형 / 삼각형·정삼각형 / 폴리라인 폴백
- 두 번째 포인터 감지 → 완벽 도형
- 홀드 유지 드래그 → 스케일/회전 (15° 자석 옵션)
- 파일: `quick-shape.ts`

## 3. 브러시 즐겨찾기 / 최근 사용

| 앱 | 기능 |
|---|---|
| Procreate | 브러시 세트 즐겨찾기, 최근 사용 브러시 핀 |
| CSP | 서브툴 즐겨찾기, 최근 사용 서브툴 |
| ibisPaint | 즐겨찾기 브러시, 히스토리 |
| Krita | 즐겨찾기 프리셋 태그, 최근 프리셋 |

### 구현 결정 (toonstudio)
- 즐겨찾기 ID 목록 + 최근 사용 LRU(기본 12개)
- localStorage 영속화 (버전 키, 검증, 용량 오류 처리)
- 파일: `brush-favorites.ts`

## 4. 드로잉 타임랩스 녹화

| 앱 | 기능 |
|---|---|
| ibisPaint | 작업 과정을 자동 녹화 → 재생/공유 (SNS 학습 기능과 연계) |
| CSP | 타임랩스 녹화 → 비디오 내보내기 |
| Procreate | 타임랩스 비디오 내보내기 (30fps 압축) |

### 구현 결정 (toonstudio)
- DOM 무관 세션 모델: 스트로크 이벤트 + 타임스탬프 기록
- 재생 모델: 속도 배율(1x/2x/4x), 스크럽(현재 시각 → 표시 스트로크)
- 기본 최대 5분 (ibisPaint와 동일), 설정 가능
- 실제 캔버스 캡처/인코딩은 UI 레이어(훅)에서 연결 — 모델은 타임라인과 메타데이터 제공
- 파일: `timelapse-recorder.ts`

## 5. 추가 벤치마크 메모 (후속 후보)

- CSP: 벡터 레이어 제어점 수정, 3D 데생인형, 타임랩스
- ibisPaint: 눈금자(직선/원/타원/방사/대칭), 47000+ 브러시, 스크린톤 46종
- MediBang: 만화 전용 톤/말풍선, 클라우드 브러시
- Krita: 애니메이션 타임라인 + 어니언 스킨, 어시스턴트(원근 눈금자)
