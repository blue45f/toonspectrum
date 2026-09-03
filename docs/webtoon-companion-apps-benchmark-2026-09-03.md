# 웹툰 보조 앱 및 사이트 전수 분석 및 ToonSpectrum 고도화 벤치마크 보고서 (2026-09-03)

## 1. 개요 및 목적
본 문서는 국내외 웹툰 작가, 어시스턴트, 스튜디오들이 원고 제작 과정에서 활용하는 대표적인 웹툰 보조 앱, 웹 서비스, 유틸리티 사이트들을 총망라하여 분석하고, 그 중 핵심적인 유용 기능들을 ToonSpectrum 스튜디오 내에 네이티브 엔진 및 UI로 내재화한 구현 내역을 정리합니다.

---

## 2. 조사 및 벤치마킹 대상 서비스 분석

### 1) ToonSlicer / 웹툰 컷 자르기 툴
- **주요 기능**: 원고의 긴 세로 스트립(최대 수만 픽셀)을 플랫폼 규격에 맞춰 자동 분할 내보내기.
- **핵심 유용성**: 단순 기계식 등분 절단 시 인물 얼굴이나 말풍선 한가운데가 잘려나가는 치명적인 문제를 방지하는 **안전 여백 절단(Safe Split Gutter)** 알고리즘.
- **ToonSpectrum 반영**:
  - `WebtoonPlatformSpecValidator`: 7개 플랫폼 규격 검사기 — `naver-webtoon`(도전/베스트도전 690px),
    `kakao-page`(720px), `webtoon-canvas`(**WEBTOON CANVAS 글로벌**, 800x1280px), `tapas`(940px),
    `lezhin-comics`(1440px), `toptoon`(800px), `postype`(1600px).
    코드 식별자는 `webtoon-canvas`이며 **라인망가(LINE Manga)와 무관하다** — 이전 판 문서가
    이 행을 "라인망가 Canvas"로 잘못 적었다.
  - `planAutoSlices`: 인물 컷 및 말풍선 충돌을 감지하여 컷 간 여백(Gutter)을 자동으로 찾아내는
    스마트 안전 슬라이스 계획 엔진. 절단선을 옮긴 뒤 반드시 재검증하며, 마지막 구간은 절단이
    아니므로 안전 비율(`safeSplitSuccessRate`)의 분자·분모 어디에도 넣지 않는다.

### 2) Spirall Webtoon Previewer / Llamagen Pacing Simulator
- **주요 기능**: 모바일 환경에서 독자가 스크롤할 때 느껴지는 연출 템포(Rhythm)와 여백(Gutter)의 적정성을 시뮬레이션.
- **핵심 유용성**:
  - 컷 간 여백 길이에 따른 연출 비트 분류.
  - 독자 독서 성향별 에피소드 완독 체감 시간 계산.
- **ToonSpectrum 반영**: `WebtoonScrollPacingSimulator` 모듈 구현 완료. 구간 경계는 **WEBTOON CANVAS
  공식 크리에이터 가이드**(컷 간격 200px 이상 · 장면·시간 전환 600~1000px · 한 화면 2컷 이하)에
  맞춰 재조정했다.

  | 비트 | 구간 | 근거 |
  |---|---|---|
  | `action-rush` | < 200px | 공식 최소 컷 간격 200px 미만 |
  | `dialogue-beat` | 200~600px | 공식 최소 간격부터 공식 전환 구간 직전까지 |
  | `scene-transition` | 600~1000px | 공식 장면·시간 전환 여백 |
  | `suspense-cliffhanger` | 1000~1200px | **출처 없음(휴리스틱)** |
  | `excessive-void` | > 1200px | **출처 없음(휴리스틱)** — 기존 경고선 유지 |

  - 이전 판의 380~650px "씬 전환" 구간은 공식 가이드가 전환으로 보지 않는 범위였고, 공식 구간이
    끝나는 1000px보다 350px 일찍 끊겼다. 점수 감점 임계값도 같은 출처로 맞췄다(평균 간격
    200px 미만 / 1000px 초과).
  - 각 구간의 근거는 `PACING_BAND_SOURCES`에 `sourced: boolean`으로 코드에 남아 있어, 공식 수치와
    휴리스틱을 UI가 구분해 보여줄 수 있다.
  - 스크롤 속도(속독 700px/s, 표준 350px/s, 정독 180px/s)와 말풍선당 체류 시간은 **1차 출처를
    확보하지 못한 추정값**이며, 임의로 바꾸지 않고 그대로 두되 코드 주석에 그 사실을 명시했다.
  - "한 화면 2컷 이하" 점검은 `analyze(panels, height, { readerViewportHeightPx })`로 노출돼 있다.
    화면 높이의 1차 출처가 없어 기본값을 두지 않았으므로, **호출자가 실제 프리뷰 뷰포트 높이를
    넘겨줄 때만** 동작한다(현재 UI는 아직 넘기지 않는다).

