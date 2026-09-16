# ToonStudio 전면 사이트 경험 — main 브랜치 재검토

상태: **Main-revalidated implementation plan**  
재검토일: 2026-09-17  
기준 브랜치: `origin/main`  
기준 커밋: `ecae7445966a`  
선행 설계 기준: `e23362011`, 2026-09-16 설계 패키지

## 1. 결론

기존 방향은 유지한다. 다만 현재 `main`에는 설계의 일부가 이미 구현됐고, 새 제작 관리 영역과 저장 흐름이 추가됐으므로 우선순위와 권위 경계를 다시 잡아야 한다.

가장 중요한 변화는 다음과 같다.

1. 사이트맵 검색·필터, canonical alias, 최근 방문·즐겨찾기, route fallback, support 분리, 태그·랭킹 개선이 이미 반영됐다.
2. `/market/browse`의 완전한 빈 화면과 모바일 `/reviews` 오류는 로컬 `main`에서 재현되지 않았다.
3. `/studio/bg3d`와 DCC 표면은 즉시 빈 화면이라기보다 격리 재진입과 대형 편집기 워밍업에 시간이 걸리는 상태다.
4. `/production` 제작 관리와 정적·동적 경로를 포함한 14개 Production route pattern이 새로 추가됐다.
5. `/studio/new`, `/studio/assets`, `/production`은 현재 Studio 1차 내비게이션이지만 사이트맵·route metadata·기존 인벤토리에는 완전히 반영되지 않았다.
6. 현재 가장 시급한 문제는 신규 기능 추가보다 **route 권위 정합성, landmark 소유권, readiness 검증 계약**이다.

따라서 다음 구현 시작점은 기존의 “사이트 전면 기반을 새로 만든다”가 아니라, 이미 구현된 기반을 단일 Route Registry와 셸 계약으로 수렴시키는 작업이다.
## 2. 재검토 범위와 증거

### 2.1 소스 기준

- `origin/main`: `ecae7445966a`
- PR #1515 설계 문서 병합 이후 현재 main까지의 first-parent merge 이력 검토
- route group, route title, 전역 내비게이션, 사이트맵, route metadata, Studio router, Production Hub 소스 검토
- 기존 ADR-0016과 ADR-0023 경계 재검토

### 2.2 실행 기준

- 데스크톱: `1440×1000`
- 모바일: `390×844`
- 로컬 Vite 개발 서버
- 112개 정적 목적지 진입 검사
  - 현재 사이트맵 canonical 목적지 108개
  - 사이트맵 자기 자신 `/sitemap`
  - 현재 1차 Studio 목적지이나 디렉터리에서 빠진 `/production`, `/studio/new`, `/studio/assets`
- 추가로 `/production` route group의 정적·동적 pattern 14개 검토
- 일반 route는 초기 650ms, 대형 Studio route는 별도 3초·8초 워밍업 확인

### 2.3 검증 결과

- 112개 경로 모두 HTTP 200
- navigation load error 0
- page error 0
- 확인한 viewport에서 수평 overflow 0
- focused Vitest: 9 files, 78 tests passed
- 현재 사이트맵·route metadata·history·support·fallback 관련 단위 계약 통과

로컬 API 서버가 연결되지 않은 상태여서 다수 경로에서 `502 Bad Gateway`가 발생했다. 이는 이번 실행 환경의 공통 API 부재이며, route 자체의 콘솔 오류 수로 품질을 평가하지 않았다. 대신 오류 UI가 남는지, 사용자가 재시도·대체 경로를 찾을 수 있는지를 확인했다.
## 3. 원 설계 이후 main에 반영된 변화

| 영역 | 현재 main 변화 | 설계에 미치는 영향 |
| --- | --- | --- |
| 사이트 전면 UX | PR #1528이 route metadata, directory filter, canonical history, fallback, policy·접근성·태그·랭킹 개선을 반영 | E00·E01·E02·E03·E11·E12의 일부는 신규 구현이 아니라 통합·보강 단계로 변경 |
| CI 후속 | PR #1533이 route architecture ceiling과 홈 계약을 복구 | 기존 구현을 제거하지 않고 현재 경계를 기준으로 후속 설계해야 함 |
| 프로젝트 저장 | PR #1535가 첫 명시 저장 위치, `.toonstudio` workspace snapshot, import·rollback 복구를 추가 | 프로젝트 허브와 버전·복구 설계는 새 저장 권위를 만들지 말고 기존 first-save 계약을 사용해야 함 |
| 제작 운영 | PR #1536이 `/production`과 역할 기반 workcell, 일정·검수·권리 흐름을 추가 | 기존 `/studio/projects`, `/studio/ecosystem`과 역할을 재구분해야 함 |
| 다국어 | PR #1527이 선택 가능한 로케일을 299개로 확대 | Route Registry는 `ko/en` 문자열 객체보다 번역 키와 폴백 정책을 저장해야 함 |
| Studio 배치 | workspace panels, reference pop-out, template/asset palette, arrangement close가 병합 | CreatorShell은 새 도킹 시스템을 대체하지 않고 크롬·문맥 projection만 소유해야 함 |
| 마켓 | install lifecycle과 acquisition integrity가 병합 | 마켓 설계는 설치 영수증·account/device 상태를 기존 모델과 통합해야 함 |
| AI | cloud routing profile이 병합 | 통합 AI 설정은 새 공급자 모델을 만들지 말고 기존 routing authority를 사용해야 함 |

