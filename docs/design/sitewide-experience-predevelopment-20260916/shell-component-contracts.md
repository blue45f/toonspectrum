# 셸·페이지·컴포넌트 계약

## 1. 공통 RouteFrame

`RouteFrame`은 모든 사용자 라우트에 다음 품질 계약을 적용한다.

```ts
interface RouteFrameProps {
  route: SiteRouteDefinition;
  locationKey: string;
  children: React.ReactNode;
}
```

### 책임

- 문서 제목과 canonical link 동기화
- 실제 H1 하나 보장, 개발 환경에서 중복 경고
- 라우트 전환 후 포커스·스크롤 정책 적용
- lazy chunk·render·data 오류 경계
- 의미 있는 콘텐츠가 없는 200 화면 감지
- 8초, CreatorShell은 12초 이후 지연 복구 UI
- route id 기반 page-view 이벤트
- 인증·프로젝트·디바이스 정책과 셸 조합

RouteFrame이 도메인 로딩 상태를 추측해 덮어쓰지 않는다. 페이지가 `data-route-ready`, `data-route-pending`, `data-route-empty` 상태를 명시하도록 한다.
## 2. BrowseShell

### 사용 범위

작품 탐색, 랭킹, 커뮤니티, 갤러리, 학습, 리서치, 마켓 공개 화면, 개인 대시보드와 설정.

### 데스크톱 구조

```text
┌ Global header: brand | primary nav | search | create | account ┐
├ Optional local context / breadcrumb                              ┤
│ Page header: H1, outcome copy, primary action, status            │
│ Search / filter / tabs / content                                 │
│ Contextual next action                                           │
└ Footer                                                           ┘
```

### 모바일 구조

```text
┌ 56px header: logo | search | account | menu ┐
├ Collapsible context line                     ┤
│ Page header or direct results                │
│ Content                                      │
└ Stable five-tab navigation                   ┘
```

### 규칙

- 재방문 빈도가 높은 collection·dashboard는 마케팅 히어로를 반복 표시하지 않는다.
- `PublicSiteNextSteps`류의 공통 후속 섹션은 페이지 과업과 관련된 경우에만 렌더한다.
- 동일한 작품 이미지를 모든 공개 페이지의 기본 히어로로 재사용하지 않는다.
- 헤더·컨텍스트·하단 탭을 합친 모바일 고정 영역은 뷰포트 높이의 18%를 넘지 않는다.
## 3. CreatorShell

### 사용 범위

Studio 문서 편집, DCC, 애니메이션, 브러시, 캐릭터, 포즈, 게시, 검토, 공유, 버전, 프로젝트 운영.

### 크롬 계약

```text
┌ Back | Project / Document | Save state | Presence | Share | Export ┐
├ Surface tabs / mode switch / contextual notices                    ┤
│ Toolbar │ Canvas / work surface │ Inspector / comments             │
├ Optional timeline / pages / jobs                                   ┤
└ Status bar: zoom | engine | offline | sync | shortcuts             ┘
```

- 글로벌 마케팅 헤더·푸터·사이트 하단 탭을 렌더하지 않는다.
- 문서명은 `무제`만 표시하지 않고 저장 상태와 함께 편집 가능하게 한다.
- 저장 상태는 `저장 중`, `이 기기에 저장됨`, `서버와 동기화됨`, `오프라인`, `충돌`, `복구 필요`로 구분한다.
- 현재 프로젝트·문서·역할을 모든 companion 페이지에서 동일한 ContextBar로 제공한다.
- 표면 이동은 ADR-0016의 문서 identity와 presentation identity를 유지한다.
- DCC·AI·외부 엔진 실패는 해당 surface만 격리하고 문서·협업·undo 런타임은 보존한다.

### 모바일 모드

| 모드 | 허용 |
| --- | --- |
| `full` | 핵심 제작·저장·내보내기까지 수행 |
| `review` | 이동·확대·재생·댓글·승인·간단 수정 |
| `preview` | 보기·상태 확인·데스크톱 이어하기 |
| `unsupported` | 이유·요구 조건·안전한 대체 경로 |
## 4. DocsShell

### 사용 범위

도움말, 이용 문의, 접근성, 데이터 출처, 수집 정책, 기술과 신뢰, 저작권, 개인정보, 이용약관, 디자인 시스템.

### 구조

```text
┌ Compact global header ┐
├ Breadcrumb / category ┤
│ Local TOC │ 65–75ch document body │ Related policy / action │
└ Updated date / history / print / copy link                        ┘
```

