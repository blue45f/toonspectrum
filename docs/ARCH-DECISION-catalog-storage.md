# 아키텍처 결정 — 카탈로그 저장/조회: 정적 CDN + 수동 갱신

## v5 (2026-09-16) — 배포 런타임 읽기 전용, 수집은 로컬 수동 작업

### 결정

카탈로그 크롤링과 갱신은 운영자가 필요할 때 로컬에서 직접 실행합니다. 배포된 웹·API·GitHub
Actions에는 크롤 실행, 주기 스케줄러, 관리자 실행 UI, 갱신 API, 파일 폴링, DB 카탈로그 스냅샷이나
수집 실행 이력을 두지 않습니다.

- 운영 원본: 검토 후 커밋된 `apps/api/data/catalog.json.gz`
- 정적 사용자 경로: `pnpm catalog:gen`이 생성한 `apps/web/public/data/*.json`
- API 경로: 번들된 gz 파일을 프로세스 부팅 시 한 번 읽는 read-only loader
- 갱신 명령: `pnpm catalog:update:manual`
- 관련 정보 갱신: `pnpm related:update:manual`
- 반영 조건: 품질 검증 + 사람 diff 검토 + 커밋 + 재배포

### 수동 갱신 트랜잭션

`catalog:update:manual`은 새 수집 JSON을 기존 스냅샷과 임시 파일에서 병합하고, 최종 병합본에
`validate-catalog.mjs`를 실행합니다. 검증에 성공한 경우에만 운영 gz 파일을 교체하고 정적 산출물을
재생성합니다. 특정 플랫폼이 일시적으로 차단되면 기존 작품을 유지해 대량 삭제를 방지합니다.

### 제거한 운영 복잡도

- `catalog/ingest`·`catalog/refresh` API
- API 내부 ingest scheduler와 refresh polling
- catalog update·refresh-data·related-info scheduled workflows
- 관리자 수동 크롤 버튼과 실행 상태 패널
- `catalog_snapshot`·`catalog_ingest_run` Drizzle/readiness 의존성
- ingest token, interval, timeout, retention 등 배포 환경변수

## v4 (2026-09) — 무료 우선 정적 호스팅 경계

이 결정의 권위는 “카탈로그는 정적 CDN, 동적 데이터는 PostgreSQL”이며 특정 VM provider가
아닙니다. 정적 웹과 카탈로그는 Cloudflare Static Assets 전환 경계를 사용하고, 동적 권한 데이터는
Neon/호환 PostgreSQL을 단일 원장으로 유지합니다. 재생성 불가능한 백업은 독립 공급자와 암호화된
로컬 사본에 둡니다.

## 배경 — DB 카탈로그 전송 쿼터 사고

과거 서버 ingest 경로는 24k편 카탈로그 JSON을 `catalog_snapshot` 한 행으로 통째로 쓰고 읽었습니다.
크롤 1회마다 수십 MB의 DB 전송이 발생해 Neon 무료 플랜 데이터 전송 쿼터를 소진했고, 리뷰·로그인
같은 동적 기능에도 영향을 주었습니다. 이후 카탈로그 본문을 파일로 옮겼지만, 런타임 쓰기·폴링·실행
이력·트리거 API가 남아 있었습니다. v5에서 이 잔여 운영 경로도 제거했습니다.

## 현재 저장 경계

- **정적 카탈로그**: 작품 검색·탐색·랭킹·캘린더·상세 샤드
- **PostgreSQL**: 계정·세션·리뷰·커뮤니티·피드백·창작·협업 등 동적 데이터
- **오브젝트 스토리지**: 재생성 불가능한 창작 자산과 백업

카탈로그는 DB로 되돌리지 않습니다. 정적 CDN은 사용자 상호작용의 서버 왕복을 줄이고, 동적 API나
DB가 일시 장애여도 탐색·검색·랭킹을 계속 제공할 수 있습니다.

## 비용·성능·복원력 효과

- 카탈로그 갱신 시 DB 전송량: 수십 MB 읽기·쓰기 → 0
- API 부팅 시 카탈로그 DB 조회: 없음
- 정적 검색·랭킹 트래픽: CDN이 흡수
- 크롤러 장애·지오차단: 배포 서비스와 격리
- 잘못된 자동 갱신: 사람 검토와 재배포 없이는 사용자 경로에 반영되지 않음

## 미래 재검토 조건

카탈로그가 100k+로 커져 브라우저 페이로드가 과도해지거나, 서버사이드 페이지네이션·실시간 개인화
쿼리가 필수로 바뀌면 read-only 검색 백엔드를 별도로 검토할 수 있습니다. 이 경우에도 외부 플랫폼
수집과 사용자 요청 경로를 분리하고, 크롤러를 웹/API 프로세스 안에 다시 넣지 않습니다.

## 결과

- 카탈로그: 정적 CDN + 검토된 파일 스냅샷
- 갱신: 로컬 수동 실행 + 품질 게이트 + 사람 승인
- API: 번들 파일 부팅 로드만 수행
- DB: 동적 제품 데이터 전용
- 자동 크롤링·주기 갱신: 운영 경로에서 제거
