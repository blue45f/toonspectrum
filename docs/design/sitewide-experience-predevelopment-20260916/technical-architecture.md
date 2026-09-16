# 기술 아키텍처와 코드 변경 설계

## 0. 2026-09-17 main 보정

최신 main에는 partial route metadata·RouteStage와 Production Hub·first-save restore가 존재한다. 구현은 이 문서를 처음부터 새로 적용하지 않고 [`main-revalidation-20260917.md`](./main-revalidation-20260917.md)의 수렴 순서를 따른다. AppShell이 browser document의 유일한 `main` landmark를 소유하고, product shell과 domain page는 그 내부에 렌더한다.

## 1. 아키텍처 목표

사이트 경험 개편은 기존 Vite SPA, React Router 선언형 모드, 도메인별 lazy route, Studio 문서 런타임을 유지하면서 다음 권위를 분리한다.

- **어디로 이동하는가:** Route Registry
- **어떤 셸과 정책으로 표시하는가:** Route Experience Boundary
- **무엇을 수행하는가:** 각 도메인 페이지
- **문서·프로젝트 데이터의 권위는 무엇인가:** 기존 Studio runtime·API·storage adapter

새 라우터 프레임워크, 상태관리 라이브러리, CSS 프레임워크를 추가하지 않는다.

## 2. 의존 방향

```text
app/routes
  ├─ route group element composition
  ├─ RouteExperienceBoundary
  └─ global route/error/title/focus behavior
        ↓
domains/navigation
  ├─ route registry
  ├─ canonical and selectors
  └─ stable public contracts
        ↓
domains/* pages and creator runtime
        ↓
infrastructure adapters + shared presentational components
```

`domains/navigation`은 다른 도메인의 페이지 구현을 import하지 않는다. 경로와 사용자-facing 메타데이터만 소유한다.
## 3. 제안 파일 구조

```text
apps/web/src/
├─ app/routes/
│  ├─ RouteExperienceBoundary.tsx
│  ├─ RouteFrame.tsx
│  ├─ route-readiness.ts
│  ├─ route-feature-flags.ts
│  └─ groups/*.routes.tsx
├─ domains/navigation/
│  ├─ contracts/site-route-definition.ts
│  ├─ site-route-registry.ts
│  ├─ site-route-canonical.ts
│  ├─ site-route-selectors.ts
│  └─ __tests__/
├─ shared/components/site-shells/
│  ├─ BrowseShell.tsx
│  ├─ DocsShell.tsx
│  ├─ PageHeader.tsx
│  ├─ ContextBar.tsx
│  └─ RouteBadge.tsx
├─ shared/components/view-state/
│  ├─ LoadingState.tsx
│  ├─ EmptyState.tsx
│  ├─ ErrorState.tsx
│  └─ AccessGate.tsx
└─ domains/creator/
   ├─ shell/CreatorShell.tsx
   ├─ project-context/ProjectPickerState.tsx
   └─ capability/StudioCapabilityGate.tsx
```

기존 `site-navigation.ts`, `route-titles.ts`, `route-manifest.ts`는 즉시 삭제하지 않고 Registry reader로 단계적으로 전환한다.
## 4. Registry와 실제 route element의 분리

Registry는 lazy component를 직접 보유하지 않는다. 현재 route group이 번들 경계와 element를 계속 소유한다.

```ts
// domains/navigation/contracts/site-route-definition.ts
export interface SiteRouteDefinition {
  id: string;
  path: string;
  canonicalPath: string;
  aliases?: readonly string[];
  shell: "browse" | "creator" | "docs";
  template: PageTemplate;
  product: "studio" | "spectrum" | "docs";
  purpose: RoutePurpose;
  access: RouteAccess;
  projectContext: "none" | "optional" | "required";
  maturity: RouteMaturity;
  device: DeviceMode;
  mobileMode: MobileMode;
  titleKey: string;
  labelKey: string;
  descriptionKey: string;
  keywords: readonly string[];
  primaryAction: RouteActionDefinition;
  owner: RouteOwner;
}
```

```ts
// app/routes/groups/market.routes.tsx
export const marketRoutes: AppRouteDefinition[] = [
  { id: "market-browse", path: "/market/browse", element: <MarketBrowsePage /> },
];
```