## 4. 구현 상태 재판정

### 4.1 사실상 구현된 항목

- canonical alias 중앙화
- 사이트맵의 상태·접근·디바이스 필터
- canonical 최근 방문·즐겨찾기
- support와 public feedback의 역할 분리
- 정책 문서의 요약·목차·anchor·시행일·version·print 구조

### 4.2 부분 구현된 항목

- RouteFrame에 해당하는 `RouteStage`와 `RouteFallback`
- typed route metadata
- route health Playwright 검사
- 태그의 점진적 렌더링
- 랭킹 조작 의미와 밀도 개선
- 마켓 오류 상태와 설치 흐름
- 프로젝트 첫 저장·복구·썸네일
- Studio workspace panel·pop-out
- AI provider routing

### 4.3 아직 구조적으로 남은 항목

- 완전한 Route Registry
- BrowseShell·CreatorShell·DocsShell 분리
- 정확히 하나의 main landmark 계약
- route-owned readiness 상태
- Production과 Studio 프로젝트 IA 통합
- 모바일 Creator surface 정책
- AI·3D capability gate와 safe mode
- generic public journey 자동 삽입 제거
## 5. Route 권위와 인벤토리 드리프트

### 5.1 현재 숫자

| 집합 | 수량 | 의미 |
| --- | ---: | --- |
| 현재 사이트맵 canonical 결과 | 108 | 자기 자신을 제외한 directory 목적지 |
| 이번 재검토 정적 경로 | 112 | directory 108 + `/sitemap` + 빠진 1차 목적지 3개 |
| 기존 2026-09-16 인벤토리 | 108 | 당시 운영 사이트맵 스냅샷 |
| Production route pattern | 14 | 프로젝트 ID·회차 ID를 포함한 정적·동적 패턴 |

기존 인벤토리는 역사적 감사 결과로 유지하고, 현재 구현 판단에는 `main-route-revalidation-20260917.csv`를 사용한다.

### 5.2 현재 사이트맵에 빠진 1차 목적지

| 경로 | 현재 역할 | 문제 |
| --- | --- | --- |
| `/production` | Studio desktop primary navigation의 제작 관리 | 사이트맵, `site-route-metadata`, route title, 기존 inventory에 없음 |
| `/studio/new` | Studio mobile 중앙 탭과 새 작품 진입 | 사이트맵과 기존 inventory에 없음 |
| `/studio/assets` | Studio primary navigation의 작품 재료 | 사이트맵 테스트가 의도적으로 제외하며 inventory에도 없음 |

이 세 경로는 숨은 내부 도구가 아니라 전역 내비게이션이 직접 노출하는 목적지다. Directory와 Registry에서 제외할 근거가 없다.

### 5.3 현재 metadata의 분류 오류

`site-route-metadata.ts`는 경로 prefix 배열로 product와 purpose를 계산한다. `/production`이 Studio route 목록에 없으므로 기본값인 다음 분류로 떨어진다.

- product: `spectrum`
- purpose: `discover`
- access: `public`
- project context: `none`

반면 `site-navigation.ts`는 `/production`을 Studio 문맥으로 분류하고 제작 관리 첫 메뉴로 노출한다. 동일 경로가 서로 다른 제품 의미를 가지므로 단일 레지스트리 전환 전이라도 즉시 정합성을 맞춰야 한다.

### 5.4 route title 드리프트

`route-titles.ts`에 `/production`이 없어 브라우저 제목이 단순히 `툰스튜디오`로 표시된다. 화면 H1은 구체적이지만 탭·히스토리·스크린리더 문맥은 구분되지 않는다.

권장 제목은 다음과 같다.

- `/production`: `제작 관리 · 툰스튜디오`
- `/production/projects`: `제작 프로젝트 · 툰스튜디오`
- 프로젝트 상세: 실제 프로젝트명 + 현재 surface
- 회차 작업실: 회차명 + 프로젝트명
## 6. 셸과 landmark 재검토

### 6.1 중복 main

