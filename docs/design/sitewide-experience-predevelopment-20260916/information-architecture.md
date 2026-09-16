# 정보 구조와 라우트 계약

## 1. 사용자 목적 구조

URL 디렉터리나 내부 조직이 아니라 사용자가 하려는 일을 기준으로 1차 내비게이션을 구성한다.

| 목적 | 사용자 질문 | 대표 목적지 |
| --- | --- | --- |
| 만들기 | 무엇을 만들고 이어서 작업할까? | 내 작업, 새로 만들기, 소재, 배우기 |
| 영감 찾기 | 어떤 작품·자료·기회가 필요할까? | 작품 찾기, 참고자료, 오늘의 영감, 기회·트렌드 |
| 함께하기 | 누구와 보고 만들고 나눌까? | 갤러리, 커뮤니티, 구인·의뢰 |
| 내 공간 | 내 작업·서재·에셋·설정을 어디서 관리할까? | 프로젝트, 서재, 에셋, 프로필, 설정 |

검색, 도움말, 알림, 언어, 테마, 계정은 사용자 목적지가 아닌 전역 유틸리티다.

## 2. 데스크톱 내비게이션

- 1차 메뉴는 `내 작업`, `새로 만들기`, `소재`, `배우기` 또는 독자 문맥의 `찾기`, `랭킹`, `커뮤니티`, `내 서재`로 제한한다.
- 제품 문맥은 URL이 아니라 Route Registry의 `product`와 `shell`로 판정한다.
- 전체 기능은 `/sitemap`과 `⌘K` 명령 팔레트에서 제공한다.
- 현재 위치는 링크 색상만이 아니라 텍스트·`aria-current`·하위 문맥 제목으로 표시한다.
- 라우트가 변경돼도 동일 문서의 CreatorShell 런타임은 불필요하게 재마운트하지 않는다.
## 3. 모바일 내비게이션

### BrowseShell

- 하단 탭: 홈, 찾기, 랭킹, 커뮤니티, 내 서재
- 검색과 전체 메뉴는 상단 유틸리티
- 필터는 고정 가로 칩 대신 하단 시트와 적용 조건 요약으로 제공
- 긴 히어로·문맥 배너는 첫 방문 후 축소하고 재방문 시 목록부터 표시

### CreatorShell

- 일반 사이트 하단 탭을 제거한다.
- 상단에는 뒤로가기, 프로젝트명, 저장 상태, 공유·내보내기만 유지한다.
- 모바일 지원 수준은 `full`, `review`, `preview`, `unsupported` 네 단계로 표시한다.
- `review`는 확대·이동·댓글·승인·재생을 제공하지만 정밀 편집 도구는 숨긴다.
- 데스크톱 전환 QR·링크와 현재 작업 보존 상태를 제공한다.

### DocsShell

- 상단에 문서 제목과 목차 열기 버튼을 둔다.
- 본문 아래 하단 탭을 노출하지 않는다.
- 목차는 모바일 시트로 제공하고 현재 절을 표시한다.

## 4. 셸 결정 규칙

```text
admin/immersive editor route  → 전용 경계, 이 문서의 공통 셸 밖
studio document/tool route    → CreatorShell
help/legal/trust route        → DocsShell
그 외 사용자 콘텐츠 route   → BrowseShell
```

셸 판정은 경로 접두사 배열을 여러 파일에서 반복하지 않는다. Route Registry의 정적 메타데이터를 단일 권위로 사용한다.
## 5. Route Registry 계약