### 규칙

- 본문 안에 반복 마케팅 전환 섹션을 삽입하지 않는다.
- 문서 상단에 쉬운 말 요약과 적용 범위를 제공한다.
- 정책 문서는 시행일·최종 갱신일·이전 버전 링크를 가진다.
- 섹션 제목은 딥 링크를 지원하며 링크 복사 후 포커스가 유지된다.
- 모바일 목차는 modal이 아니라 닫기·포커스 복원이 보장된 sheet로 제공한다.
- 도움말은 현재 route·온라인 상태·화면 크기 등 비민감 진단을 사용자가 확인한 후 복사한다.

## 5. PageHeader

```ts
interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: string;
  description: React.ReactNode;
  primaryAction?: ActionDescriptor;
  secondaryActions?: readonly ActionDescriptor[];
  badges?: readonly RouteBadge[];
  visual?: React.ReactNode;
  density?: "hero" | "standard" | "compact";
}
```
### 규칙

- `title`은 페이지의 유일한 시각 H1이다.
- primary action은 한 개만 허용한다.
- secondary action은 최대 두 개다.
- badge는 `Beta`, `로그인 필요`, `프로젝트 필요`, `데스크톱 권장`, `데이터 갱신`처럼 행동에 영향을 주는 정보만 표시한다.
- collection·dashboard는 `compact` 또는 `standard`를 사용한다.
- 2회차 이후 방문에는 긴 hero를 축소할 수 있으나 H1과 주 행동은 유지한다.

## 6. ContextBar

프로젝트·검색·문서의 현재 문맥을 한 줄로 표현한다.

```ts
interface ContextBarProps {
  breadcrumbs: readonly BreadcrumbItem[];
  context?: ProjectContextSummary;
  status?: readonly StatusIndicator[];
  actions?: readonly ActionDescriptor[];
  collapsibleOnMobile?: boolean;
}
```

- Studio companion 화면은 같은 프로젝트명·문서명·역할·저장 상태를 공유한다.
- 공개 사이트에서는 기존의 큰 `TOONSTUDIO / 01 / ...` 배너를 대체한다.
- 모바일에서는 한 줄 breadcrumb와 상태 아이콘만 남기고 나머지는 확장 시트에서 제공한다.

## 7. RouteBadge

| 배지 | 표시 조건 | 행동 |
| --- | --- | --- |
| Stable | 일반적으로 생략 | 사이트맵 상세에서만 표시 가능 |
| Beta | 결과가 저장되지만 일부 기능 제한 | 제한 보기 링크 |
| Experimental | 형식·결과가 변경될 수 있음 | 동의·피드백 링크 |
| Login required | 쓰기 또는 개인 데이터 필요 | 로그인 후 현재 위치 복귀 |
| Project required | 프로젝트 컨텍스트 필요 | 프로젝트 선택기 열기 |
| Desktop-first | 모바일 편집 제한 | 데스크톱 이어하기 |
## 8. 공통 비동기 상태 모델

```ts
type AsyncViewState<T> =
  | { status: "idle" }
  | { status: "loading"; startedAt: number; previous?: T }
  | { status: "success"; data: T; freshness: Freshness }
  | { status: "empty"; reason: EmptyReason }
  | { status: "offline"; cached?: T; retryAt?: number }
  | { status: "error"; error: UserFacingError; previous?: T };
```

### 로딩 단계

| 경과 | 표시 |
| --- | --- |
| 0–1초 | 레이아웃 안정성을 유지하는 즉시 skeleton |
| 1–5초 | 무엇을 불러오는지 텍스트로 설명 |
| 5–8초 | 연결·엔진·파일 준비 상태와 취소 가능 여부 |
| 8초 이상 | 재시도, 안전 모드, 다른 경로, 오류 상세 복사 |

스피너만 단독으로 표시하지 않는다. 이전 데이터가 있으면 화면을 지우지 않고 `stale` 상태로 유지한다.

## 9. EmptyState

```ts
interface EmptyStateProps {
  reason: "first-use" | "no-results" | "not-created" | "filtered" | "signed-out";
  title: string;
  description: string;
  primaryAction: ActionDescriptor;
  secondaryAction?: ActionDescriptor;
  sampleAction?: ActionDescriptor;
  illustration?: React.ReactNode;
}
```

빈 상태는 왜 비었는지, 어떻게 채우는지, 샘플로 볼 수 있는지를 설명한다. `없습니다`만 표시하지 않는다.
## 10. ErrorState

