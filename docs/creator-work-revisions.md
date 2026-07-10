# Creator work revision 저장 계약

## 목적

`creator_work.revision`은 작품 편집 저장의 낙관적 동시성 토큰이다. 작품을 만들면 `1`로 시작하고,
성공한 수정·복원마다 같은 PostgreSQL transaction 안에서 정확히 `1` 증가한다. 같은 transaction이
`creator_work_revision`에 수정 후 전체 콘텐츠 snapshot을 쓰지 못하면 작품 수정도 rollback된다.

Snapshot에는 제목·설명·표지·태그·렌더 페이지·편집 문서·게시 상태·시리즈/챌린지/리믹스 연결만
포함한다. 작성자 계정, 조회수·좋아요·댓글, 관리자 `hidden` 상태는 복원 대상이 아니며 snapshot에도
넣지 않는다.

## 낙관적 저장과 하위 호환

- 새 Studio 편집 경로는 작품을 소유자 권한으로 불러올 때 받은 `revision`을 PATCH body의
  `baseRevision`으로 보낸다.
- 서버의 현재 revision과 다르면 변경을 쓰거나 snapshot을 만들지 않고 HTTP `409`를 반환한다.
- 충돌 응답은 다음의 비밀정보 없는 필드만 제공한다.

  ```json
  {
    "code": "creator_work_revision_conflict",
    "message": "다른 저장이 먼저 반영되었습니다. 작품을 다시 불러온 뒤 변경 내용을 확인해 주세요.",
    "currentRevision": 8
  }
  ```

- 이전 배포판과 외부 호출의 호환을 위해 `baseRevision`을 생략한 PATCH는 당분간 기존
  last-write-wins 정책으로 허용한다. 이 경우에도 서버는 revision을 증가시키고 snapshot을 남긴다.
- 생략 호환은 안전 보장이 아니라 migration window다. 새 편집 UI는 생략하지 않아야 한다.

## Owner-only 버전 API

- `GET /api/creator/works/:id/revisions?limit=20`: 최신순 metadata 목록
- `GET /api/creator/works/:id/revisions/:revision`: 해당 전체 snapshot
- `POST /api/creator/works/:id/revisions/:revision/restore`: `{ "baseRevision": n }`과 일치할 때 복원

세 API 모두 로그인한 현재 소유자만 접근할 수 있다. 작품 없음, snapshot 없음, 타인 작품은 외부에서
구분할 수 없도록 같은 `404`로 투영한다. 공개 작품 상세·목록에는 revision과 snapshot을 노출하지 않는다.

## 보존·정리 정책

- 서버 상한은 작품당 최신 `20`개 snapshot이다.
- 새 수정·복원의 snapshot을 넣은 직후, 같은 transaction에서 `현재 revision - 20` 이하를 삭제한다.
- 따라서 성공 응답 시점에는 최신 snapshot을 포함해 최대 20개만 남고, 중간 실패로 작품과 이력이
  어긋나지 않는다.
- 작품 삭제 시 FK `ON DELETE CASCADE`로 snapshot도 삭제된다.
- `(workId, revision)` 복합 primary key가 owner 목록의 최신순 역방향 scan과 cascade lookup을 담당한다.

현재 snapshot은 기존 data URL·JSONB 문서 전체를 포함하므로 보존 수를 무제한으로 늘리지 않는다.
향후 object storage/content-addressed asset 구조로 이전한 뒤에는 snapshot이 asset hash만 참조하도록
스키마 버전을 올릴 수 있다.
