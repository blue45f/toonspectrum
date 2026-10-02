-- CT-3: 팀 댓글 mentions 종단 확장. 지금까지 팀 댓글 계약(v1)이 mentions를 싣지 못해
-- 로컬 모델에만 존재했고, 클라이언트가 읽기 시점에 본문 @이름 도출로 우회했다.
-- 메시지에 생성 시점 멘션 스냅샷({userId|null, name})을 JSONB로 저장해 DTO·서비스·
-- 투영까지 종단으로 흐르게 한다. 멘션은 사용자 테이블과 조인하지 않는 스냅샷이라
-- 이름 변경·탈퇴가 과거 댓글의 표기를 바꾸지 않는다 (로컬 v1 모델과 같은 의미).
-- 기존 행은 기본값 '[]'로 채워지며, 구 클라이언트는 mentions를 보내지 않아도 된다.

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
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements("mentions") AS mention
      WHERE jsonb_typeof(mention) <> 'object'
        OR (mention - ARRAY['userId', 'name']) <> '{}'::jsonb
        OR jsonb_typeof(mention -> 'name') <> 'string'
        OR length(mention ->> 'name') NOT BETWEEN 1 AND 160
        OR mention ->> 'name' <> btrim(mention ->> 'name')
        OR NOT (mention ? 'userId')
        OR (
          jsonb_typeof(mention -> 'userId') <> 'null'
          AND (
            jsonb_typeof(mention -> 'userId') <> 'string'
            OR length(mention ->> 'userId') NOT BETWEEN 1 AND 160
          )
        )
    )
  );

COMMIT;