```ts
export type RouteShell = "browse" | "creator" | "docs";
export type RoutePurpose = "create" | "discover" | "learn" | "connect" | "manage" | "trust";
export type RouteAccess = "public" | "sign-in" | "project";
export type RouteMaturity = "stable" | "beta" | "experimental";
export type DeviceMode = "responsive" | "desktop-first" | "desktop-only";
export type MobileMode = "full" | "review" | "preview" | "unsupported";

export interface SiteRouteDefinition {
  readonly id: string;
  readonly path: string;
  readonly canonicalPath: string;
  readonly aliases?: readonly string[];
  readonly titleKey: string;
  readonly label: { readonly ko: string; readonly en: string };
  readonly description: { readonly ko: string; readonly en: string };
  readonly keywords: readonly string[];
  readonly product: "studio" | "spectrum" | "docs";
  readonly shell: RouteShell;
  readonly template: PageTemplate;
  readonly purpose: RoutePurpose;
  readonly access: RouteAccess;
  readonly projectContext: "none" | "optional" | "required";
  readonly maturity: RouteMaturity;
  readonly device: DeviceMode;
  readonly mobileMode: MobileMode;
  readonly primaryAction: RouteActionDefinition;
  readonly owner: RouteOwner;
}
```
```ts
export type PageTemplate =
  | "editorial-landing"
  | "collection"
  | "search-results"
  | "comparison"
  | "dashboard"
  | "workflow"
  | "document"
  | "immersive-editor"
  | "reader";

export interface RouteActionDefinition {
  readonly labelKey: string;
  readonly kind: "navigate" | "command" | "submit" | "open-project";
  readonly target?: string;
  readonly event: string;
}

export interface RouteOwner {
  readonly domain: string;
  readonly team?: string;
  readonly recoveryOwner: string;
}
```

### 필수 검증

- `id`, `path`, `canonicalPath`는 중복될 수 없다.
- alias는 다른 정식 경로와 충돌할 수 없다.
- `access=project`이면 `projectContext=required`여야 한다.
- `shell=creator`인 몰입형 편집기는 명시적인 `mobileMode`가 필요하다.
- 모든 라우트는 한국어·영어 레이블, 설명, 문서 제목을 가진다.
- Primary action은 정확히 하나이며 분석 이벤트 이름을 가진다.
## 6. Canonical URL 정책

| 별칭 | 정식 목적지 | 처리 |
| --- | --- | --- |
| `/brush-lab` | `/studio/assets/brushes/new` | 내부 링크·검색에서 제거, 영구 리디렉션 유지 |
| `/music` | `/studio/assets/audio` | 내부 링크·검색에서 제거, 영구 리디렉션 유지 |
| `/publishing` | `/studio/publish` | 내부 링크·검색에서 제거, 영구 리디렉션 유지 |
| `/me` | 장기적으로 `/my/profile` | 즉시 변경하지 않고 통합 UX 후 단계적 이전 |
| `/studio/ai-settings` | `/settings/ai?context=studio` 또는 Registry 기반 뷰 | 저장 권위 통합 후 이전 |

### 적용 범위

Canonical은 다음 모든 소비자가 공유한다.

- 사이트맵과 글로벌 메뉴
- 검색·명령 팔레트
- 최근 방문·즐겨찾기
- 분석 이벤트
- 문서 제목·OG·canonical 태그
- 브라우저 테스트와 링크 검사

리디렉션 직후 화면이 비거나 앱 셸이 사라지는 상태는 성공으로 간주하지 않는다. 정식 목적지가 의미 있는 콘텐츠를 렌더한 뒤에만 리디렉션 테스트가 통과한다.

## 7. 접근·프로젝트 문맥

### Public

로그인 없이 핵심 가치, 예시, 제한 조건을 볼 수 있다. 쓰기 행동에서 로그인하도록 한다.

### Sign-in

로그인 전에도 화면의 목적과 완성 예시를 보여준다. 인증 후 원래 주소와 입력 초안을 복원한다.
### Project required

- 프로젝트가 선택되지 않았으면 일반 오류를 표시하지 않는다.
- 최근 프로젝트, 프로젝트 검색, 새 프로젝트, 샘플 프로젝트를 제공한다.
- 프로젝트 선택 후 현재 하위 화면으로 복귀한다.
- 권한 없음, 삭제됨, 오프라인 미보유, 서버 미연결을 구분한다.

### Project optional

프로젝트 없이 독립적으로 사용할 수 있으나 현재 프로젝트를 선택하면 결과를 바로 연결할 수 있다. 예: 리서치, 에셋 비교, 브러시 제작.

## 8. 페이지 템플릿

### Editorial landing

대상: 홈, 소개, 발견 허브, 커뮤니티 허브, 쇼케이스, 학습·리서치 허브