### 3) 만화 의성어·의태어 사전 & 산돌/CSP 웹툰 폰트 가이드
- **주요 기능**: 연출 상황에 맞는 한국어 만화 효과음 텍스트와 추천 서체 스타일 매칭.
- **핵심 유용성**: 쿵, 쾅, 퍽, 슈욱, 스윽, 두근, 흠칫, 꿀꺽, 주룩주룩, 콰르릉, 콰과광, 달칵, 파지지직, 우웅 등 상황별 최적 효과음과 글자 테두리/외곽선(Stroke) 색상 추천.
- **ToonSpectrum 반영**:
  - `WebtoonSfxLexiconEngine`: 8개 카테고리(타격/충돌, 속도/이동, 심리/감정, 날씨/환경, 파괴/폭발, 일상/사물, 특수/SF, 속삭임/정적) 데이터베이스 구축.
  - 실시간 검색, 텍스트 클립보드 원클릭 복사, 캔버스 즉시 삽입 연동.

### 4) 네이버웹툰 AI Painter & 프로 채색 스튜디오 섀도우 파이프라인
- **주요 기능**: 캐릭터 피부톤 기본색과 그림자 색상의 자연스러운 조화 배색.
- **핵심 유용성**:
  - 초보자가 흔히 저지르는 "검정/회색 곱하기(Multiply)로 인한 탁한 그림자" 현상을 방지하는 **자연 색상환 쿨톤 음영 회전(Hue-Shift Cel Shadow)** 기법.
  - 기본색 대비 색상환(Hue)을 25~40도 차가운 쪽(블루/바이올렛)으로 이동시키고 채도를 소폭 높여 투명하고 맑은 그림자 색상 자동 생성.
- **ToonSpectrum 반영**:
  - 5대 웹툰 피부톤(아이보리 웜톤, 쿨톤 창백, 생기 피치, 구릿빛 태닝, 딥 브라운) 4단계 음영 세트.
  - 임의의 밑색 HEX 입력 시 1차 셀 음영, 2차 딥 음영, 하이라이트를 즉시 계산하는 `generateHueShiftShadow`.
  - 4대 장르별 조명 무드 팔레트(골든아워 노을, 청량 학원물, 다크 누아르, 사이버펑크 네온).

### 5) 에이콘3D FocusFlow / 웹툰 마감 타이머
- **주요 기능**: 6단계 웹툰 제작 공정별 소요 시간 트래킹 및 포모도로 집중 타이머.
- **핵심 유용성**: 콘티/연출, 데생/러프, 펜선/선화, 밑색/채색, 배경/3D, 식자/효과음 등 공정별 누적 시간 기록 및 마감 D-Day 카운트다운.
- **ToonSpectrum 반영**: `WebtoonFocusTimerEngine` (25/5 표준, 50/10 몰입, 15/3 스프린트) 및 상시 공정별 타이머 UI.

### 6) Posemaniacs / Line of Action 크로키 & 투시 가이드
- **주요 기능**: 단시간 인체 드로잉 감각 훈련을 위한 인터벌 타이머(30초, 60초, 180초) 및 카메라 앵글 구도 가이드.
- **핵심 유용성**: 동세선(Line of Action) C자, S자, 직선 추진력 안내 및 4대 투시(아이레벨 1점, 로우앵글 3점, 하이앵글 3점, 더치 앵글) 가이드.
- **ToonSpectrum 반영**: `WebtoonCroquisPoseGuide` 및 인터벌 크로키 타이머 모달 UI.

---

## 3. 플랫폼 규격의 출처 대장 (2026-09-03 갱신)

규격 검사기의 모든 수치는 `SpecProvenance`(출처 이름 · URL · 신뢰도 · 확인 날짜 · 교차 확인 여부)를
달고 있다. 공식 800x1280과 외부 정리본 690px을 같은 굵기의 숫자로 보여주면 작가가 약한 쪽을
강한 쪽만큼 믿게 되기 때문이다.