```ts
interface UserFacingError {
  code: string;
  title: string;
  summary: string;
  safeDataMessage?: string;
  retryable: boolean;
  diagnosticId?: string;
  details?: readonly ErrorDetail[];
}
```

오류 화면은 다음 순서를 따른다.

1. 사용자가 하려던 일
2. 현재 실패한 부분
3. 보존된 데이터
4. 지금 할 수 있는 행동
5. 필요 시 오류 ID와 상세 복사

`오류가 발생했습니다`와 전체 페이지 새로고침만 제공하는 패턴은 금지한다.

### 도메인별 복구

- 네트워크: 캐시 데이터 유지, 온라인 재시도, 마지막 갱신 시각
- WebGL·GPU: 안전 모드, 낮은 품질, 지원 정보
- lazy chunk: 한 번의 새로고침, 이전 배포 캐시 정리 안내
- 인증: 로그인 후 복귀, 초안 유지
- 프로젝트: 선택·복구·권한 요청
- 파일: 지원 형식, 손상 위치, 원본 보존

## 11. AccessGate

`AccessGate`는 화면 전체를 로그인 문구로 대체하기 전에 공개 가능한 가치와 예시를 렌더한다.

```ts
interface AccessGateProps {
  requirement: "sign-in" | "project" | "role";
  preserveDraftKey?: string;
  returnTo: string;
  children: React.ReactNode;
  fallback: React.ReactNode;
}
```
## 12. ProjectPickerState

프로젝트가 필요한 페이지에서 다음 순서로 제공한다.

1. 최근 프로젝트 3개
2. 제목·소유자 검색
3. 공유받은 프로젝트
4. 새 프로젝트 만들기
5. 샘플 프로젝트로 보기

선택 결과는 canonical work path로 전환한다. 예: `/studio/work/:workId/review`. 프로젝트를 query string과 local storage만으로 암묵적으로 추측하지 않는다.

## 13. SearchAndFilterBar

```ts
interface SearchAndFilterBarProps<TFilters> {
  query: string;
  filters: TFilters;
  resultCount?: number;
  sort: SortDescriptor;
  onQueryChange(value: string): void;
  onFiltersChange(value: TFilters): void;
  onReset(): void;
  mobilePresentation: "sheet" | "inline";
}
```

### 규칙

- 검색어·필터·정렬은 공유 가능한 URL에 직렬화한다.
- 적용 필터는 제거 가능한 요약 칩으로 표시한다.
- 모바일 기본 화면에 모든 필터 칩을 펼치지 않는다.
- 결과 수와 로딩 상태를 `role=status`로 안내한다.
- 필터 적용 후 결과 제목으로 포커스를 강제 이동하지 않고 변경을 알린다.
- 목록이 큰 `/tags`, `/ranking`, `/authors`는 가상화 또는 서버 페이지 처리를 사용한다.

## 14. ContentCard와 DataRow

같은 데이터를 카드와 표로 보여줄 때 행동·상태·접근 가능한 이름을 공유한다.

- 카드 전체 링크와 내부 버튼의 중첩 인터랙션을 피한다.
- 이미지가 없어도 타이포그래픽 표지와 메타데이터로 식별 가능해야 한다.
- 아이콘 전용 저장·공유·비교 버튼은 명시적 이름과 tooltip을 가진다.
- 모바일 카드의 주 행동은 44px 이상이며 작은 메타 링크는 별도 상세 화면으로 이동한다.
## 15. WorkflowStepper

```ts
interface WorkflowStep {
  id: string;
  label: string;
  status: "upcoming" | "current" | "complete" | "warning" | "error";
  errorCount?: number;
}
```

- 현재 단계와 전체 진행을 텍스트로 설명한다.
- 완료된 단계로 돌아갈 수 있으며, 이후 결과가 무효화되면 경고한다.
- 단계 이동 전에 초안을 자동 저장한다.
- 제출 시 전체 오류 요약과 첫 오류 이동을 제공한다.
- 처리 시간이 긴 실행은 route를 떠나도 `/studio/jobs`에서 추적한다.

## 16. StudioSaveIndicator

```ts
type SaveStatus =
  | "dirty"
  | "saving-local"
  | "saved-local"
  | "syncing"
  | "synced"
  | "offline"
  | "conflict"
  | "error";
```

