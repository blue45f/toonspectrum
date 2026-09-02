# 웹툰 보조 앱 및 사이트 전수 분석 및 ToonSpectrum 고도화 벤치마크 보고서 (2026-09-03)

## 1. 개요 및 목적
본 문서는 국내외 웹툰 작가, 어시스턴트, 스튜디오들이 원고 제작 과정에서 활용하는 대표적인 웹툰 보조 앱, 웹 서비스, 유틸리티 사이트들을 총망라하여 분석하고, 그 중 핵심적인 유용 기능들을 ToonSpectrum 스튜디오 내에 네이티브 엔진 및 UI로 내재화한 구현 내역을 정리합니다.

---

## 2. 조사 및 벤치마킹 대상 서비스 분석

### 1) ToonSlicer / 웹툰 컷 자르기 툴
- **주요 기능**: 원고의 긴 세로 스트립(최대 수만 픽셀)을 네이버, 카카오, 라인망가 등 플랫폼 규격에 맞춰 자동 분할 내보내기.
- **핵심 유용성**: 단순 기계식 등분 절단 시 인물 얼굴이나 말풍선 한가운데가 잘려나가는 치명적인 문제를 방지하는 **안전 여백 절단(Safe Split Gutter)** 알고리즘.
- **ToonSpectrum 반영**:
  - `WebtoonPlatformSpecValidator`: 네이버웹툰(690px), 카카오페이지(720px), 라인망가 Canvas(800x1280px 엄격 제한), 레진(800/1440px), 탑툰(800px), 포스타입(1600px) 규격 검사기.
  - `planAutoSlices`: 인물 컷 및 말풍선 충돌을 감지하여 컷 간 여백(Gutter)을 자동으로 찾아내는 스마트 안전 슬라이스 계획 엔진.

### 2) Spirall Webtoon Previewer / Llamagen Pacing Simulator
- **주요 기능**: 모바일 환경에서 독자가 스크롤할 때 느껴지는 연출 템포(Rhythm)와 여백(Gutter)의 적정성을 시뮬레이션.
- **핵심 유용성**:
  - 컷 간 여백 길이에 따른 연출 비트 분류 (액션 급박 50~180px, 표준 대화 180~380px, 씬 전환 380~650px, 서스펜스/클리프행어 650~1200px, 과도한 공백 >1200px 경고).
  - 독자 독서 성향별(속독 700px/s, 표준 350px/s, 정독 180px/s) 에피소드 완독 체감 시간 계산.
- **ToonSpectrum 반영**: `WebtoonScrollPacingSimulator` 모듈 구현 완료.

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

## 3. 구현된 아키텍처 및 모듈 구성

| 모듈 경로 | 역할 및 책임 | 테스트 현황 |
|---|---|---|
| `src/domains/creator/assistant/webtoon-platform-spec-validator.ts` | 6대 플랫폼 규격 검사 및 컷 안전 분할 계획 엔진 | 5 tests passed |
| `src/domains/creator/assistant/webtoon-scroll-pacing-simulator.ts` | 컷간 여백 기반 모바일 스크롤 리듬 및 완독 시간 시뮬레이터 | 4 tests passed |
| `src/domains/creator/assistant/webtoon-sfx-lexicon.ts` | 8개 범주 40+ 웹툰 한국어 효과음 사전 및 타이포 프리셋 | 4 tests passed |
| `src/domains/creator/assistant/webtoon-color-harmony-assistant.ts` | 5대 피부톤 및 안티 머디(Anti-Muddy) 쿨톤 음영 생성기 | 3 tests passed |
| `src/domains/creator/assistant/webtoon-focus-timer.ts` | 6단계 공정별 포모도로 및 마감 타이머 | 6 tests passed |
| `src/domains/creator/assistant/webtoon-croquis-pose-guide.ts` | 인터벌 크로키 트레이닝 및 4대 원근 앵글 가이드 | 3 tests passed |
| `src/domains/creator/assistant/StudioWebtoonAssistantModal.tsx` | 6개 탭을 갖춘 스튜디오 통합 모달 UI | 2 tests passed |
| `src/domains/creator/StudioCompanionAssistantDisplay.tsx` | 다중 모니터 및 태블릿 컴패니언 윈도우 지원 UI | 1 test passed |
| `src/domains/creator/studio-main-menu-items-production.ts` | 스튜디오 메인 메뉴(Production ▸ 웹툰 창작 보조 센터…) 연동 | 14 tests passed |
| `src/domains/creator/StudioToolsCompanionPage.tsx` | 컴패니언 윈도우 모드 탭에 `assistant` 추가 | 46 tests passed |
| `src/domains/creator/StudioCuttoonEditorHost.tsx` | 메인 캔버스 최상위 워크벤치 모달 렌더링 결합 | 18 tests passed |

---

## 4. 검증 결과
- **단위 및 컴포넌트 테스트**: 118개 이상의 관련 테스트 전원 통과 (assistant 27개, companion 46개, menu-groups 14개, command-catalog 24개, webgpu 18개).
- **아키텍처 규격 검증**: 컴포넌트 간 결합도 최소화, React Compiler 규칙 준수, 번들 최적화 완료.
