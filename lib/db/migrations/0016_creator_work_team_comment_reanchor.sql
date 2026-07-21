-- Retry-safe, sequence-fenced canvas comment re-anchoring. A re-anchor creates activity but no
-- message, so mutation receipts must allow a nullable messageId while remaining thread-scoped.

BEGIN;

ALTER TABLE "creator_work_team_comment_activity"
  DROP CONSTRAINT IF EXISTS "creator_work_team_comment_activity_action_check";

ALTER TABLE "creator_work_team_comment_activity"
  ADD CONSTRAINT "creator_work_team_comment_activity_action_check"
  CHECK ("action" IN ('thread_created', 'reply_added', 'resolved', 'reopened', 'reanchored'));

ALTER TABLE "creator_work_team_comment_activity"
  DROP CONSTRAINT IF EXISTS "creator_work_team_comment_activity_message_state_check";

ALTER TABLE "creator_work_team_comment_activity"
  ADD CONSTRAINT "creator_work_team_comment_activity_message_state_check"
  CHECK (
    ("action" IN ('thread_created', 'reply_added') AND "messageId" IS NOT NULL)
    OR ("action" IN ('resolved', 'reopened', 'reanchored') AND "messageId" IS NULL)
  );

ALTER TABLE "creator_work_team_comment_mutation"
  ALTER COLUMN "messageId" DROP NOT NULL;

ALTER TABLE "creator_work_team_comment_mutation"
  DROP CONSTRAINT IF EXISTS "creator_work_team_comment_mutation_operation_check";

ALTER TABLE "creator_work_team_comment_mutation"
  ADD CONSTRAINT "creator_work_team_comment_mutation_operation_check"
  CHECK ("operation" IN ('thread_create', 'reply_add', 'thread_reanchor'));

ALTER TABLE "creator_work_team_comment_mutation"
  DROP CONSTRAINT IF EXISTS "creator_work_team_comment_mutation_message_state_check";

ALTER TABLE "creator_work_team_comment_mutation"
  ADD CONSTRAINT "creator_work_team_comment_mutation_message_state_check"
  CHECK (
    ("operation" IN ('thread_create', 'reply_add') AND "messageId" IS NOT NULL)
    OR ("operation" = 'thread_reanchor' AND "messageId" IS NULL)
  );

COMMIT;
