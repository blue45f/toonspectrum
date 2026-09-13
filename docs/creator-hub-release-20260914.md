# ToonStudio 창작자 허브 통합 · 2026-09-14

## 구현 범위와 출처

이전 미병합 협업·홍보 구현을 최신 main 기준의 별도 worktree로 통합했다. 원본 worktree와 사용자의 시장/스튜디오 미저장 작업은 수정하지 않았다. 전 세계 사이트를 전수 조사한 것이 아니라 대표 서비스의 공개 공식 자료에서 사용 흐름을 비교했다. 외부 게시물·이미지는 복제하지 않았다.

| 참고 서비스 | 적용한 패턴 | 공식 자료 |
| --- | --- | --- |
| GlobalComix Talent | 구인/구직 구분, 역할·보수, 포트폴리오와 지원 관리 | https://globalcomix.com/talent |
| VGen | 작업 샘플·요청서·작업 조건·접수 상태를 분리 | https://help.vgen.co/hc/en-us/articles/12728317172119-2-Add-a-service |
| Tapas Collaborations | 유료·수익배분·취미 협업을 구분한 모집 | https://forums.tapas.io/c/collaborations |
| Tapas Community | 독립 창작자와 신작 발견, 독자 피드백 | https://help.tapas.io/hc/en-us/articles/4409607638171-What-is-Tapas-Community |
| POSTYPE | 창작자 커뮤니티와 리퀘스트 접수·상태 관리 | https://about.postype.com/ 및 https://help.postype.com/hc/ko/articles/39170050663065-리퀘스트-신청받기 |
| WEBTOON CANVAS | 작가 프로필 중심의 작품 소개·업데이트·댓글 | https://webtooncanvas.zendesk.com/hc/en-us/articles/18556423002644-What-are-Creator-Profiles |
| 크몽 | 분야별 용역 탐색과 작업 조건·포트폴리오 비교 | https://kmong.com/ |

## 제품 구조

`/community`는 일반 커뮤니티, `/collaborate`는 팀원 모집·작업 의뢰·작업자 홍보, `/community/promote`는 작품·신작·트레일러·작업 과정·피드백 공간이다. 기존 커뮤니티 동선을 보존하며 메뉴와 양방향 이동을 연결했다.

협업은 역할·보수·근무 방식·상태 필터, 검색, 작성 예시, 내 공고/지원/저장 목록, 비공개 지원서, 작성자 지원 관리, 수정·마감·삭제 및 신고를 제공한다. 홍보는 장르·활동 단계·태그·검색, 상세·수정·보관, 표지 이미지, 작품 링크, 댓글·북마크·신고·운영자 검토를 제공한다.

이번 통합에서 홍보 작성 화면에 계정별 현재 탭 초안 저장을 추가했다. 새로고침 복구, 미완성 입력 보존, 게시 실패 시 유지, 성공 후 해당 계정의 초안만 정리한다. 게시 권한 동의는 저장·복구하지 않는다. 저장 불가 시 성공으로 표시하지 않는다. sessionStorage 기반이므로 다른 기기 동기화나 탭 종료 이후의 보존은 보장하지 않는다. 기존 글 수정 화면에는 신규 글 초안을 적용하지 않는다.

## 비용·안전 경계

원본 동영상 파일 업로드·자체 저장·트랜스코딩은 미구현이다. 홍보 영상은 YouTube/Shorts/공개 Vimeo 주소 등록이며 클릭 전 외부 플레이어를 로드하지 않는다. 표지는 브라우저 안에서 최대 640×800px, JPEG 128KB 이하로 변환한다. 새 유료 서비스·스토리지·API 키를 신청하지 않았다. 기존 DB와 배포 계정의 무료 한도를 무제한으로 보장하는 것은 아니다.

세션/CSRF, 소유권 및 수정 버전 충돌, 신고·비공개 처리를 기존 구조에 통합했다. 지원서의 연락처는 공개 목록에 노출하지 않는다. 지원 철회·공고 삭제 시 비공개 지원 내용을 정리한다. 운영 DB 마이그레이션은 실행하지 않았고, 결제·에스크로·계약 보증·성인 인증·자동 검열·팔로우 알림은 제공하지 않는다.

## 최초 제출 당시 검증 결과