CI는 `AppRouteDefinition.id/path`와 Registry를 대조하되, 동적 상세 route는 별도 allowlist와 패턴 계약으로 검증한다.
### Domain catalog composition

현재 main의 `STUDIO_ROUTE_REGISTRY`, `STUDIO_ROUTE_MANIFEST`, `productionRoutes`는 삭제하거나 세 번째 path grammar로 복사하지 않는다. 각 domain은 경로·runtime identity의 권위를 유지하고 전역 Registry가 필요한 projection만 adapter로 제공한다.

```ts
interface DomainRouteCatalogAdapter {
  readonly domain: string;
  routes(): readonly SiteRouteDefinition[];
  integrity(): readonly RouteIntegrityIssue[];
}
```

- Studio product registry: product IA, aliases, project/document resource
- Studio runtime manifest: resolver kind, lifecycle, title ownership
- Production catalog: project·episode route family와 shell/access/readiness
- Public route groups: static Browse·Docs destination metadata

두 Studio catalog가 같은 route를 설명할 때 전역 projection은 id를 새로 만들지 않고 source id와 runtime manifest id를 함께 참조한다.

## 5. Registry selector API

```ts
export function resolveSiteRoute(pathname: string): SiteRouteDefinition | null;
export function canonicalSitePath(location: Pick<Location, "pathname" | "search" | "hash">): string;
export function routesForDirectory(filters: DirectoryFilters): readonly SiteRouteDefinition[];
export function primaryNavigationFor(route: SiteRouteDefinition): readonly NavigationItem[];
export function mobileNavigationFor(route: SiteRouteDefinition): readonly NavigationItem[];
export function relatedActionsFor(routeId: string): readonly RouteActionDefinition[];
```

### 경로 매칭

- 정적 경로는 exact match 우선
- 동적 경로는 route group의 pattern contract 사용
- alias는 canonical resolution 전에만 매칭
- trailing slash를 제거하되 root는 유지
- 민감하거나 임의인 query 전체를 recent route key에 포함하지 않음
- 검색·필터처럼 제품 상태인 query만 도메인 serializer가 명시적으로 보존

### 캐시

Registry와 selector는 정적 모듈이다. 런타임 네트워크 요청이나 Zustand store를 사용하지 않는다. 경로 판정은 순수 함수로 테스트한다.

## 6. RouteExperienceBoundary

```ts
interface ResolvedRouteExperience {
  route: SiteRouteDefinition;
  shell: RouteShell;
  access: ResolvedAccessState;
  mobile: ResolvedMobilePolicy;
  featureFlags: RouteFeatureFlags;
}
```

`RouteExperienceBoundary`는 location과 가벼운 session 상태만 읽는다. GPU·외부 엔진 검사는 Creator 표면 안에서 lazy하게 수행해 공개 페이지 시작 비용에 포함하지 않는다.
### 렌더 순서

```tsx
<RouteFrame route={experience.route}>
  <RouteAccessBoundary state={experience.access}>
    <RouteShellHost experience={experience}>
      <OutletOrCurrentRouteElement />
    </RouteShellHost>
  </RouteAccessBoundary>
</RouteFrame>
```

현재 앱이 `<Routes>`에서 element를 직접 조합하므로 초기 도입은 `AppRouter`의 route stage 바깥에서 children을 감싸는 형태로 한다. React Router 모드 전환은 범위에 포함하지 않는다.

## 7. Route readiness 계약

DOM에 콘텐츠가 조금 있다는 이유만으로 준비 완료로 판정하지 않는다. 페이지가 상태를 명시한다.

```ts
export type RouteReadiness =
  | { state: "pending"; label?: string }
  | { state: "ready" }
  | { state: "empty"; reason: string }
  | { state: "blocked"; reason: string }
  | { state: "error"; errorId?: string };

export function useRouteReadiness(value: RouteReadiness): void;
```

`RouteFrame`은 context 값을 우선 사용하고, 이관되지 않은 페이지에 한해서만 의미 있는 DOM을 검사한다. 브라우저 감사가 읽을 수 있도록 page root에 `data-route-state`도 투영한다.

