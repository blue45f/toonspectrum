# 구현·마이그레이션 계획

## 1. 전달 원칙

- 빅뱅 전환을 금지한다.
- 공통 기반만 만드는 장기 브랜치를 피하고 실제 페이지 수직 슬라이스와 함께 도입한다.
- 라우트·셸·도메인 기능 변경을 가능한 한 분리된 커밋으로 유지한다.
- Studio 문서 런타임, 저장·협업 권위, 렌더 엔진을 셸 개편과 동시에 재작성하지 않는다.
- 각 PR은 feature flag, 자동 검증, 롤백 경로를 가진다.
- 운영 배포는 별도 승인 대상이며 PR 병합과 분리한다.

## 2. 단계 개요

| 단계 | 목적 | 주요 결과 |
| --- | --- | --- |
| 0 | P0 안정성 | 빈 화면·렌더 실패·모바일 오류 제거 |
| 1 | Route Registry | 단일 메타데이터·canonical·자동 검증 |
| 2 | 공통 상태 | RouteFrame·Error·Empty·Access·Capability |
| 3 | Browse·Docs 셸 | 공개·문서 페이지 위계와 모바일 셸 |
| 4 | 탐색·태그·랭킹 | 고밀도 화면과 검색 구조 개선 |
| 5 | 마켓·개인 공간 | 목록·적합성·대시보드·설정 |
| 6 | Creator 프로젝트 | 프로젝트·검토·공유·버전·게시 문맥 통합 |
| 7 | 몰입형 Studio | 크롬·모바일 모드·능력 검사 |
| 8 | AI·3D 복구 | 안전 모드·작업 큐·실행 계약 |
| 9 | 정리·출시 | alias 제거, 구 코드 삭제, 전체 게이트 |
## 3. 단계 0 — P0 안정성

### 대상

- `/market/browse`
- `/publishing` → `/studio/publish`
- `/studio/bg3d`
- `/studio/3d/dcc/sculpt`
- 모바일 `/reviews`
- 장시간 skeleton인 `/music`, `/studio/poser`

### 작업

1. 라우트별 오류 원인을 재현하고 failure domain을 기록한다.
2. route-level error boundary와 의미 있는 fallback을 추가한다.
3. 데이터·WebGL·lazy chunk 실패를 구분한다.
4. 8초·12초 지연 복구와 재시도·안전 모드를 제공한다.
5. canonical 리디렉션 후 목적지 readiness를 검증한다.
6. blank route smoke 테스트를 CI에 추가한다.

### 완료 조건

- HTTP 200이며 `main`, H1, 의미 있는 콘텐츠가 모두 없는 화면 0개
- 실패해도 전역 셸과 복구 행동 표시
- 원본·로컬 초안·프로젝트 런타임 보존 여부 설명
- 모바일과 데스크톱 각각 Playwright 테스트 통과

## 4. 단계 1 — Route Registry

### 첫 수직 슬라이스

`/sitemap`, `/support`, `/market/browse`, `/studio/projects` 네 유형을 사용해 docs·browse·creator·broken route를 모두 검증한다.
### PR 순서

1. Registry 타입·정적 데이터·중복 검증
2. 기존 route title과 사이트맵을 Registry reader로 전환
3. command palette·최근 방문 canonical 정규화
4. alias 내부 링크 교체와 redirect 계약 테스트
5. 분산 경로 배열 제거

### 제약

- route element와 lazy import는 기존 route group이 계속 소유한다.
- Registry가 도메인 페이지를 import하지 않는다.
- Studio route parser와 document lifecycle key를 대체하지 않는다.
- Registry의 `access`는 UI 정책이며 서버 권한 검증을 대체하지 않는다.

## 5. 단계 2 — 공통 상태 기반

### 도입 컴포넌트

- `RouteFrame`
- `RouteRecoveryState`
- `EmptyState`
- `ErrorState`
- `AccessGate`
- `ProjectPickerState`
- `StudioCapabilityGate`
- `StudioSaveIndicator`

### 수직 슬라이스

- 빈 결과: `/market/wishlist`
- 로그인 필요: `/me`
- 프로젝트 필요: `/studio/review`
- 긴 로딩: `/studio/poser`
- 데이터 오류: `/market/browse`
- GPU 제한: `/studio/bg3d`

공통 상태는 `shared`에 두되 도메인별 오류 코드·복구 command는 도메인이 주입한다.
## 6. 단계 3 — BrowseShell·DocsShell

### BrowseShell 우선순위

1. `/sitemap`
2. `/discover`, `/search`
3. `/community`, `/showcase`
4. `/learn`, `/research`
5. 개인·설정 화면

### DocsShell 우선순위

1. `/support`, `/help`
2. `/privacy`, `/terms`, `/copyright`
3. `/about/data`, `/about/crawler`, `/accessibility`
4. `/design`, `/about/technology`, `/guide`

### 변경 원칙