`AppShell`이 항상 `#main-content` `<main>`을 렌더링하는데 여러 domain page도 자체 `<main>`을 반환한다. 이번 local audit에서 다음 수치를 확인했다.

- desktop에서 `main` 2개: 19개 route
- mobile에서 `main` 2개: 22개 route

대표 경로:

- `/`
- `/production`
- `/studio/new`
- `/studio/projects`
- `/studio/review`
- `/studio/share`
- `/studio/versions`
- `/studio/ai-runtime`
- `/community/cafes`
- `/community/promote`
- `/learn/glossary`
- `/search`

기존 QA 문서는 “main 정확히 하나”를 요구하지만 현재 Playwright health test는 이를 검사하지 않는다.

### 6.2 결정

기본 정책은 **AppShell이 유일한 main landmark를 소유**하는 것으로 고정한다.

- 일반·문서·프로젝트 page root는 `div`, `section`, `article` 중 의미에 맞는 요소를 사용한다.
- 몰입형 Studio도 AppShell main을 유지하고 내부 편집 작업영역은 `section`, `region`, `application` 역할을 명시한다.
- 별도 browser document나 popup window만 독립 main을 가진다.
- skip link는 항상 같은 main owner로 이동한다.

`landmarkOwner`를 route마다 자유롭게 바꾸는 모델은 피한다. 예외가 많아지면 다시 중복 landmark가 발생하기 때문이다.

### 6.3 generic journey 자동 삽입

현재 AppShell은 broad route policy에 따라 다음 요소를 자동 삽입한다.

- `SiteCreationCompass`
- `PublicSiteNextSteps`
- `SiteNextSteps`

이로 인해 Production, 지원, 설정, 일부 Creator companion 화면에도 페이지 과업과 무관한 창작 journey·Spectrum footer가 붙을 수 있다.

개편 후에는 다음 원칙을 사용한다.

- shell은 chrome과 문맥만 소유한다.
- 관련 다음 행동은 route registry의 `nextActions` 또는 page use case가 선언한다.
- 운영·설정·정책·프로젝트 화면에는 generic marketing block을 자동 추가하지 않는다.
- footer는 Browse·Docs public surface에만 표시하고 Creator operational surface에서는 숨긴다.
## 7. Route readiness와 health test 재검토

### 7.1 현재 장점

현재 `RouteStage`는 다음을 보장한다.

- lazy route 중 접근 가능한 fallback heading
- navigation identity별 stage reset
- 8초 또는 Studio 12초 후 stalled recovery
- 재시도, directory, home 경로
- Studio 격리 재진입 중 주소와 작업 문맥 유지

이는 초기 설계가 요구한 빈 화면 방어의 좋은 기반이다.

### 7.2 현재 한계

`hasMeaningfulRouteContent`는 다음 중 하나만 있어도 의미 있는 route로 판단할 수 있다.

- 링크 또는 버튼
- H2·H3
- 이미지·캔버스
- 32자 이상의 텍스트

따라서 공통 header, generic footer, skeleton control만 렌더된 상태도 ready로 오인할 수 있다. 또한 health test는 다음을 통과 조건으로 사용한다.

- document title 존재
- H1 개수 1
- body text 24자 이상
- horizontal overflow 없음

이 H1은 page가 소유한 visible H1이 아니라 RouteStage의 `sr-only` fallback이어도 된다. `main` 개수와 주 행동도 검사하지 않는다.

### 7.3 수정된 readiness 계약

각 route는 다음 상태 중 하나를 명시적으로 projection한다.

```ts
type RouteReadiness =
  | { state: "loading"; phase: string; startedAt: number }
  | { state: "ready"; primarySurface: string }
  | { state: "degraded"; reason: string; recoveryActions: readonly Action[] }
  | { state: "blocked"; reason: string; alternative?: Action }
  | { state: "error"; errorId: string; retryable: boolean };
```

일반 page는 `data-route-ready`를 핵심 결과 container에 둔다. Creator editor는 문서 runtime이 아니라 실제 primary surface가 조작 가능해졌을 때 ready를 선언한다.

### 7.4 route 유형별 시간 예산

| route 유형 | loading 안내 | stalled recovery | ready 기준 |
| --- | ---: | ---: | --- |
| 문서·랜딩 | 1초 | 8초 | visible H1 + primary content |
| 목록·데이터 | 1초 | 8초 | shell + success/empty/error 중 하나 |
| 프로젝트 companion | 즉시 | 10초 | project state + primary action |
| Studio editor | 즉시 phase 표시 | 15초 | document runtime + active surface |
| AI·3D | 단계별 표시 | 20초 | capability 결과 + usable/safe mode |

시간이 길다고 무조건 실패 처리하지 않는다. 사용자가 현재 phase, 보존된 데이터, 취소·대체 경로를 이해할 수 있어야 한다.
## 8. 기존 P0 route 재평가