### 지연 복구

- Browse·Docs: pending 8초 후 복구 패널
- Creator: pending 12초 후 capability·surface 진단 패널
- `empty`, `blocked`, `error`는 정식 완료 상태이므로 stalled로 오판하지 않음
- 사용자가 계속 기다리기를 누르면 같은 타이머를 무한 반복하지 않고 진행 로그를 제공
## 8. Shell host 구현

```ts
function RouteShellHost({ experience, children }: Props) {
  switch (experience.shell) {
    case "docs":
      return <DocsShell route={experience.route}>{children}</DocsShell>;
    case "creator":
      return <CreatorShell route={experience.route}>{children}</CreatorShell>;
    default:
      return <BrowseShell route={experience.route}>{children}</BrowseShell>;
  }
}
```

### BrowseShell 조합

- 기존 `site-header.tsx`, `site-footer.tsx`, 모바일 nav를 재사용하되 Registry selector에서 navigation model을 주입한다.
- `SiteCreationCompass`, `PublicSiteNextSteps`, `PublicSiteWayfinder`는 자동 삽입을 중단하고 페이지가 필요한 contextual action을 선언한다.
- 현재 `AppShell`은 provider와 전역 overlay 조합 root로 남고, 제품 셸은 main 안에서 route 단위로 렌더한다.

### DocsShell 조합

- Site header는 compact variant를 사용한다.
- TOC는 페이지가 제공하는 heading model 또는 정적 document model을 받는다.
- 정책 문서의 updated/effective/version 메타데이터는 페이지 상수가 아니라 문서 contract로 관리한다.

### CreatorShell 조합

- `StudioDocumentLayout`과 기존 Studio Router를 대체하지 않는다.
- 공통 Creator chrome은 `StudioDocumentLayout` 위 또는 companion route layout에 adapter로 삽입한다.
- editor surface는 기존 lazy import와 `StudioSurfaceErrorBoundary`를 유지한다.
- project-less independent tool은 optional project context로 실행한다.
## 9. 인증·프로젝트 경계

```ts
export type ResolvedAccessState =
  | { kind: "granted" }
  | { kind: "sign-in-required"; returnTo: string; draftKey?: string }
  | { kind: "project-required"; returnTo: string }
  | { kind: "role-required"; required: readonly ProjectRole[] }
  | { kind: "denied"; reason: AccessDenialReason };
```

### 원칙

- Registry의 access 값은 사전 UX 정책이며 API 권한 검사를 대신하지 않는다.
- 인증 callback은 승인된 return URL만 사용한다.
- 공개 미리보기 가능한 페이지는 전체 route를 막지 않고 쓰기 행동만 gate한다.
- 입력 초안은 허용된 schema와 키로만 로컬 저장한다.
- 프로젝트 ID를 전역 localStorage의 마지막 값만으로 암묵 선택하지 않는다.
- 프로젝트 선택 결과는 기존 canonical Studio work path로 이동한다.

### ProjectContext adapter

```ts
interface ProjectContextAdapter {
  recent(): Promise<readonly ProjectSummary[]>;
  search(query: string): Promise<readonly ProjectSummary[]>;
  resolve(workId: string): Promise<ProjectAccessResult>;
  create(intent: ProjectCreationIntent): Promise<ProjectSummary>;
}
```

구체 API endpoint를 이 설계에서 새로 확정하지 않는다. 기존 project source와 auth contract를 adapter 뒤에 연결하고, 부족한 API만 별도 backend ADR과 계약 테스트로 추가한다.
## 10. Studio 문서 런타임 통합

기존 ADR-0016의 두 identity를 그대로 사용한다.

- document identity: account, work/remix, draft epoch
- presentation identity: canvas, comic, animation, DCC, publish

CreatorShell은 document identity key를 새로 계산하지 않는다. `StudioDocumentRuntimeBoundary`가 제공하는 context를 읽어 표시만 한다.

```ts
interface CreatorShellDocumentState {
  documentKey: string;
  project?: ProjectSummary;
  document: DocumentSummary;
  saveStatus: SaveStatus;
  collaboration: CollaborationSummary;
  activeSurface: StudioSurface;
}
```

