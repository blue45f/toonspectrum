# ADR 0023 — 사이트 전면 Route Registry와 Browse·Creator·Docs 셸 경계

## 상태

제안 (2026-09-16)

## 맥락

ToonStudio 공개 사이트와 Studio 생태계는 작품 탐색, 커뮤니티, 학습, 리서치, 마켓, 개인 공간, 2D·3D·AI 제작까지 확장됐다. `/sitemap` 기준 사용자 목적지는 108개이며, 경로 제목, 내비게이션, 공개 여부, 사이트맵, Studio 문맥 판정이 여러 파일과 배열에 분산돼 있다.

운영 화면 감사에서 다음 구조적 문제가 확인됐다.

- HTTP 200이지만 의미 있는 UI가 없는 route
- alias와 정식 목적지가 동시에 사용자에게 노출되는 문제
- 공개 페이지·문서·몰입형 편집기가 유사한 전역 셸을 공유하는 문제
- 로그인·프로젝트·디바이스 요구 조건이 route 진입 후에 드러나는 문제
- 이름 없는 조작, H1 누락, 작은 모바일 조작 요소
- Studio companion 페이지가 동일 프로젝트 문맥을 일관되게 표현하지 못하는 문제

기존 `AppRouter`의 선언형 보안 경계, 도메인별 lazy route, ADR-0016의 Studio document runtime은 유지해야 한다.
## 결정

### 1. 단일 사용자 route registry

사용자에게 직접 노출되는 정식 목적지는 typed Route Registry에 다음 메타데이터를 가진다.

- id, path, canonical path, aliases
- 한국어·영어 이름, 설명, 검색 키워드
- product, purpose, shell, page template
- access, project context, maturity, device, mobile mode
- primary action과 코드 소유자

Registry는 page component나 icon을 import하지 않는 정적·순수 모듈이다. 실제 lazy element와 route ordering은 기존 `app/routes/groups`가 계속 소유하며 CI가 두 권위를 대조한다.

### 2. 세 가지 셸

- **BrowseShell:** 작품·커뮤니티·학습·리서치·마켓·개인 관리
- **CreatorShell:** 프로젝트 운영, 드로잉, 애니메이션, 3D, AI, 게시·검토
- **DocsShell:** 도움말, 접근성, 데이터 출처, 법률·정책·신뢰 문서

셸은 레이아웃과 전역 내비게이션만 소유한다. 도메인 데이터와 mutation authority를 소유하지 않는다.

### 3. 공통 route frame

RouteFrame은 문서 제목, canonical, H1, 포커스·스크롤, 오류 경계, 의미 있는 콘텐츠 readiness와 stalled recovery를 보장한다. 페이지는 pending, ready, empty, blocked, error 상태를 명시한다.
### 4. Studio runtime 보존

CreatorShell은 ADR-0016의 document identity와 presentation identity를 다시 계산하지 않는다. `StudioDocumentRuntimeBoundary`의 문서·저장·협업 권위를 그대로 사용하고 크롬과 상태 projection만 제공한다.

DCC·AI·외부 엔진 오류는 해당 surface 안에서 복구하며 문서, undo history, autosave, collaboration을 언마운트하지 않는다.

### 5. canonical 우선

내비게이션, 사이트맵, 검색, 명령 팔레트, 최근 방문, 분석은 canonical path만 생성한다. legacy alias는 한정된 기간 동안 경계에서 해석하고 정식 목적지로 이동한다.

초기 canonical 대상은 다음과 같다.

- `/brush-lab` → `/studio/assets/brushes/new`
- `/music` → `/studio/assets/audio`
- `/publishing` → `/studio/publish`

### 6. 단계적 도입

Registry, RouteFrame, 셸, 고밀도 페이지, Creator 프로젝트, 몰입형 Studio 순으로 feature flag 아래에서 수직 슬라이스로 도입한다. 모든 페이지를 한 PR에서 변경하지 않는다.

## 결과

### 긍정적

- 사용자 목적지와 상태를 하나의 계약으로 감사할 수 있다.
- 빈 화면, H1 누락, alias 드리프트를 자동 검증할 수 있다.
- 공개 탐색, 전문 편집, 문서 읽기에 맞는 정보 밀도를 적용할 수 있다.
- Studio chrome 변경이 문서 런타임과 분리된다.
- 사이트맵이 기능 목록이 아니라 상태가 있는 제품 디렉터리가 된다.
### 비용·제약

- 이관 기간 동안 기존 route metadata와 Registry가 함께 존재한다.
- route group과 Registry를 비교하는 테스트를 유지해야 한다.
- 공통 상태 모델이 도메인 고유 오류를 지나치게 단순화하지 않도록 recovery command를 도메인이 소유해야 한다.
- 모바일 Creator 모드는 표면별 제품 결정을 요구한다.
- 외부 공급자·GPU·저장 상태의 정확한 표현을 위한 adapter가 필요하다.

## 고려한 대안

### 현재 분산 목록 유지

변경 비용은 낮지만 route·제목·사이트맵·공개 정책 드리프트와 빈 화면 감사 문제를 유지한다.

### React Router framework mode로 전환

자동 route module과 data loading 이점이 있으나 현재 선언형 보안 경계, 코드 분할, 데이터 로딩 의미를 동시에 변경한다. 이번 범위에서는 채택하지 않는다.

### 모든 route를 하나의 거대 생성 파일에서 렌더

단일 목록은 만들 수 있지만 도메인 lazy boundary와 변경 지역성을 훼손한다. Registry는 메타데이터만 소유한다.

### Studio v2 별도 애플리케이션

깨끗한 셸을 만들 수 있으나 문서·autosave·협업의 두 번째 권위를 만든다. 기존 금지 원칙과 충돌하므로 채택하지 않는다.

## 후속 작업

구현 순서와 검증 기준은 `docs/design/sitewide-experience-predevelopment-20260916/` 패키지를 따른다. ADR 승인 전에는 대규모 route·셸 전환을 시작하지 않으며 P0 빈 화면 복구는 독립적으로 선행할 수 있다.