Node 입력·URL·응답·라우트·CSP 계약 테스트 84개, Vitest 116개, Chromium 데스크톱·모바일 8개 통과. 웹/API TypeScript 검사 및 변경 소스 ESLint 검사 통과. 저장 실패·계정별 초안·게시 동의 초기화·공개 성공 후 정리 시나리오를 포함한다.

브라우저는 명시적 API fixture를 사용했다. 저장소 테스트는 mock DB 기반이다. 실제 운영 API E2E, PostgreSQL 0046/0047 마이그레이션 적용·재실행·동시성 검증, 전체 production build 및 GitHub CI 통과, 실제 영상 제공자 재생은 아직 완료로 간주하지 않는다. Vite에서 기존 public i18n import 경고가 관찰되었다. 운영 DB 변경·main 병합·배포를 완료했다는 기록이 아니다.

## PR #1405 마무리 검증 · 2026-09-14

최신 main을 별도 worktree에 충돌 없이 통합하고, 기존 작업 디렉터리와 미저장 변경은 수정하지 않았다.

- 웹 production build (`pnpm run build`) 통과: TypeScript, Vite 번들, 서비스 워커 생성, 배포 CSP 검증 포함.
- API production build (`pnpm --filter @webtoon-nest/api run build`) 통과: TypeScript 및 API runtime import/정책 검증 포함.
- Node 계약 테스트 84개, 기존 Vitest 회귀 테스트 116개 통과.
- Chromium 데스크톱·모바일 E2E 8개 통과. 모바일에서 숨겨진 헤더 텍스트를 선택하던 테스트를 실제 작성 화면의 `로그인 / 회원가입` 링크 검증으로 수정했다. 로그인 제한 자체를 제거하거나 검사를 생략하지 않았다.
- PostgreSQL 18.4 격리 인스턴스에서 신규 통합 테스트 14개 통과. 0046/0047 추가 전용 마이그레이션 적용·재실행·데이터 보존, 작성자/지원자/제3자/운영자 권한, 지원 철회·공고 삭제 개인정보 정리, 동시 수정 충돌, 중복 지원, 실제 row-lock 대기 중 마감, 동시 등록 한도, 홍보 검색·댓글·보관·운영 처리를 확인했다.
- 신규 테스트와 변경 E2E ESLint, API TypeScript 검사 통과.

DB 통합 테스트는 명시적 `NODE_ENV=test`, `CREATOR_HUB_POSTGRES_INTEGRATION=1`, `TEST_DATABASE_URL`을 요구한다. literal loopback 주소, 자격증명, 전용 DB명 `toonspectrum_creator_hub_test`만 허용하고 임의 connection override를 거부한다. 매 실행 무작위 스키마에 합성 계정을 생성하고 해당 스키마만 정리한다. 서비스/저장소의 DB 의존성만 연결하며 SQL·Drizzle·transaction·lock은 실제 PostgreSQL에서 실행한다. 운영 DB, 기존 사용자 데이터 및 기존 Docker 서비스는 변경하지 않았다. 임시 DB는 검증 후 종료했다.

재실행 예시(별도 로컬 PostgreSQL 필요):

```sh
NODE_ENV=test CREATOR_HUB_POSTGRES_INTEGRATION=1 \
TEST_DATABASE_URL='postgresql://creator_hub_test:creator_hub_test@127.0.0.1:5432/toonspectrum_creator_hub_test' \
pnpm exec vitest run --no-file-parallelism apps/api/src/modules/collaboration/creator-hub.postgres.integration.test.ts
```

`Creator hub validation` 워크플로에 같은 통합 테스트와 PostgreSQL 18 service를 연결했다. 위 결과는 직접 실행한 로컬 검증이며 GitHub Actions의 원격 실행 상태와 구분한다.

### 운영 검증 경계

실제 운영 API를 이용한 계정 로그인부터의 E2E, 운영 DB migration 적용, 외부 YouTube/Vimeo 실제 재생 및 운영 배포는 이 마무리 검증에서 실행하지 않았다. 브라우저 E2E는 계속 명시적 API fixture를 사용하며, 실제 PostgreSQL 서비스 검증과 구분한다. 기존 public i18n import 경고 및 three-vrm/three WebGPU `tslFn` export 경고가 관찰됐지만 production build는 성공했다. 해당 스튜디오 의존성 변경은 본 PR 범위에 포함하지 않았다.