### 금지

- 셸 내부에서 별도 autosave timer 생성
- 셸 route 이동 때 editor store 초기화
- companion page가 다른 문서 key parser를 구현
- DCC 오류를 전역 route error로 승격
- 외부 창이 새로운 저장 권위를 생성

### 팝아웃·별도 창

외부 창은 동일 문서 런타임의 projected client다. BroadcastChannel 또는 기존 협업 transport로 command·selection·view state를 전달하되 문서 mutation authority는 기존 owner를 유지한다.

창 종료·연결 유실·중복 창을 고려해 lease와 generation token을 사용한다. 팝아웃이 닫혀도 원고·undo·자동 저장은 main owner에 남는다.
## 11. 비동기 데이터 모델

도메인 query 라이브러리를 강제하지 않는다. 화면 경계에는 공통 projection을 사용한다.

```ts
interface ViewResource<T> {
  state: "idle" | "loading" | "success" | "empty" | "offline" | "error";
  data?: T;
  previous?: T;
  freshness?: {
    loadedAt: number;
    sourceUpdatedAt?: number;
    stale: boolean;
  };
  error?: UserFacingError;
}
```

### 데이터 보존

- 재검증 중 이전 성공 데이터를 제거하지 않는다.
- 필터 변경 중 목록 전체를 skeleton으로 바꾸지 않고 pending 상태를 겹쳐 표시한다.
- 사용자가 만든 초안과 서버 조회 캐시는 같은 저장소·보존 정책을 사용하지 않는다.
- service worker는 사용자 문서의 권위 저장소가 아니다.
- 데이터 제공자 오류는 결과 없음으로 변환하지 않는다.

### 오류 정규화

```ts
interface UserFacingError {
  code: string;
  category: "network" | "auth" | "permission" | "storage" | "capability" | "validation" | "provider" | "unknown";
  retryable: boolean;
  safeDataMessage?: string;
  diagnosticId?: string;
  recovery: readonly RecoveryAction[];
}
```

원본 exception 메시지를 사용자 화면에 직접 출력하지 않는다. 개발 로그와 사용자-safe 오류를 분리한다.
## 12. 3D·AI capability와 작업 계약

```ts
interface CapabilityReport {
  state: "checking" | "ready" | "degraded" | "blocked";
  capabilities: readonly CapabilityResult[];
  recommendedProfile?: ExecutionProfile;
  recovery: readonly RecoveryAction[];
}

interface ProductionJobReceipt {
  jobId: string;
  type: ProductionJobType;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress?: number;
  createdAt: number;
  inputReference: SafeInputReference;
  execution: ExecutionReceipt;
  output?: ProductionOutputReference;
  error?: UserFacingError;
}
```

### Capability adapter

- 브라우저: WebGL2, WebGPU, WASM, SharedArrayBuffer, storage quota
- 로컬 실행기: endpoint, 인증, 버전, 지원 작업
- 외부 공급자: 연결 상태, 모델 능력, rate/quota의 사용자-safe 요약
- 파일: MIME, 크기, 포맷, 손상 여부

### 실행 profile

- `recommended`: 품질과 성능의 기본값
- `safe`: 낮은 해상도·메시·텍스처와 제한된 기능
- `preview`: 결과 확인만 가능한 읽기 중심
- `unavailable`: 실행하지 않고 요구 조건과 대체 경로 제공

기능마다 capability 검사를 다시 구현하지 않고 adapter와 profile registry를 공유한다.
## 13. Feature flag 설계

```ts
interface RouteFeatureFlags {
  routeRegistryV2: boolean;
  routeFrameV2: boolean;
  browseShellV2: boolean;
  docsShellV2: boolean;
  creatorShellV2: boolean;
  collectionFiltersV2: boolean;
  marketExperienceV2: boolean;
  studioProjectContextV2: boolean;
  studioCapabilityGateV2: boolean;
}
```

### 규칙

