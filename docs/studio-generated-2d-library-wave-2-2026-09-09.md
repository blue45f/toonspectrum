# ToonStudio 생성형 2D 라이브러리 Wave 2

작성일: 2026-09-09

## 목적

Studio 삽입 허브에서 즉시 사용할 수 있는 프로젝트 내장 SVG 에셋을 확장한다.
외부 이미지·외부 폰트·이모지·원격 URL에 의존하지 않고, 모든 원본을 코드 기반 SVG
도형·패스·그라디언트로 구성해 확대·내보내기·오프라인 사용의 예측 가능성을 유지한다.

## 납품 범위

- Wave 1 유지: 24종
- Wave 2 신규: 43종
  - 배경 11종
  - 소품 16종
  - 캐릭터 버스트 8종
  - 드로잉 구조 자료 8종
- 통합 라이브러리 합계: 67종

## Wave 2 인벤토리

### 배경

- `gen2d-bg-rain-platform` — 비 내리는 도시 전철 승강장
- `gen2d-bg-rooftop-garden` — 노을빛 루프탑 정원
- `gen2d-bg-cozy-kitchen` — 아침 햇살이 드는 코지 키친
- `gen2d-bg-detective-office` — 심야의 탐정 사무실
- `gen2d-bg-royal-library` — 황금빛 왕실 대도서관
- `gen2d-bg-snow-village` — 별빛 아래 설원 마을
- `gen2d-bg-sunset-canyon` — 석양의 거대 협곡
- `gen2d-bg-orbital-hangar` — 행성 궤도의 SF 격납고
- `gen2d-bg-underwater-ruins` — 심해의 고대 유적
- `gen2d-bg-lantern-street` — 등불 축제의 전통 거리
- `gen2d-bg-art-classroom` — 햇살 가득 미술 교실

### 소품

- `gen2d-prop-modular-sofa` — 모듈형 패브릭 소파
- `gen2d-prop-camera` — 빈티지 레인지파인더 카메라
- `gen2d-prop-smartphone` — 크리에이터 스마트폰
- `gen2d-prop-bouquet` — 계절 꽃다발
- `gen2d-prop-travel-case` — 스티커가 붙은 여행 가방
- `gen2d-prop-ramen-set` — 라멘과 교자 트레이
- `gen2d-prop-synth` — 스테이지 신시사이저
- `gen2d-prop-lab-console` — SF 연구실 제어 콘솔
- `gen2d-prop-food-kiosk` — 야간 거리 푸드 키오스크
- `gen2d-prop-floor-lamp` — 아치형 플로어 램프
- `gen2d-prop-art-cart` — 이동식 미술 도구 카트
- `gen2d-prop-fireplace` — 고풍스러운 벽난로
- `gen2d-prop-medical-cart` — 병원 응급 처치 트롤리
- `gen2d-prop-treasure-chest` — 마법 보물 상자
- `gen2d-prop-neon-sign` — 별빛 네온 사인
- `gen2d-prop-library-wall` — 모듈형 라이브러리 월

### 캐릭터

- `gen2d-character-project-manager` — 프로젝트 매니저 캐릭터
- `gen2d-character-barista` — 따뜻한 카페 바리스타
- `gen2d-character-detective` — 도시 미스터리 탐정
- `gen2d-character-royal-guard` — 왕실 근위 기사
- `gen2d-character-cyber-runner` — 네온 시티 사이버 러너
- `gen2d-character-fantasy-scholar` — 고전 판타지 학자
- `gen2d-character-medical-resident` — 응급의학 레지던트
- `gen2d-character-stage-idol` — 별빛 스테이지 아이돌

### 구조 자료

- `gen2d-guide-head-turns-8` — 머리 회전 8방향 구조 시트
- `gen2d-guide-hand-gestures` — 손 제스처 구조 시트
- `gen2d-guide-dynamic-action` — 다이내믹 액션 포즈 구조
- `gen2d-guide-fabric-folds` — 의상 주름과 장력 구조
- `gen2d-guide-face-light-planes` — 얼굴 조명 면 분할 구조
- `gen2d-guide-two-point-interior` — 2점 투시 실내 블로킹 구조
- `gen2d-guide-expression-12` — 표정 변화 12종 구조 시트
- `gen2d-guide-silhouette-ratios` — 캐릭터 실루엣 비율 구조

## 제품 배선

`StudioUnifiedAssetToolPopoverContent`가 기존 배경·요소 카탈로그와 생성형 2D 라이브러리를
합쳐 삽입 허브에 제공한다. 배경은 기존 배경 삽입 경로를, 소품·캐릭터·구조 자료는 기존
SVG 요소 삽입 경로를 재사용한다. 생성형 항목은 통합 카탈로그에서 다음 메타데이터를 받는다.

- `AI 생성`
- `프로젝트 내장`
- `외부 리소스 없음`
- `무손실 확대`

## 품질·안전 검증

테스트는 다음을 고정한다.

1. Wave 1·2의 정확한 수량과 ID·표시 이름의 전역 유일성
2. 모든 ID의 `gen2d-` 네임스페이스 준수
3. SVG `viewBox` 존재와 최소 캔버스 크기
4. `<image>`, `<script>`, `<foreignObject>` 금지
5. 원격·데이터·JavaScript URI를 가리키는 `href` 금지
6. 배경·소품·캐릭터·구조 및 주요 제작 의도 검색
7. 통합 카탈로그에서 Featured 상태와 생성형 배지 유지

## 권리 표기

이 팩은 저장소 안에서 신규 작성한 결정적 SVG 코드로만 구성한다. 제3자 원본을 재배포하지
않으며, 외부 리소스를 참조하지 않는다. UI에서는 생성형 항목임을 숨기지 않고 `AI 생성`
배지를 유지한다.