구조:

1. 결과 중심 H1와 Primary CTA
2. 실제 기능 또는 작품 미리보기
3. 주요 경로 3~5개
4. 신뢰·제약 정보
5. 다음 행동

재방문 사용자에게는 긴 소개보다 최근 활동과 바로가기를 우선한다.

### Collection

대상: 작가, 캘린더, 뉴스, 태그, 서재, 에셋 목록

구조:

1. 제목·결과 수·주 행동
2. 검색·정렬·필터
3. 적용 조건 요약
4. 가상화 또는 페이지 처리된 목록
5. 빈 상태·오류·갱신 시점
### Search results

대상: 통합 검색, 작품 탐색

- 검색어와 스코프를 URL에 직렬화한다.
- 작품·작가·태그·자료 탭을 구분한다.
- 최근 검색과 저장 검색을 제공한다.
- 모바일 필터는 하단 시트, 데스크톱은 접이식 사이드 또는 상단 바를 사용한다.
- 검색 결과 없음과 데이터 제공자 오류를 구분한다.

### Comparison

대상: 작품 비교, 에셋 비교, 제작 적합성

- 빈 슬롯 자체가 검색·최근 항목 진입점이다.
- 비교 기준의 출처와 계산 방식을 제공한다.
- `차이만 보기`, 공유 링크, 후보 교체를 지원한다.
- 모바일에서는 열을 세로 카드 또는 기준별 스와이프가 아닌 명시적 탭으로 전환한다.

### Dashboard

대상: 내 공간, 설정, 판매자 센터, 작업 큐, 프로젝트 운영

- 오늘 할 일과 주의가 필요한 상태를 먼저 표시한다.
- 지표는 행동과 연결되며 장식용 숫자를 만들지 않는다.
- 카드 배치를 개인화할 수 있으나 기본 정보 위계는 유지한다.
- 빈 상태는 샘플·가져오기·새로 만들기 중 하나를 제공한다.

### Workflow

대상: 공고 작성, 게시, 에셋 등록, 변환·생성 도구

- 단계, 완료 조건, 오류 수를 항상 표시한다.
- 자동 저장과 재개 위치를 보장한다.
- 실행 전 예상 시간·비용·권리·출력 형식을 확인시킨다.
- 오류 요약에서 해당 필드나 단계로 이동한다.
### Document

대상: 도움말, 정책, 데이터 출처, 디자인 시스템

- 읽기 폭 65~75ch
- 고정 또는 시트형 목차
- 시행일·갱신일·변경 이력
- 절 링크 복사와 인쇄
- 일반 사용자 요약과 전문 상세 분리

### Immersive editor

대상: 드로잉, 애니메이션, 3D, 캐릭터, 포즈

- 글로벌 마케팅 셸을 제거한다.
- 프로젝트·저장·공유·내보내기 상태를 전용 크롬에 둔다.
- 패널·캔버스·도구막대의 포커스 순서를 시각 순서와 맞춘다.
- WebGL·엔진·파일 준비 실패가 문서 런타임을 언마운트하지 않는다.
- 모바일은 Route Registry의 `mobileMode`에 따라 전용 표면을 렌더한다.

### Reader

대상: 공간형 웹툰 감상

- 기본 평면 보기와 실험적 공간 보기를 언제든 전환한다.
- 모션 감소, 자동 재생 정지, 키보드·터치 탐색을 지원한다.
- 기기 성능이 부족하면 일반 스크롤 보기를 자동 제안한다.

## 9. 중복 목적지 역할 정의

