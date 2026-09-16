BEGIN;

SELECT pg_advisory_xact_lock(530058);

CREATE TABLE IF NOT EXISTS public."member_message_thread" (
  "id" text PRIMARY KEY,
  "dmKey" text NOT NULL,
  "memberAId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "memberBId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "createdBy" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "requestRecipientId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "state" text NOT NULL DEFAULT 'pending',
  "requestCategory" text NOT NULL DEFAULT 'general',
  "contextType" text NOT NULL DEFAULT 'profile',
  "contextId" text,
  "contextLabel" text NOT NULL DEFAULT '',
  "lastMessageAt" timestamptz NOT NULL DEFAULT now(),
  "acceptedAt" timestamptz,
  "declinedAt" timestamptz,
  "closedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "member_message_thread_dm_key_unique" UNIQUE ("dmKey"),
  CONSTRAINT "member_message_thread_pair_unique" UNIQUE ("memberAId", "memberBId"),
  CONSTRAINT "member_message_thread_dm_key_check" CHECK ("dmKey" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "member_message_thread_pair_order_check" CHECK ("memberAId" < "memberBId"),
  CONSTRAINT "member_message_thread_actor_check" CHECK (
    "createdBy" IN ("memberAId", "memberBId")
    AND "requestRecipientId" IN ("memberAId", "memberBId")
    AND "createdBy" <> "requestRecipientId"
  ),
  CONSTRAINT "member_message_thread_state_check" CHECK ("state" IN ('pending', 'active', 'declined', 'closed')),
  CONSTRAINT "member_message_thread_category_check" CHECK ("requestCategory" IN ('feedback', 'collaboration', 'business', 'general')),
  CONSTRAINT "member_message_thread_context_type_check" CHECK ("contextType" IN ('profile', 'work', 'project', 'general')),
  CONSTRAINT "member_message_thread_context_check" CHECK (
    "contextType" IN ('profile', 'general')
    OR ("contextId" IS NOT NULL AND length("contextId") BETWEEN 1 AND 160)
  ),
  CONSTRAINT "member_message_thread_context_label_check" CHECK (length("contextLabel") <= 160),
  CONSTRAINT "member_message_thread_timestamp_check" CHECK (
    "updatedAt" >= "createdAt" AND "lastMessageAt" >= "createdAt"
  )
);

CREATE TABLE IF NOT EXISTS public."member_message_participant" (
  "threadId" text NOT NULL REFERENCES public."member_message_thread"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "lastReadMessageId" text,
  "lastReadAt" timestamptz,
  "archivedAt" timestamptz,
  "mutedUntil" timestamptz,
  "joinedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("threadId", "userId")
);

CREATE TABLE IF NOT EXISTS public."member_message" (
  "id" text PRIMARY KEY,
  "threadId" text NOT NULL REFERENCES public."member_message_thread"("id") ON DELETE CASCADE,
  "senderId" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "type" text NOT NULL DEFAULT 'text',
  "body" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz,
  CONSTRAINT "member_message_thread_id_unique" UNIQUE ("threadId", "id"),
  CONSTRAINT "member_message_type_check" CHECK ("type" IN ('text', 'work_card', 'project_card', 'system')),
  CONSTRAINT "member_message_body_check" CHECK (length("body") BETWEEN 1 AND 2000 AND "body" = btrim("body")),
  CONSTRAINT "member_message_metadata_check" CHECK (jsonb_typeof("metadata") = 'object')
);

CREATE TABLE IF NOT EXISTS public."member_message_block" (
  "blockerId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "blockedUserId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("blockerId", "blockedUserId"),
  CONSTRAINT "member_message_block_self_check" CHECK ("blockerId" <> "blockedUserId")
);

CREATE TABLE IF NOT EXISTS public."member_message_preference" (
  "userId" text PRIMARY KEY REFERENCES public."user"("id") ON DELETE CASCADE,
  "receiveFrom" text NOT NULL DEFAULT 'everyone',
  "emailNotification" boolean NOT NULL DEFAULT false,
  "readReceipt" boolean NOT NULL DEFAULT true,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "member_message_preference_receive_from_check" CHECK (
    "receiveFrom" IN ('everyone', 'followers', 'mutuals', 'nobody')
  )
);

CREATE TABLE IF NOT EXISTS public."member_message_report" (
  "id" text PRIMARY KEY,
  "reporterId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "reportedUserId" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "messageId" text NOT NULL REFERENCES public."member_message"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "details" text NOT NULL DEFAULT '',
  "resolutionNote" text NOT NULL DEFAULT '',
  "evidenceSnapshot" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "reviewedAt" timestamptz,
  "reviewedBy" text REFERENCES public."user"("id") ON DELETE SET NULL,
  CONSTRAINT "member_message_report_reporter_message_unique" UNIQUE ("reporterId", "messageId"),
  CONSTRAINT "member_message_report_reason_check" CHECK (
    "reason" IN ('harassment', 'spam', 'scam', 'sexual', 'threat', 'copyright', 'other')
  ),
  CONSTRAINT "member_message_report_details_check" CHECK (length("details") <= 1000),
  CONSTRAINT "member_message_report_resolution_note_check" CHECK (length("resolutionNote") <= 500),
  CONSTRAINT "member_message_report_evidence_check" CHECK (jsonb_typeof("evidenceSnapshot") = 'object'),
  CONSTRAINT "member_message_report_status_check" CHECK ("status" IN ('open', 'reviewing', 'resolved', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS "idx_member_message_thread_recipient_state"
  ON public."member_message_thread" ("requestRecipientId", "state", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_member_message_thread_created_by_created"
  ON public."member_message_thread" ("createdBy", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_member_message_thread_last_message"
  ON public."member_message_thread" ("lastMessageAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_member_message_participant_user_archive"
  ON public."member_message_participant" ("userId", "archivedAt", "threadId");
CREATE INDEX IF NOT EXISTS "idx_member_message_participant_user_read"
  ON public."member_message_participant" ("userId", "lastReadAt");
CREATE INDEX IF NOT EXISTS "idx_member_message_thread_created"
  ON public."member_message" ("threadId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_member_message_sender_created"
  ON public."member_message" ("senderId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_member_message_block_target"
  ON public."member_message_block" ("blockedUserId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_member_message_report_status_created"
  ON public."member_message_report" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_member_message_report_reported_user"
  ON public."member_message_report" ("reportedUserId", "createdAt" DESC);

REVOKE ALL ON TABLE public."member_message_thread" FROM PUBLIC;
REVOKE ALL ON TABLE public."member_message_participant" FROM PUBLIC;
REVOKE ALL ON TABLE public."member_message" FROM PUBLIC;
REVOKE ALL ON TABLE public."member_message_block" FROM PUBLIC;
REVOKE ALL ON TABLE public."member_message_preference" FROM PUBLIC;
REVOKE ALL ON TABLE public."member_message_report" FROM PUBLIC;

DO $migration$
BEGIN
  IF to_regclass('public.member_message_thread') IS NULL
    OR to_regclass('public.member_message_participant') IS NULL
    OR to_regclass('public.member_message') IS NULL
    OR to_regclass('public.member_message_block') IS NULL
    OR to_regclass('public.member_message_preference') IS NULL
    OR to_regclass('public.member_message_report') IS NULL THEN
    RAISE EXCEPTION 'member messaging relations are incomplete';
  END IF;
END
$migration$;

INSERT INTO public."toonspectrum_schema_migration" ("id", "appliedAt")
VALUES ('0059_member_messaging', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