| 플랫폼 (코드 id) | 확보한 출처 | 신뢰도 | 비고 |
|---|---|---|---|
| `webtoon-canvas` | WEBTOON CANVAS 공식 헬프센터 + webtoons.com 공지 3320·1766 | **공식** | 800x1280 · 장당 2MB · JPG/PNG · 회차 20MB 또는 100장 |
| `tapas` | Tapas 공식 File Size Guide | **공식** | 폭 940px · 세로 상한 없음(GIF만 1000px) · 장당 2MB · 회차 20MB |
| `naver-webtoon` | toonslicer.com 정리본 (네이버 공식 페이지 열람 실패) | 외부 출처 | **690px·JPG만** 네이버 공모전 요강·KOMACON 자료로 교차 확인. 나머지는 저신뢰 |
| `kakao-page` | 외부 정리본 / 카카오 상시투고 공식 안내 | 외부 출처 | 세로 길이가 사내 내보내기 프리셋(4200px)과 불일치 → `conflicts`에 두 값 보존 |
| `lezhin-comics` | 2025 공모전 제출 규격 | 외부 출처 | 1440px(현행) vs 1280px(이전 안내) → `conflicts`에 보존 |
| `toptoon` / `postype` | **없음** | 미검증 | 값을 지어내지 않고 기존 값을 유지하되 전 항목 미검증 표시 |

**감사 심각도가 출처를 따른다.** 공식 업로드 규칙, 또는 교차 확인된 외부 업로드 규칙만 `fail`을
낼 수 있다. 미검증 수치·교차 확인되지 않은 외부 출처 하나뿐인 주장·연출 지침은 `warn`이
상한이며, 규칙 자체가 요구한 심각도는 `SpecAuditIssue.ruleSeverity`로 따로 남긴다.

**문서끼리 어긋나는 값은 한쪽을 고르지 않는다.** WEBTOON CANVAS 회차 썸네일이 현행 헬프센터에는
202x142, 더 오래된 공지에는 160x151로 적혀 있다. 두 값을 모두 `conflicts`에 담아 감사 때마다
`provenance` 항목으로 알린다. 다만 이 항목은 `overallGrade`·`isCompliant` 계산에서 제외한다 —
우리 규격표에 대한 단서이지 작가 원고의 결함이 아니며, 완벽한 원고에 영구히 노란 배지를 달면
작가가 배지를 무시하게 된다. 대신 요약 문자열 끝에 `· 규격 출처 주의 N건`이 붙는다.

**이번 판에서 실제로 고쳐진 수치**

| 항목 | 이전 | 현재 | 이유 |
|---|---|---|---|
| `webtoon-canvas` 허용 포맷 | JPG 전용 | JPG · PNG | 공식 문서가 JPG/JPEG/PNG를 허용한다. 이전 값은 공식 규격과 어긋났고 사내 발행 프리셋(`image/png` 허용)과도 충돌했다 |
| `naver-webtoon` 컷 최대 높이 | 20,000px (출처 없음) | 1,280px | 확보한 유일한 출처의 값이며, 내보내기 프리셋 `naver-challenge`와도 일치한다 |
| `naver-webtoon` PNG | 허용 | 거부 보고(저신뢰 → `warn`) | 외부 정리본 한 곳의 주장이라 `fail`을 내지 않고, 메시지가 저신뢰임을 밝힌다 |
| `lezhin-comics` 권장 폭 | 800px (출처 없음) | 1,440px | 2025 공모전 요강. 내보내기 프리셋과도 일치 |
| 회차 단위 한도 | 없음 | CANVAS 20MB/100장, Tapas 20MB, 네이버 50MB | 장당 한도만 보면 4.9MB짜리 12장이 전부 통과한 뒤 회차 58MB로 반려된다 |
| 썸네일 규격 | 없음 | CANVAS 3종 + Tapas 2종 | 공식 문서 기준. 바이트 상한은 "미만" 문언대로 경계값을 통과시킨다 |

**미해결로 남긴 것**
- `toptoon` · `postype` 원고 규격, 봄툰 · 리디는 1차 출처를 찾지 못해 새 수치를 넣지 않았다.
- 스크롤 속도·말풍선 체류 시간·`excessive-void` 1200px는 출처 없는 추정값으로 표시만 해두었다.
- `studio-publish-package.ts`는 MB를 10진(1,000,000)으로, 이 표와 `studio-export-presets.ts`는
  2진(1,048,576)으로 센다. 같은 "2MB"가 서로 다른 정수가 되므로 교차 검증 테스트는 바이트를
  `studio-export-presets.ts`하고만 대조한다. 표기 관례 통일은 별도 과제.

---

## 4. 구현된 아키텍처 및 모듈 구성