| 목적지 | 정식 역할 |
| --- | --- |
| `/discover` | 작품 발견 방법을 선택하는 허브 |
| `/search` | 명시적인 검색어 기반 결과 |
| `/explore` | 장르·분위기·조건 기반 탐색 |
| `/recommend` | 사용자 피드백을 반영한 개인화 추천 |
| `/random` | 최소 조건으로 한 작품을 우연히 발견 |
| `/tags` | 태그 사전·관계·대표 작품 탐색 |
| 목적지 | 정식 역할 |
| --- | --- |
| `/references` | 좋은 출처를 찾고 조사 질문을 시작하는 공개 진입점 |
| `/research` | 프로젝트 질문·자료·근거 공백을 관리하는 작업대 |
| `/research/catalog` | 출처·라이선스가 검증된 큐레이션 모음 |
| `/research/assets` | 의상·소품·장소 등 시각 레퍼런스 탐색 |
| `/feedback` | 공개 버그·아이디어·기능 요청과 상태 |
| `/support` | 문제 진단·개인 지원 경로·티켓 준비 |
| `/my` | 개인 작업·활동·관리의 통합 대시보드 |
| `/me` | 프로필·계정 세부 화면, 장기적으로 `/my/profile` |
| `/settings/ai` | AI 공급자·키·우선순위의 단일 저장 권위 |
| `/studio/ai-settings` | Studio에서 쓰는 기능별 모델 프리셋 뷰 |

## 10. 사이트맵의 역할

사이트맵은 단순 링크 목록이 아니라 Route Registry의 사용자용 뷰다.

각 카드에 다음 정보를 표시한다.

- 이름과 한 줄 결과 설명
- 소속 제품과 목적
- Stable·Beta·Experimental
- 로그인·프로젝트 필요 여부
- Responsive·Desktop-first
- 최근 방문·즐겨찾기
- 현재 점검 중 또는 일시적 제한

필터는 제품, 목적, 상태, 환경, 권한, 2D·3D·AI·협업 기능으로 제공한다. 동적 상세, 인증 콜백, 관리자, 내부 companion, alias는 공개 디렉터리에서 제외한다.

## 11. 코드 소유권

- `src/app/routes`: registry 조합, 전역 경계, 셸 선택만 소유
- `src/domains/*`: 페이지 데이터와 과업 흐름 소유
- `src/shared/components/site-*`: 제품 비종속 셸·공통 상태만 소유
- `src/infrastructure`: 네트워크·저장·기기 능력 어댑터
- Studio runtime: 문서 수명·저장·협업 권위 유지

도메인 페이지가 다른 도메인의 페이지 내부를 import하지 않는다. 이동은 정식 경로 또는 안정된 도메인 계약을 통한다.
## 12. 도입 순서

1. 현재 라우트 정의를 변경하지 않고 Registry를 읽기 전용으로 추가한다.
2. 중복 경로·제목·사이트맵·검색 메타데이터 테스트를 Registry 기준으로 전환한다.
3. alias 링크를 canonical로 교체하고 리디렉션 계약 테스트를 추가한다.
4. RouteFrame이 H1·빈 화면·오류 복구를 보장하도록 한다.
5. 공개 페이지부터 BrowseShell·DocsShell로 이동한다.
6. 프로젝트 운영 화면을 CreatorShell로 이동한다.
7. 몰입형 편집 표면은 기존 문서 런타임 계약을 유지한 채 크롬만 전환한다.
8. 마지막에 사용되지 않는 분산 메타데이터와 경로 배열을 제거한다.

각 단계는 이전 단계와 독립적으로 롤백할 수 있어야 한다.

## 13. Registry 기반 자동 생성 대상

- React Router route groups의 메타데이터 검증
- 문서 제목과 canonical link
- 헤더·드로어·모바일 탭
- 사이트맵과 명령 팔레트
- 검색용 페이지 색인
- 최근 방문과 즐겨찾기 정규화
- route smoke test 목록
- 접근 조건·디바이스 배지
- 분석 이벤트의 route id

페이지 컴포넌트 자체를 Registry에서 동적으로 생성하지 않는다. 코드 분할과 도메인 소유권을 위해 lazy element는 기존 route group에서 명시적으로 조합한다.

## 14. 승인 필요 결정

- `/me`를 실제로 `/my/profile`로 이전할 시점
- `/studio/ai-settings` URL 유지 여부
- `desktop-only`를 허용할지, 모두 `desktop-first + mobile review`로 제공할지
- 실험적 라우트를 일반 사이트맵에 기본 노출할지
- BrowseShell의 ToonStudio·ToonSpectrum 브랜드 표시 관계

이 결정은 구현 중 임의로 확정하지 않고 제품 결정 기록에 남긴다.