### `/market/browse`

현재 local main에서는 완전한 빈 화면이 재현되지 않았다. API를 사용할 수 없는 조건에서도 다음이 표시된다.

- H1 `리소스 찾기`
- 검색·카테고리 shell
- “리소스를 불러올 수 없어요” 오류 상태
- 다시 시도
- Studio로 이동

따라서 구현 결함 P0에서 **배포 환경 회귀 확인 P1**로 낮춘다. 단, 원래 문제는 hosted direct entry에서 관찰됐으므로 built artifact와 운영 host 검증 전에는 완료로 닫지 않는다.

### 모바일 `/reviews`

현재 local main에서 page error와 빈 화면이 재현되지 않았다. **회귀 테스트 유지 P2**로 낮춘다. 실제 provider success·empty·failure 데이터 세 가지를 모두 테스트해야 한다.

### `/studio/bg3d`

700ms에는 격리 재진입 fallback이 보였고 약 3초 이후 편집기가 로드됐다. 8초에는 실제 Studio controls가 렌더됐다. 현재 문제는 단순 blank가 아니라 다음이다.

- cross-origin isolation 재진입
- local/offline runtime 준비
- 대형 editor chunk와 3D surface 준비
- capability 결과가 사용자에게 충분히 설명되지 않음

따라서 P1 readiness·capability 작업으로 전환한다.

### `/studio/3d/dcc/sculpt`

local main의 짧은 audit에서는 fallback H1만 관찰됐지만 navigation·page error는 없었다. BG3D와 같은 장시간 surface 기준으로 다시 측정하고, low-detail safe mode와 surface error isolation을 확인해야 한다.

### `/publishing`

현재 directory에는 legacy `/publishing`이 없고 `/studio/publish`만 노출된다. canonical 정리는 진행됐지만 alias 직접 진입과 프로젝트 없음·오류 상태를 deployed deep-link gate에서 계속 확인한다.
## 9. 접근성·모바일 밀도 재검토

자동 휴리스틱은 확정적인 WCAG 위반 판정이 아니라 우선 검토 신호다. 특히 canvas editor의 roving tabindex와 숨은 input은 수동 확인이 필요하다.

### 9.1 이름 없는 인터랙션 후보 상위 route

| route | 후보 수 | 우선 조치 |
| --- | ---: | --- |
| `/studio/ai-runtime` | 29 | 연결·모델·작업 control의 accessible name과 상태 연결 |
| `/studio/ecosystem` | 28 | 카드·아이콘 action을 작업명과 함께 명명 |
| `/settings/ai` | 25 | provider·vault·priority control label 통합 |
| `/studio/ai-settings` | 25 | global AI 설정과 authority 통합 후 중복 control 제거 |
| `/showcase/promo` | 11 | 단계·preview·export icon button 명명 |
| `/studio/lift3d` | 10 | slider·mode·rights control의 현재 값 노출 |
| `/studio/projects` | 9 | project card quick action·view toggle 명명 |
| `/story-lab` | 8 | graph/node action과 keyboard alternative |

### 9.2 모바일 작은 target 후보 상위 route

| route | 후보 수 | 설계 판단 |
| --- | ---: | --- |
| `/studio/ai-settings` | 95 | 좁은 한 화면에 설정을 유지하지 말고 category·stepper 분리 |
| `/studio/ecosystem` | 72 | 역할별 today view와 advanced analysis 분리 |
| `/learn/glossary` | 69 | term index를 검색·category·list로 재구성 |
| `/studio/ai-runtime` | 65 | mobile은 connection review 중심으로 제한 |
| `/community/cafes` | 59 | chip·tab·card action 크기와 간격 확대 |
| `/explore` | 57 | basic filter와 advanced sheet 분리 |
| `/ranking` | 55 | filter sheet·table/card mode로 밀도 축소 |
| `/settings/ai` | 52 | provider cards와 model settings 점진 공개 |
| `/recommend` | 49 | 취향 질문을 소수 단계로 축소 |

### 9.3 실제 개선 확인

초기 운영 감사와 비교하면 다음 개선이 명확하다.

- `/tags`: 수천 개 tag target 동시 렌더링 문제가 상위 목록에서 사라짐
- `/ranking`: 이름 없는 control 후보가 재현되지 않고 mobile small target도 456에서 55 수준으로 감소
- 모든 112개 경로에 H1 하나가 존재
- 확인한 viewport에서 horizontal overflow 없음

그러나 H1 하나가 존재한다는 사실만으로 page identity가 완료된 것은 아니다. fallback H1과 실제 surface title을 구분해야 한다.
## 10. Production과 Studio 프로젝트 IA 재설계