- 플래그는 표현과 orchestration 경계를 전환한다. 문서 데이터 포맷·저장 권위를 두 갈래로 나누지 않는다.
- route id, 승인된 cohort, 환경으로만 분기한다.
- query string으로 운영 플래그를 임의 활성화하지 않는다.
- 플래그 off에서도 신규 canonical URL을 이해할 수 있어야 한다.
- 제거 시점과 rollback owner를 플래그 선언 옆에 기록한다.
- 실험 분석은 원고·프롬프트·키·민감 식별자를 수집하지 않는다.

### 코드 배치

- 정적 기본값: `app/routes/route-feature-flags.ts`
- 원격 설정을 사용할 경우 infrastructure adapter 뒤에서 허용된 boolean만 projection
- 테스트: 모든 조합이 아니라 route별 지원 조합과 fallback을 pairwise로 검증

## 14. URL 상태 계약

검색·필터 상태는 각 도메인의 codec으로 관리한다.

```ts
interface UrlStateCodec<T> {
  parse(search: URLSearchParams): T;
  serialize(value: T): URLSearchParams;
  normalize(value: T): T;
}
```

알 수 없는 값은 안전한 기본값으로 정규화하고, 민감 정보와 자유 입력 원문은 analytics·recent route key에 복제하지 않는다.
## 15. 레이아웃·CSS 구조

기존 디자인 토큰과 Tailwind 유틸리티를 유지한다. 셸별 전역 CSS를 최소화하고 route별 스타일이 다른 셸을 침범하지 않도록 data attribute를 사용한다.

```html
<body>
  <main id="main-content">
    <div data-route-shell="browse|creator|docs"
         data-route-id="market-browse"
         data-route-state="ready">
```

### 브레이크포인트

기존 경험 문서의 실측 보정 지점을 따른다.

- 430px: 소형 모바일
- 720px: 큰 모바일·소형 태블릿
- 900px: 태블릿·컴팩트 데스크톱
- 1180px: 중형 데스크톱
- 1280px 전후: 일반 콘텐츠 최대 폭

JS에서 viewport 폭을 읽어 구조를 결정하기보다 CSS와 capability policy를 사용한다. 모바일 편집 모드처럼 기능 계약이 달라지는 경우에만 matchMedia 기반 adapter를 사용한다.

### z-index 계층

```text
content < sticky context < floating panel < sheet < modal < critical recovery
```

임의 숫자를 추가하지 않고 기존 token 또는 명명된 layer 상수로 통합한다. 팝아웃·포털이 Creator 캔버스 입력을 가로채지 않는지 hit-test를 검증한다.

### safe area와 가상 키보드

- 모바일 fixed bar에 `env(safe-area-inset-*)`
- 폼 sheet는 VisualViewport 변화에 대응
- 하단 CTA가 키보드 뒤에 숨지 않음
- Creator review 모드는 캔버스 높이를 동적으로 재계산하되 문서 좌표를 변경하지 않음
## 16. 분석·관찰 계약

```ts
interface RouteExperienceEvent {
  event: "route_view" | "primary_action" | "state_shown" | "recovery_action" | "route_ready";
  routeId: string;
  shell: "browse" | "creator" | "docs";
  state?: "loading" | "ready" | "empty" | "blocked" | "error";
  actionId?: string;
  sourceRouteId?: string;
  durationBucket?: "lt1s" | "1to5s" | "5to8s" | "gt8s";
}
```

### 수집 금지

- 작품·원고·메시지·리뷰의 내용
- 검색·프롬프트 자유 입력 원문
- API 키·토큰·로컬 엔진 비밀값
- 파일명·로컬 경로
- 전체 query string
- 개인 프로젝트 제목

### 관찰 포인트

- route pending→ready 시간
- stalled recovery 노출과 행동
- empty state에서 시작 행동
- 로그인·프로젝트 gate 복귀 성공
- 오류 category별 재시도 성공
- 모바일 review→데스크톱 이어하기
- 로컬 저장·서버 동기화 상태 전환

분석 실패가 사용자 route 렌더링이나 저장에 영향을 주지 않도록 fire-and-forget adapter로 격리한다.

## 17. 백엔드 영향 분석

Route Registry, 셸, 정적 문서 구조는 프론트엔드 변경만으로 시작할 수 있다. 다음 기능은 기존 API 검토 후 부족한 계약을 별도 작업으로 추가한다.