- 기존 공통 마케팅 후속 섹션을 자동 삽입하지 않는다.
- 페이지가 필요할 때만 관련 다음 행동을 직접 선언한다.
- ContextBar를 큰 문맥 배너 대신 사용한다.
- 모바일에서 실제 콘텐츠가 첫 뷰포트 안에 시작되도록 한다.
- 기존 디자인 토큰을 유지하고 새로운 raw 색상 체계를 만들지 않는다.

## 7. 단계 4 — 탐색·태그·랭킹

### `/tags`

- 태그 전체 동시 렌더링 제거
- 검색, 초성·알파벳, 클러스터, 인기 태그, 관련 태그
- 가상화 또는 페이지 처리
- 태그 상세에 대표 작품과 연관 태그 제공

### `/ranking`

- 카드와 데이터 표 모드 분리
- 기간·축·플랫폼 필터 고정
- 이름 없는 링크·버튼 제거
- 순위 변화 이유와 데이터 신뢰도 표시
- 이미지·행 가상화와 모바일 밀도 축소
### `/search`, `/explore`, `/recommend`

- URL 직렬화된 검색·필터 계약 공유
- 작품·작가·태그·자료 탭
- 모바일 필터 sheet
- 추천 이유와 피드백
- 결과 없음과 공급자 오류 구분

## 8. 단계 5 — 마켓·개인 공간

### 마켓

- `/market/browse`: 실패와 무관하게 셸·캐시·재시도 표시
- `/market/compare`: 가격·권리·포맷·호환성 기준 표준화
- `/market/fit`: 프로젝트 선택→검사→근거→수정 흐름
- `/market/publish`: 단계형 manifest·권리·파일 검증
- `/market/library`: 설치·업데이트·비호환 상태

### 개인 공간

- `/my`: 최근 작업, 검토, 복구, 업데이트를 오늘 할 일로 통합
- `/me`: 프로필·계정 세부로 역할 축소
- `/settings`: 검색 가능한 범주·변경 미리보기·되돌리기
- `/settings/ai`: 공급자·키·비용·우선순위·fallback의 단일 권위

### 완료 조건

- 비로그인 화면에서도 가치와 예시가 보인다.
- 로그인 후 원래 route와 입력 초안으로 복귀한다.
- 설치·게시·설정 변경은 명확한 성공·실패 영수증을 남긴다.

## 9. 단계 6 — Creator 프로젝트 운영

대상: `/studio`, `/studio/projects`, `/studio/review`, `/studio/share`, `/studio/versions`, `/studio/present`, `/studio/publish`, `/studio/join`.

첫 구현은 URL 전면 개편보다 공통 ContextBar와 ProjectPickerState 도입에 집중한다.
### 작업

- 프로젝트 목록에 실제 작업 썸네일·역할·동기화·다음 행동 표시
- companion 페이지에 H1과 동일한 프로젝트 문맥 제공
- 프로젝트 미선택, 권한 없음, 삭제됨, 오프라인 미보유 구분
- review 댓글 위치·담당·해결 상태
- share 권한표·만료·접근 기록
- versions 로컬·서버 타임라인과 비교
- publish 준비 점수·누락 항목·최종 미리보기

### 경계

- CRDT·autosave·document runtime authority는 기존 모듈을 사용한다.
- 프로젝트 UI가 저장 권위를 새로 만들지 않는다.
- 기존 `/studio/work/:workId/...` canonical grammar와 호환한다.

## 10. 단계 7 — 몰입형 Studio

### 우선 표면

1. drawing / brushes
2. animation
3. character / poser
4. 3D DCC
5. BG3D

### 작업

- 글로벌 셸 제거와 CreatorShell 크롬 통일
- 패널 도킹·팝아웃·배치 복원 계약
- 캔버스 방해 감지와 자동 도킹
- 모바일 `full/review/preview/unsupported` 분기
- 모든 아이콘 도구 이름·단축키·tooltip
- 작업공간별 빈 샘플과 첫 성공 과업
- surface error boundary와 document runtime 보존 테스트

각 표면은 별도 PR과 feature flag로 전환한다. 모든 표면을 동시에 새 크롬으로 옮기지 않는다.
## 11. 단계 8 — AI·3D 복구와 작업 큐

### 공통 계약

- Capability check: GPU, WebGL, WASM, isolation, model, external engine
- 실행 전: 데이터 전송 범위, 예상 시간·비용, 출력 형식
- 실행 중: 작업 ID, 진행률, 취소, route 이탈 후 추적
- 실패: 원인, 재시도 가능성, 안전 모드, 입력 보존
- 결과: 원본 비교, 프로젝트 적용, 실행 취소·버전

### 우선 대상

- `/studio/bg3d`
- `/studio/3d/dcc/sculpt`
- `/studio/poser`
- `/studio/lift3d`
- `/studio/character-convert`
- `/studio/generate`
- `/studio/ai-lab`, `/studio/ai-runtime`
- `/studio/jobs`

개별 기능이 독자적인 연결·오류·작업 상태 UI를 만들지 않고 공통 runtime contract를 사용한다.