현재 main에는 프로젝트를 다루는 네 개의 큰 표면이 있다.

- `/production`: 기획·회차·역할·일정·검수·계약 운영
- `/studio` 및 `/studio/projects`: 파일·초안·공유 작업·복구·편집 진입
- `/studio/ecosystem`: 제작 분석·검수·번역·반응을 묶은 고급 작업대
- `/studio/publish`: 원고·메타데이터·공개 준비

이들은 서로 대체 관계가 아니라 하나의 작품 lifecycle에서 다른 authority를 가져야 한다.

### 10.1 권장 authority map

| 영역 | 권위 | 주요 entity | 하지 않는 일 |
| --- | --- | --- | --- |
| Production | 제작 운영 | project, season, episode, assignment, schedule, handoff, approval, agreement | pixel·vector 문서 저장 권위가 되지 않음 |
| Studio Project Library | 작업 파일·복구 | local draft, saved work, package, snapshot, collaboration entry | 계약·정산·인력 운영을 복제하지 않음 |
| Studio Editor | 콘텐츠 편집 | document, page, layer, object, undo, autosave | 프로젝트 운영 dashboard를 소유하지 않음 |
| Ecosystem | 고급 분석 projection | 품질 신호, 번역 상태, provenance, review analytics | 또 하나의 project DB가 되지 않음 |
| Publish | 공개 준비 | export receipt, metadata, rights confirmation, release settings | 원고 권위 저장소가 되지 않음 |

### 10.2 사용자에게 보이는 구조

```text
제작 관리 /production
├─ 오늘 할 일
├─ 회차·역할·일정
├─ 작업 넘기기·검수
├─ 계약·권리·정산
└─ 원고 열기 → /studio/work/:workId/...

프로젝트 /studio
├─ 최근 작업
├─ 로컬 초안
├─ 공유 작업
├─ 복구 항목
└─ 파일 가져오기·새 작품

편집기 /studio/work/:workId/:surface
├─ 문서·페이지·레이어
├─ 저장·동기화 상태
├─ 댓글·검토 projection
└─ 제작 관리 열기 → /production/projects/:projectId/...
```

### 10.3 project identity 연결

Production `projectId`, Studio `workId`, 문서 runtime identity를 같은 ID로 강제하지 않는다. 명시적인 relation을 둔다.

```ts
interface ProductionStudioLink {
  productionProjectId: string;
  workId: string;
  seriesId?: string;
  episodeId?: string;
  documentRole: "story" | "thumbnail" | "lineart" | "background" | "color" | "lettering" | "final";
  linkedRevision: number;
}
```

이 relation은 작업 넘기기와 검수의 입력 revision을 고정하며, 파일 저장·undo·CRDT 권위를 Production에 옮기지 않는다.
## 11. 수정된 Route Registry 설계

현재 `site-route-metadata.ts`의 타입은 유용하지만 완전한 레지스트리로 사용하기에는 정보가 부족하다. main 기준으로 다음 필드가 추가돼야 한다.

```ts
type SiteShell = "browse" | "creator" | "docs" | "admin";
type MobileMode = "full" | "review" | "preview" | "unsupported";
type RouteKind = "static" | "family" | "alias";

interface SiteRouteDefinition {
  id: string;
  kind: RouteKind;
  path: string;
  pattern?: string;
  canonicalPath: string;
  titleKey: string;
  labelKey: string;
  descriptionKey: string;
  keywords?: readonly string[];
  shell: SiteShell;
  template: string;
  product: "studio" | "spectrum" | "docs";
  purpose: "create" | "discover" | "learn" | "connect" | "manage" | "trust";
  maturity: "stable" | "beta" | "experimental";
  access: "public" | "sign-in" | "project";
  projectContext: "none" | "optional" | "required";
  device: "responsive" | "desktop-first";
  mobileMode: MobileMode;
  readinessProfile: "document" | "collection" | "project" | "editor" | "capability";
  ownerDomain: string;
  primaryActionKey?: string;
  nextActions?: readonly string[];
}
```

### 11.1 번역 계약

현재 `SiteNavigationText = Record<"ko" | "en", string>`는 299개 locale 선택과 맞지 않는다. Registry에는 번역된 문장 자체가 아니라 key를 저장한다.

- 한국어 source bundle이 최종 fallback
- 검수된 locale bundle이 있으면 해당 번역 사용
- 누락된 key는 기존 runtime translation·English fallback 정책을 따름
- route definition은 locale catalog를 import하지 않음
- 검색 index는 현재 locale, 한국어 source, 영어 fallback을 조합해 생성

### 11.2 동적 route family

`/production/projects/:projectId/...`처럼 동적 경로는 site directory card와 동일하게 취급하지 않지만 Registry에서 빠져서는 안 된다.