- 최근 프로젝트·공유 프로젝트 검색
- 리뷰·공유·버전의 역할·상태 projection
- 지원 티켓과 비공개 권리 요청
- 에셋 설치·업데이트·호환성 영수증
- 장기 실행 작업의 job receipt와 재조회
- 정책·데이터 출처의 갱신 이력
### API 계약 원칙

- cursor 기반 목록은 안정 정렬 키와 private cursor를 사용한다.
- 쓰기 요청은 중복 제출을 막는 idempotency key 또는 서버 상태 검사를 가진다.
- 권한은 route access metadata가 아니라 서버가 검증한다.
- API 오류는 안정된 code와 correlation id를 반환하고 내부 stack을 노출하지 않는다.
- 생성·게시·설치 같은 장기 작업은 즉시 성공을 가장하지 않고 receipt를 반환한다.
- 사용권·출처·호환성 메타데이터는 복제·설치 이후에도 보존한다.
- API가 준비되지 않은 화면은 mock 성공 데이터를 운영 기능처럼 표시하지 않는다.

### 별도 ADR가 필요한 변경

- 프로젝트 canonical URL grammar 변경
- 지원 티켓의 개인정보 저장·보유 정책
- 외부 AI 공급자 키 보관과 서버 proxy
- production job의 서버 영속성·재시도 의미
- 마켓 설치 identity·업데이트 authority

## 18. 저장소와 migration

### Route history

기존 raw path 기록은 읽을 때 canonical route id로 변환한다. 알 수 없는 path는 삭제하지 않고 제한된 legacy entry로 표시한 뒤 사용자가 제거할 수 있게 한다.

### 사용자 설정

셸·내비게이션 개편은 기존 테마, 언어, 접근성 설정을 유지한다. 새로운 레이아웃 설정은 versioned schema로 저장한다.

```ts
interface WorkspaceLayoutEnvelopeV1 {
  version: 1;
  routeFamily: string;
  panels: readonly PanelPlacement[];
  updatedAt: number;
}
```

잘못된 레이아웃은 기본값으로 복구하되 원본 envelope를 진단·내보내기용으로 보존한다.
## 19. 현재 파일에서의 단계적 이동

| 현재 파일·영역 | 1차 변경 | 최종 상태 |
| --- | --- | --- |
| `app/routes/route-titles.ts` | Registry title selector를 호출 | compatibility export 제거 |
| `app/routes/route-manifest.ts` | Registry의 제한된 app route view 생성 | 고수준 수동 목록 제거 |
| `shared/components/site-navigation.ts` | Registry selector가 만든 model을 소비 | product navigation domain으로 데이터 이동 |
| `shared/components/site-public-routes.ts` | Registry의 shell/template 판정 사용 | 접두사 allowlist 제거 |
| `domains/legal/SitemapPage.tsx` | Registry 검색·필터 consumer | 수동 destination 배열 제거 |
| `app/routes/route-stage.tsx` | RouteFrame fallback adapter | 명시적 readiness context 중심 |
| `app/AppShell.tsx` | provider·overlay composition 유지 | route별 shell 자동 삽입 제거 |
| `public-site-next-steps.tsx` | 페이지 선언형 related action만 표시 | 전역 자동 반복 제거 |
| `studio-router/*` | CreatorShell adapter와 context projection | route/runtime 권위 유지 |

### 삭제 전 검증

수동 배열이나 compatibility export는 다음 소비자가 모두 Registry로 전환된 뒤 삭제한다.

- header·drawer·mobile tabs
- sitemap·command palette
- footer·next-step links
- document title·analytics
- public route policy
- tests·crawlers·static sitemap generator

정적 `sitemap.xml` 생성기는 사용자 UI `/sitemap`과 별개지만 같은 canonical path source를 사용해야 한다.

## 20. 테스트 hook

제품 코드에 QA 전용 복잡한 API를 만들지 않는다. 다음 안정된 속성만 제공한다.

- `data-route-id`
- `data-route-shell`
- `data-route-state`
- `data-view-state`
- `data-save-state`
- `data-capability-state`