- 색상만으로 상태를 전달하지 않는다.
- 마지막 로컬 저장 시각과 서버 동기화 시각을 구분한다.
- 자동 저장은 기본이며 사용자가 서버·로컬 권위를 매번 선택하게 하지 않는다.
- 충돌 시 어느 쪽이 최신인지 단정하지 않고 비교·복제·병합 경로를 제공한다.
- 페이지 이탈 전에 데이터가 안전하지 않으면 원인과 남은 행동을 설명한다.

## 17. StudioCapabilityGate

GPU, WebGL, WASM, SharedArrayBuffer, 로컬 엔진, 파일 API 요구 사항을 표면 진입 전에 검사한다.

결과는 `ready`, `degraded`, `blocked`, `checking`으로 반환한다. `degraded`에서는 품질·기능 제한과 안전 모드 시작 버튼을 제공한다.
## 18. 접근성 계약

### 의미 구조

- 사용자 페이지마다 H1 정확히 하나
- 제목 순서 건너뛰기는 필요한 경우에만 사용
- landmark는 header, nav, main, aside, footer로 명확히 구분
- 결과 수, 저장, 동기화, 처리 완료는 적절한 live region으로 안내

### 인터랙션

- 핵심 터치 영역 44×44 CSS px 이상
- 선택형 버튼에 `aria-pressed`, 탭에 `aria-selected`
- 드래그·리사이즈에는 키보드 대체 조작과 수치 입력 제공
- 아이콘 전용 버튼은 화면에 보이는 tooltip과 접근 가능한 이름 제공
- modal·sheet는 포커스 가두기, Escape, 호출 요소 복귀 보장

### 시각

- 상태를 색상만으로 구분하지 않는다.
- 200% 확대와 320 CSS px 폭에서 핵심 과업을 완료할 수 있어야 한다.
- 사용자 원고·작품 색상과 UI 테마를 분리한다.
- `prefers-reduced-motion`에서 자동 이동·패럴랙스·반복 애니메이션을 제거한다.

## 19. 분석 이벤트 계약

```ts
interface ProductEvent {
  name: string;
  routeId: string;
  shell: RouteShell;
  action: string;
  state?: string;
  source?: string;
  durationBucket?: string;
}
```

금지 데이터: 원고 내용, 프롬프트 원문, API 키, 비공개 파일명, 메시지 내용, 임의 query string, 세션 토큰. 프로젝트·사용자 식별자는 승인된 비식별 방식만 사용한다.
## 20. 성능 예산

| 표면 | 초기 JS 목표 | LCP 목표 | 추가 규칙 |
| --- | ---: | ---: | --- |
| DocsShell | gzip 170KB 이하 | 2.0초 이하 | 무거운 차트·Studio import 금지 |
| Browse collection | gzip 230KB 이하 | 2.5초 이하 | 아래 목록·이미지 지연 로드 |
| Browse dashboard | gzip 260KB 이하 | 2.5초 이하 | 차트는 viewport 진입 후 로드 |
| Creator launcher | gzip 260KB 이하 | 2.5초 이하 | 편집 엔진 eager import 금지 |
| Immersive editor | 기존 bundle gate 준수 | 첫 입력 준비 별도 계측 | surface별 lazy 경계 |

수치는 저사양 모바일 네트워크와 프로덕션 번들에서 검증한다. 기존 기준이 더 엄격하면 기존 기준을 유지한다.

## 21. 비주얼 적용 규칙

- `DESIGN.md`의 warm-ink 중립과 persimmon 행동 신호를 유지한다.
- Primary action 이외에 accent를 광범위한 장식으로 사용하지 않는다.
- 중첩 카드보다 표면, 선, 간격으로 계층을 만든다.
- 페이지 고유 비주얼은 실제 기능·결과를 설명해야 하며 장식용 동일 이미지를 반복하지 않는다.
- 상태 배지는 의미 토큰을 사용하고 raw 색상을 하드코딩하지 않는다.
- 밝은 캔버스가 필요한 도구는 CreatorShell의 크롬과 분리된 작업 표면으로 처리한다.

## 22. 컴포넌트 완료 기준

공통 컴포넌트는 Storybook 존재만으로 완료되지 않는다.

- 한국어·영어 긴 텍스트
- 기본·hover·focus·active·disabled·loading·error
- 320, 390, 768, 1180, 1440 폭
- keyboard, screen reader name, reduced motion
- light·dark·high contrast theme
- 데이터 없음·매우 많음·느린 응답
- nested route와 back/forward 복원

각 컴포넌트는 도입할 실제 페이지 수직 슬라이스와 함께 검증한다.