```ts
{
  id: "production-project-review",
  kind: "family",
  pattern: "/production/projects/:projectId/review",
  canonicalPath: "/production/projects/:projectId/review",
  shell: "creator",
  template: "production-project",
  projectContext: "required",
  readinessProfile: "project"
}
```

Directory에는 `/production` 하나를 노출하고, title·analytics·access·health test는 family record를 사용한다.
## 12. main 기준 우선순위

### P0 — 다음 구현 전에 해결

#### M17-01 Production route authority integration

- `/production`과 dynamic family를 Registry·title·directory·analytics·health test에 등록
- product=`studio`, purpose=`manage`, shell=`creator`
- `/production` 브라우저 title 추가
- `/production`을 Studio sitemap 핵심 경로에 노출

#### M17-02 Single main landmark ownership

- AppShell을 유일한 main owner로 고정
- 19 desktop·22 mobile route의 nested main 제거
- skip link·focus target 계약 유지
- CI에서 `document.querySelectorAll("main").length === 1` 검증

#### M17-03 Route health contract hardening

- hidden fallback H1만으로 정상 판정하지 않음
- `data-route-ready` 또는 명시적 degraded/blocked/error state 요구
- primary route 112개와 domain family sample을 검사
- route 유형별 timeout budget 적용

#### M17-10 Rendered directory reachability

- source text 문자열 존재를 실제 접근 가능성으로 간주하지 않음
- Registry selector 또는 렌더된 canonical href를 검사
- `/studio/comic` 등 domain route를 명시적으로 포함 또는 제외

### P1 — P0 직후 수직 슬라이스

1. `/studio/new`, `/studio/assets`를 Registry·directory에 편입
2. Production과 Studio project authority 연결
3. generic journey 자동 삽입 제거
4. worldwide locale용 title·label key 전환
5. deployed host direct-entry gate
6. AI settings·runtime accessible control 정리
7. Creator route의 mobile full/review/preview 정책
8. BG3D·Sculpt capability·safe mode
9. Studio·Production domain route catalog projection

### P2 — page별 제품 고도화

- search·explore·recommend 공통 URL state
- community/cafe IA
- learning/glossary 밀도
- market compare·fit·seller workflow
- research evidence flow
- docs shell 완성
- personal dashboard와 설정 통합

## 13. 수정된 PR 순서

### PR A — Production route parity

변경 예상:

- `site-route-metadata.ts`
- `route-titles.ts`
- `SitemapPage.tsx`
- `SitemapPage.test.ts`
- production route title tests
- site navigation integrity tests

완료 조건:

- `/production`, `/studio/new`, `/studio/assets`가 directory·metadata·title에서 일치
- Production dynamic family가 orphan으로 검출되지 않음
- 기존 alias·Studio document lifetime에 영향 없음
### PR B — Landmark and readiness contract

변경 예상:

- `AppShell.tsx`
- 중복 `<main>`을 반환하는 page roots
- `route-stage.tsx`
- `route-stage-content.ts`
- `site-directory-health.spec.ts`

완료 조건:

- 모든 정적 검토 route에서 main 정확히 하나
- loading fallback과 실제 page H1을 구분
- 일반 route가 24자 generic text만으로 healthy 판정되지 않음
- Studio는 active surface ready 또는 degraded·blocked 상태를 명시

### PR C — Registry consolidation

- prefix 배열을 typed record reader로 단계 전환
- route groups는 element·lazy loading만 소유
- title, directory, command palette, history, public policy가 registry selector 사용
- 299 locale 대응 translation key 도입
- 기존 `site-route-metadata.ts` API는 adapter로 유지 후 제거

### PR D — Production ↔ Studio project bridge

- `ProductionStudioLink` 계약
- Production에서 해당 work 문서 열기
- Studio project card에서 제작 상태 열기
- handoff input revision과 review receipt 연결
- first-save·package import·autosave authority 재사용

### PR E — Shell policy

- Browse·Creator·Docs shell 적용
- Creator operational route에서 public footer·generic journey 제거
- route/page별 contextual next action 선언
- mobile Creator mode projection

### PR F — Deployed-host release gate

- production build artifact로 deep-link 검사
- service worker cold/warm navigation
- isolation reload 전후 주소·draft 보존
- API 503·offline·chunk failure
- alias direct entry
- Safari·Chrome·Firefox 대표 경로

PR A와 PR B를 먼저 병합한 뒤 Registry consolidation을 진행한다. 현재 route metadata 기반 구현을 바로 전면 교체하면 #1528의 안정화 효과를 되돌릴 위험이 있다.
## 14. 수정된 QA·완료 기준

### 14.1 Route integrity

