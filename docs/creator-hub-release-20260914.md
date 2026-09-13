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

## 이번 실행의 검증 결과

Node 입력·URL·응답·라우트·CSP 계약 테스트 84개, Vitest 116개, Chromium 데스크톱·모바일 8개 통과. 웹/API TypeScript 검사 및 변경 소스 ESLint 검사 통과. 저장 실패·계정별 초안·게시 동의 초기화·공개 성공 후 정리 시나리오를 포함한다.

브라우저는 명시적 API fixture를 사용했다. 저장소 테스트는 mock DB 기반이다. 실제 운영 API E2E, PostgreSQL 0046/0047 마이그레이션 적용·재실행·동시성 검증, 전체 production build 및 GitHub CI 통과, 실제 영상 제공자 재생은 아직 완료로 간주하지 않는다. Vite에서 기존 public i18n import 경고가 관찰되었다. 운영 DB 변경·main 병합·배포를 완료했다는 기록이 아니다.