| 모듈 경로 | 역할 및 책임 | 커버하는 테스트 |
|---|---|---|
| `src/domains/creator/assistant/webtoon-platform-spec-validator.ts` | 7개 플랫폼 규격·출처·회차 한도·썸네일 검사 및 컷 안전 분할 계획 엔진 | `webtoon-platform-spec-validator.test.ts` (31) |
| `src/domains/creator/assistant/webtoon-scroll-pacing-simulator.ts` | 컷간 여백 기반 모바일 스크롤 리듬 및 완독 시간 시뮬레이터 | `webtoon-scroll-pacing-simulator.test.ts` (15) |
| `src/domains/creator/assistant/webtoon-sfx-lexicon.ts` | 8개 범주 20개 웹툰 한국어 효과음 사전 및 타이포 프리셋 (이전 판의 "40+"는 실제 항목 수와 달랐다) | `webtoon-sfx-lexicon.test.ts` (4) |
| `src/domains/creator/assistant/webtoon-color-harmony-assistant.ts` | 5대 피부톤 및 안티 머디(Anti-Muddy) 쿨톤 음영 생성기 | `webtoon-color-harmony-assistant.test.ts` (3) |
| `src/domains/creator/assistant/webtoon-focus-timer.ts` | 6단계 공정별 포모도로 및 마감 타이머 | `webtoon-focus-timer.test.ts` (6) |
| `src/domains/creator/assistant/webtoon-croquis-pose-guide.ts` | 인터벌 크로키 트레이닝 및 4대 원근 앵글 가이드 | `webtoon-croquis-pose-guide.test.ts` (3) |
| `src/domains/creator/assistant/StudioWebtoonAssistantModal.tsx` | 6개 탭을 갖춘 스튜디오 통합 모달 UI | `StudioWebtoonAssistantModal.test.tsx` (18) |
| `src/domains/creator/StudioCompanionAssistantDisplay.tsx` | 다중 모니터 및 태블릿 컴패니언 윈도우 지원 UI | `StudioCompanionAssistantDisplay.test.tsx` (19) |
| `src/domains/creator/studio-main-menu-items-production.ts` | 스튜디오 메인 메뉴(Production ▸ 웹툰 창작 보조 센터…) 연동 | 전용 테스트 없음. `studio-main-menu-groups.test.ts` (14)가 메뉴 인벤토리로 커버 |
| `src/domains/creator/StudioToolsCompanionPage.tsx` | 컴패니언 윈도우 모드 탭에 `assistant` 추가 | `StudioToolsCompanionPage.test.tsx` (46) |
| `src/domains/creator/StudioCuttoonEditorHost.tsx` | 메인 캔버스 최상위 워크벤치 모달 렌더링 결합 | 전용 테스트 없음. 다수의 `*-boundary.test.ts`가 부분적으로 커버 |

---

## 5. 검증 결과

2026-09-03 규격 출처 작업 시점에 실제로 실행한 명령과 결과:

```
npx vitest run \
  src/domains/creator/assistant/webtoon-platform-spec-validator.test.ts \
  src/domains/creator/assistant/webtoon-scroll-pacing-simulator.test.ts \
  src/domains/creator/assistant/webtoon-sfx-lexicon.test.ts \
  src/domains/creator/assistant/webtoon-color-harmony-assistant.test.ts \
  src/domains/creator/assistant/webtoon-focus-timer.test.ts \
  src/domains/creator/assistant/webtoon-croquis-pose-guide.test.ts \
  src/domains/creator/assistant/StudioWebtoonAssistantModal.test.tsx \
  src/domains/creator/StudioCompanionAssistantDisplay.test.tsx
→ Test Files  8 passed (8)   Tests  99 passed (99)
```

규격 검사기 테스트에는 `studio-export-presets.ts`·`studio-publish-package.ts`와의 교차 검증이
포함돼 있다 — 같은 플랫폼의 폭·포맷·세로 길이·바이트 한도가 세 표에서 갈라지면 실패한다.
어긋난 값은 반드시 `spec.conflicts`에 선언돼 있어야 통과한다.

- 이전 판이 적었던 "118개 이상 전원 통과"의 내역 중 `StudioCuttoonEditorHost.tsx`의 "18 tests"는
  실제로는 `render/studio-webgpu-advanced-live-integration.test.ts`의 개수였고,
  `studio-main-menu-items-production.ts`의 "14 tests"는 `studio-main-menu-groups.test.ts`의
  개수였다. 위 표에서 커버 관계를 실제 파일명으로 바로잡았다.
- 전체 스위트는 `tests/benchmarks/results/*.json`을 덮어쓰므로 이 작업에서는 돌리지 않았다.