- route group의 모든 static user route가 Registry 또는 intentional exclusion에 존재
- dynamic route pattern이 title·shell·access policy를 가짐
- internal navigation에 alias 없음
- primary navigation 목적지가 directory 또는 명시적 예외에 존재
- route title fallback이 단순 app name으로 떨어지는 user-facing route 0개

### 14.2 Semantics

- browser document당 main 정확히 하나
- page-owned visible H1 또는 editor active-surface identity 하나
- fallback heading은 loading 기간에만 존재하고 실제 H1과 중복되지 않음
- header, navigation, main, complementary, footer landmark의 이름과 중복 검사
- skip link가 실제 main owner에 focus 이동

### 14.3 Readiness

- success, empty, degraded, blocked, error 중 하나가 명시됨
- loading 상태에 phase와 보존 데이터 안내가 있음
- route-ready는 공통 header·footer가 아니라 domain primary surface가 선언
- Studio isolation reload가 pathname, search, draft scope를 유지
- timeout 이후 retry, alternative, directory 중 하나 이상 제공

### 14.4 Mobile

- 핵심 control 44 CSS px 기준
- desktop-first surface는 review·preview·unsupported 정책 중 하나를 가짐
- fixed bottom navigation이 editor action bar와 겹치지 않음
- virtual keyboard, safe area, orientation 변화 검사
- 390×844뿐 아니라 360×800, 430×932, tablet width를 포함

### 14.5 Project durability

- first save 취소 시 browser draft 유지
- `.toonstudio` import 실패 시 rollback
- Production link가 document runtime identity를 변경하지 않음
- restore 전 checkpoint 생성
- local saved와 cloud synced를 다른 상태로 표시
- review·handoff receipt가 지정 work revision을 참조

### 14.6 Release

- local dev, production build, deployed host를 구분해 결과 기록
- 기준 main SHA와 build artifact hash 기록
- API success·empty·503·offline 각각 검사
- service worker cold/warm 상태 검사
- feature flag와 rollback owner 기록
- 운영 배포는 별도 명시적 승인 전에는 수행하지 않음
## 15. 이번 재검토 산출물

| 파일 | 역할 |
| --- | --- |
| `main-revalidation-20260917.md` | 현재 main 기준 판단·우선순위·수정 설계 |
| `main-route-revalidation-20260917.csv` | 112개 정적 경로의 현재 audit·인벤토리·행동 |
| `main-route-authorities-20260917.csv` | Studio product registry·runtime manifest·Production route group 57개 record |
| `main-backlog-revalidation-20260917.csv` | 기존 77개 작업의 상태와 main에서 새로 생긴 10개 작업 |
| `route-inventory.csv` | 2026-09-16 운영 사이트 감사의 역사적 snapshot |
| `implementation-backlog.csv` | 최초 설계의 원본 backlog |

원본 CSV를 덮어쓰지 않는 이유는 운영 사이트 감사 시점과 현재 main 구현 상태를 혼합하지 않기 위해서다.

## 16. 원 설계에서 유지·수정·대체되는 결정

### 그대로 유지

- Browse·Creator·Docs 세 셸 방향
- canonical URL과 alias 분리
- 상태를 기능 일부로 취급
- 모바일을 역할별 모드로 설계
- Studio document runtime authority 보존
- 수직 슬라이스와 feature flag 배포

### main 기준으로 수정

- P0는 blank route 중심에서 route authority·landmark·readiness 중심으로 이동
- 108개 route라는 고정 수치는 directory snapshot으로 한정
- current primary route와 dynamic family를 별도 Registry 범위에 포함
- `ko/en` route copy 대신 translation key·fallback 정책 사용
- project hub 설계에 Production workcell과 first-save package 흐름 반영

### 대체

- route마다 main owner를 선택하는 유연한 모델 대신 AppShell 단일 main owner
- generic DOM 휴리스틱 readiness 대신 명시적 route readiness state
- 사이트맵 source 배열을 사실상 registry처럼 확장하는 방식 대신 typed Registry selector

## 17. 제한과 추가 확인

이번 재검토는 최신 main 소스와 로컬 브라우저 실행을 기준으로 한다. 다음은 별도 검증이 필요하다.

- 실제 운영 API 성공 데이터
- 로그인 계정과 권한별 project flow
- 브라우저를 닫고 다시 여는 local durability
- 실제 배포 host의 rewrite·CSP·service worker
- Safari GPU·OPFS·isolation 조합
- 대형 문서·대형 catalogue 성능
- 공동 편집 다중 사용자 충돌
- 실제 AI provider·local runtime·GPU 모델

따라서 local main에서 해결된 route도 deployed release gate를 통과하기 전에는 운영 완료로 주장하지 않는다.

## 18. 1차 판단 요약