동작 선택은 role·label을 우선하고, test id는 캔버스·WebGL처럼 의미 role로 찾기 어려운 경계에 제한한다.
## 21. 번들·성능 경계

- Registry는 icon component나 page component를 import하지 않는다. icon은 consumer가 semantic id로 매핑한다.
- DocsShell과 BrowseShell은 Studio runtime, Three.js, rendering engine, Remotion을 eager import하지 않는다.
- CreatorShell도 active surface에 필요한 chunk만 로드한다.
- 긴 목록은 viewport 기반 이미지 lazy load와 row virtualization을 사용한다.
- route transition 중 이전 화면을 과도하게 유지해 메모리가 중복되지 않게 한다.
- editor surface 해제 시 worker, observer, texture, object URL의 owner가 명확해야 한다.

성능 gate는 기존 Studio bundle gate와 충돌하지 않으며, 공개 route에 별도의 shell budget을 추가한다.

## 22. 초기 구현 PR의 정확한 파일 범위

### PR 1 — Registry foundation

```text
+ domains/navigation/contracts/site-route-definition.ts
+ domains/navigation/site-route-registry.ts
+ domains/navigation/site-route-canonical.ts
+ domains/navigation/site-route-selectors.ts
+ domains/navigation/__tests__/*
~ app/routes/app-route-definition.ts
~ app/routes/groups/app-routes.test.tsx
```

기능 UI는 바꾸지 않는다.

### PR 2 — Sitemap consumer

```text
~ domains/legal/SitemapPage.tsx
~ domains/legal/SiteDirectorySearch.tsx
+ domains/legal/SiteDirectoryFilters.tsx
~ domains/legal/site-directory-search.ts
~ related tests and CSS
```

### PR 3 — RouteFrame

```text
+ app/routes/RouteFrame.tsx
+ app/routes/route-readiness.ts
~ app/routes/route-stage.tsx
~ app/routes/AppRouter.tsx
+ focused unit and browser tests
```

이 순서를 지키면 기존 in-progress 사이트 UX 작업과 충돌을 줄이고 독립적으로 검토할 수 있다.
## 23. 주요 위험과 완화

| 위험 | 영향 | 완화 |
| --- | --- | --- |
| Registry가 또 다른 중복 목록이 됨 | 경로·제목 드리프트 | CI 대조 후 기존 소비자를 단계적으로 제거 |
| 공통 상태가 도메인 오류를 평탄화 | 해결 불가능한 일반 오류 | 오류 code와 recovery command는 도메인이 소유 |
| 셸 교체가 Studio 런타임을 재마운트 | 저장·undo·협업 손실 | document identity boundary 밖에서 chrome만 교체 |
| 모바일 기능을 숨겨 혼란 | 기능 발견성 저하 | review/preview 이유와 데스크톱 이어하기 제공 |
| 가상화로 접근성 회귀 | 키보드·스크린리더 탐색 실패 | logical count, focus retention, non-virtual fallback 검토 |
| feature flag가 데이터 권위를 분기 | 충돌·복구 난이도 증가 | 표현만 분기하고 저장 schema·authority는 하나 유지 |
| 공통 후속 섹션 제거로 전환 감소 | 다음 행동이 사라짐 | route별 related action을 Registry·페이지에서 명시 |
| 외부 공급자 오류가 제품 오류로 보임 | 신뢰 저하 | 공급자·캐시·마지막 갱신·대체 경로를 구분 |

## 24. 아키텍처 승인 기준

- frontend layered architecture의 의존 방향을 위반하지 않는다.
- Studio route parser, document key, persistence authority를 중복 구현하지 않는다.
- Registry는 정적·순수하고 무거운 page dependency를 가져오지 않는다.
- 각 셸은 레이아웃을 소유하지만 도메인 데이터를 소유하지 않는다.
- 공통 상태는 사용자 과업과 복구 행동을 표현할 수 있다.
- P0 라우트가 새 구조로 실제 복구되는 수직 슬라이스가 존재한다.
- 테스트와 feature flag 없이 전체 페이지를 일괄 전환하지 않는다.

이 기준을 만족하면 구현은 `implementation-backlog.csv`의 E00→E01→E02 순서로 착수한다.