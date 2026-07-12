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

## Studio 복원 전 변경 검토

- 과거 revision 행은 복원을 즉시 실행하지 않고 먼저 `변경 검토`를 연다.
- 선택 revision과 현재 서버 baseline은 owner-only 비교 projection API로 병렬 조회한다. 전체 목록의
  snapshot을 미리 내려받지 않으며, 비교에 쓰지 않는 렌더 `cover/pages`는 응답에서 제외한다. 편집 문서의
  `data:`/`blob:` 리소스도 원문 대신 UTF-8 길이와 SHA-256으로 만든 결정적 식별자로 전송·비교한다.
- 현재 로컬 편집본→선택 revision은 실제 복원 영향, 현재 서버 baseline→현재 로컬 편집본은 저장되지 않은 로컬
  변경을 뜻한다. 저장 시각과 현재 보고 있던 페이지처럼 편집 의미가 아닌 값은 제외한다.
- 비교는 안정적인 page/element ID를 사용하고 별도 Web Worker에서 수행한다. 텍스트 원문, data URL, 3D
  문서, 비공개 AI prompt는 결과 descriptor에 복사하지 않는다. 전체 합계는 정확하게 유지하면서 화면에
  표시하는 세부 항목은 240개로 제한한다. 현재 Studio가 아직 모르는 미래 `doc` 확장도 base→target
  변경 여부를 키 단위로 표시하되, 확장 값은 descriptor에 복사하지 않아 복원 시 숨은 데이터 변경을
  0건으로 오인하지 않는다.
- 검토 뒤 로컬 편집본 generation 또는 서버 base revision이 달라지면 복원 버튼은 그대로 진행하지 않고
  새 비교를 요구한다. 409 충돌은 최신 공동 문서 baseline을 재조회해 같은 stale base 재시도 고리를 끊는다.
- 실제 POST 직전 현재 로컬 프로젝트를 `서버 rN 복원 전` 브라우저 checkpoint로 저장한다. checkpoint는
  Blob을 보존하는 IndexedDB를 기본으로 사용하고 기존 localStorage 지점을 마이그레이션한다. 내구 저장과
  안전한 JSON fallback이 모두 실패하면 서버 mutation을 호출하지 않는다.
- 복원 POST가 만든 정확한 revision과 후속 작품/공동 문서 revision이 모두 일치할 때만 로컬 편집기에
  적용한다. 복원 직후 다른 저장이 앞서가면 성공으로 오인하지 않고 편집을 잠근 뒤 재확인을 요구한다.
- 컷툰 편집기에서 upload-format 과거 버전은 차단한다. 공개→초안 및 타이틀·시리즈·챌린지·회차 연결
  변경은 확인 화면에 방향과 영향을 별도로 경고한다.
- 복원 확인은 브라우저 전역 `confirm()`이 아니라 revision·보존 동작·충돌 조건을 보여 주는 접근 가능한
  2단계 UI로 처리한다.

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