## 12. 단계 9 — 정리와 출시

- alias가 아닌 내부 링크 0개 확인
- 사용되지 않는 route metadata·경로 배열 제거
- 구 셸·후속 마케팅 자동 삽입 제거
- 108개 route smoke·시각 회귀 재생성
- 번들 그래프와 성능 예산 확인
- 접근성 수동 점검
- 기능 플래그별 롤백 리허설
- 제품·지원·운영 문서 갱신

## 13. Feature flag

| 플래그 | 범위 |
| --- | --- |
| `site_route_registry_v2` | Registry reader와 canonical 정규화 |
| `site_route_frame_v2` | H1·stalled route·공통 복구 |
| `browse_shell_v2` | BrowseShell 페이지군 |
| `docs_shell_v2` | DocsShell 페이지군 |
| 플래그 | 범위 |
| --- | --- |
| `creator_shell_v2` | CreatorShell 공통 크롬 |
| `site_collection_filters_v2` | 검색·필터 URL 계약과 모바일 sheet |
| `market_experience_v2` | 마켓 탐색·비교·적합성 |
| `studio_project_context_v2` | 프로젝트 companion 문맥 |
| `studio_capability_gate_v2` | 3D·AI 사전 검사와 안전 모드 |

플래그는 route id 또는 사용자 cohort로 제한할 수 있어야 하며 데이터 스키마를 두 개의 권위로 분기하지 않는다.

## 14. PR 분해 규칙

좋은 PR 예시:

1. Registry 타입·검증만 추가
2. `/sitemap`을 Registry consumer로 전환
3. alias 링크 교체
4. RouteFrame 도입과 테스트
5. `/support` DocsShell 수직 슬라이스
6. `/search` Browse collection 수직 슬라이스
7. `/studio/projects` Creator project 수직 슬라이스

피해야 할 PR:

- 108개 페이지의 JSX·CSS를 한 번에 변경
- route grammar와 Studio runtime을 동시에 변경
- 공통 컴포넌트만 수십 개 만들고 실제 사용처가 없음
- 디자인 리뉴얼과 데이터 모델·백엔드 API 재작성 결합
- 테스트 snapshot 대량 갱신만으로 의미 구조 회귀를 숨김

## 15. 병렬 작업 소유권

| 트랙 | 주요 파일 소유 |
| --- | --- |
| Route foundation | `app/routes`, registry tests |
| Public shells | `shared/components/site-*`, public shell CSS |
| Docs | `domains/legal`, `domains/help` |
| Discovery | catalog/search/ranking/tag domains |
| Market | market domain and contracts |
| Creator project | Studio companion and project context |
| Immersive editor | surface-specific modules, legacy adapter seam |
| QA | e2e route audit, visual snapshots, a11y harness |
병렬 트랙이 같은 대형 파일을 공유해야 하면 route, presentation, runtime 순서로 별도 커밋을 만들고 한 트랙이 먼저 소유권 경계를 추출한다.

## 16. 롤백 전략

- 셸 전환: route 단위 feature flag로 이전 셸 복귀
- Registry: 기존 route group 유지, reader만 롤백
- 필터 URL: 구 query 파서를 한 릴리스 동안 읽기 호환
- CreatorShell: 문서 런타임을 유지하고 크롬만 이전 구현으로 복귀
- 데이터 변경: additive migration과 dual-read 기간, dual-write는 최소화
- 캐시·서비스 워커: 새 번들 실패 시 검증된 이전 자산으로 복귀

롤백이 사용자 초안·프로젝트를 삭제하거나 포맷을 되돌리는 방식이어서는 안 된다.

## 17. 예상 구현 단위

정확한 일정은 담당 인원과 P0 원인 확인 후 산정한다. 상대 규모는 다음과 같다.

| 묶음 | 상대 규모 | 주요 위험 |
| --- | --- | --- |
| P0 route 안정성 | M | 운영에서만 재현되는 lazy·CSP·GPU 오류 |
| Registry·canonical | M | 분산 메타데이터와 동적 route 누락 |
| 공통 상태 | M | 도메인 오류를 지나치게 일반화 |
| Browse·Docs 셸 | L | 많은 페이지의 공통 후속 섹션 의존 |
| 검색·랭킹·태그 | L | 데이터량·가상화·SEO |
| Market·개인 공간 | L | 인증·설치·게시 상태 |
| Creator project | L | 문서 identity·권한·복구 |
| Immersive Studio | XL | 대형 legacy adapter와 입력·렌더 성능 |
| AI·3D execution | XL | 외부 엔진·GPU·작업 큐·비용 |

## 18. 개발 종료 조건

- `implementation-backlog.csv`의 P0·P1 완료
- `route-inventory.csv`의 모든 route가 검증된 셸·상태 계약을 사용
- `qa-acceptance.md`의 release gate 통과
- 미해결 P2는 사용자에게 제한 상태를 정확히 설명
- 사용자 승인 없이 운영 배포하지 않음