현재 main은 최초 감사 당시보다 안정성과 접근성이 분명히 개선됐다. 특히 사이트맵, support, 정책 문서, 태그, 랭킹, market 오류 UI, 프로젝트 저장 흐름은 실질적으로 진전됐다.

반면 기능이 빠르게 확장되면서 `/production`, Studio project library, ecosystem, publish가 서로 다른 속도로 성장했다. 이제 가장 큰 위험은 기능 부족이 아니라 **같은 제품 안에 route·project·shell authority가 여러 벌 생기는 것**이다.

다음 개발은 PR A의 Production route parity와 PR B의 landmark/readiness 계약부터 시작한다. 이 두 작업이 완료되어야 이후 셸 개편과 Production–Studio 연결을 안전하게 진행할 수 있다.

## 19. 추가 발견 — 이미 존재하는 route 권위

현재 main에는 단순한 site metadata 외에도 다음 route 권위가 존재한다.

| 권위 | 수량 | 책임 | 현재 위험 |
| --- | ---: | --- | --- |
| `app/routes/groups/*` | app 전체 | 실제 React route element·ordering | metadata와 별도 유지 |
| `site-route-metadata.ts` | prefix policy | product·purpose·access·device | 완전한 route record가 아님 |
| `studio-route-registry.ts` | 29 | Studio product IA·alias·resource·runtime key | title이 ko/en 문자열이고 global directory와 미연결 |
| `studio-router/studio-route-manifest.ts` | 14 | 실제 Studio resolver·lifecycle kind | product registry와 pattern 모델이 다름 |
| `production.routes.tsx` | 14 | Production React route pattern | site metadata·directory와 미연결 |
| `route-titles.ts` | global title | 문서 title | 신규 domain route 누락 가능 |
| `SitemapPage.tsx` | directory | 사용자-facing destination | 수동 배열과 navigation source에 의존 |

새 전역 Registry가 Studio path grammar를 다시 복제해서는 안 된다. Domain registry와 runtime manifest를 typed adapter로 projection해 title, navigation, directory, access, analytics, health test가 소비하도록 한다.
### 권장 수렴 구조

```text
Domain route catalogs
├─ Studio product registry
├─ Studio runtime manifest
├─ Production route catalog
└─ Public domain route metadata
          ↓ typed adapters
SiteRouteRegistry projection
          ↓
title · navigation · directory · access · analytics · health test
```

전역 Registry는 domain path resolver의 projection을 소비하고, document lifecycle이나 Studio canonical 계산을 다시 구현하지 않는다.

### Directory test의 source-text false positive

현재 `SitemapPage.test.ts`는 실제 렌더된 링크만 검사하지 않고 `SitemapPage.tsx`와 전체 `site-navigation.ts` source text를 합쳐 문자열 존재를 확인한다. 이 때문에 `SITE_NAVIGATION_ITEMS`에만 존재하고 실제 `SITE_NAVIGATION_GROUPS`에 포함되지 않은 `/studio/comic`도 directory에 있는 것처럼 테스트가 통과할 수 있다.

수정 원칙:

- Registry selector가 반환한 실제 directory entry를 검사한다.
- 또는 `SitemapPage`를 렌더해 canonical href 집합을 검사한다.
- unused navigation constant의 문자열 존재를 reachability 증거로 사용하지 않는다.
- `/studio/comic`, `/studio/import`, `/studio/templates`, recovery·trash 등은 directory 노출 여부를 명시적으로 결정한다.
- 112개 수치는 directory와 1차 목적지 중심의 정적 재검토 집합이며 앱 전체 route 총수가 아니다.
- Domain registry family는 별도 integrity matrix에서 검증한다.
## 20. 최종 결정

최신 main은 최초 감사 당시보다 안정성과 접근성이 개선됐지만 route authority는 오히려 더 복잡해졌다. 전역 metadata, Studio product registry, Studio runtime manifest, Production route group을 하나의 새 거대 목록으로 덮어쓰면 또 다른 권위가 생긴다.

최종 방향은 **domain route catalog를 유지하고 전역 SiteRouteRegistry를 projection으로 구성하는 방식**이다.

즉시 진행 순서는 다음과 같다.

1. Production·Studio primary route와 실제 directory link의 parity 복구
2. source-text가 아닌 rendered directory reachability 검사
3. AppShell 단일 main landmark
4. explicit route readiness와 route 유형별 timeout
5. domain catalog adapter와 translation-key 기반 site projection
6. Production 운영 authority와 Studio 파일·문서 authority 연결
7. Browse·Creator·Docs shell rollout

이 순서를 지키면 이미 main에 병합된 first-save, workspace panel, Studio runtime, market lifecycle과 충돌하지 않고 전체 UX 설계를 단계적으로 완성할 수 있다.

