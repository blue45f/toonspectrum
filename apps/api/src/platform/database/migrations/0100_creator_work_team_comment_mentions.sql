-- CT-3: 팀 댓글 mentions 종단 확장. 지금까지 팀 댓글 계약(v1)이 mentions를 싣지 못해
-- 로컬 모델에만 존재했고, 클라이언트가 읽기 시점에 본문 @이름 도출로 우회했다.
-- 메시지에 생성 시점 멘션 스냅샷({userId|null, name})을 JSONB로 저장해 DTO·서비스·
-- 투영까지 종단으로 흐르게 한다. 멘션은 사용자 테이블과 조인하지 않는 스냅샷이라
-- 이름 변경·탈퇴가 과거 댓글의 표기를 바꾸지 않는다 (로컬 v1 모델과 같은 의미).
-- 기존 행은 기본값 '[]'로 채워지며, 구 클라이언트는 mentions를 보내지 않아도 된다.
--
-- 교정 (2026-10-03): 초안의 CHECK는 jsonb_array_elements 서브쿼리 형태였으나
-- Postgres CHECK 제약은 서브쿼리를 허용하지 않아(오류 0A000) 실제 DB에 한 번도
-- 적용될 수 없었다. 적용 이력이 없고 체크섬 고정 대상도 아니므로, 같은 구조 규칙을
-- 강제하는 jsonpath 등가형으로 본문에서 바로잡는다. 이름·userId 길이(1~160)와
-- 이름 공백 규칙은 jsonpath로 표현할 수 없어 DTO 검증 계층이 강제한다.

BEGIN;

ALTER TABLE "creator_work_team_comment_message"
  ADD COLUMN IF NOT EXISTS "mentions" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "creator_work_team_comment_message"
  DROP CONSTRAINT IF EXISTS "creator_work_team_comment_message_mentions_check";

ALTER TABLE "creator_work_team_comment_message"
  ADD CONSTRAINT "creator_work_team_comment_message_mentions_check"
  CHECK (
    jsonb_typeof("mentions") = 'array'
    AND jsonb_array_length("mentions") <= 20
    AND NOT jsonb_path_exists("mentions", '$[*] ? (@.type() != "object")')
    AND NOT jsonb_path_exists("mentions", '$[*].keyvalue() ? (@.key != "userId" && @.key != "name")')
    AND NOT jsonb_path_exists("mentions", '$[*] ? (!exists(@.userId) || !exists(@.name))')
    AND NOT jsonb_path_exists("mentions", '$[*] ? (@.name.type() != "string")')
    AND NOT jsonb_path_exists("mentions", '$[*] ? (@.userId.type() != "null" && @.userId.type() != "string")')
  );

COMMIT;
