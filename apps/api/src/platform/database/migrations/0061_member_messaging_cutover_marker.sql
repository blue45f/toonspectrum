-- Restore the durable runtime-readiness evidence omitted by migration 0059.
--
-- Migration 0059 is already part of the reviewed checksum ledger, so it remains immutable.
-- This forward migration verifies the installed messaging contract under write-blocking locks
-- before publishing the marker consumed by API health checks.

BEGIN;

DO $member_messaging_cutover_relations$
DECLARE
  missing_relations text[];
BEGIN
  SELECT array_agg(required_relation ORDER BY required_relation)
  INTO missing_relations
  FROM unnest(ARRAY[
    'member_message_thread',
    'member_message_participant',
    'member_message',
    'member_message_block',
    'member_message_preference',
    'member_message_report',
    'toonspectrum_schema_migration'
  ]::text[]) AS required_relation
  WHERE to_regclass(format('public.%I', required_relation)) IS NULL;

  IF missing_relations IS NOT NULL THEN
    RAISE EXCEPTION 'member messaging cutover relations are incomplete: %', missing_relations;
  END IF;
END
$member_messaging_cutover_relations$;

LOCK TABLE
  public."member_message_thread",
  public."member_message_participant",
  public."member_message",
  public."member_message_block",
  public."member_message_preference",
  public."member_message_report",
  public."toonspectrum_schema_migration"
  IN SHARE ROW EXCLUSIVE MODE;

DO $member_messaging_cutover_contract$
DECLARE
  missing_constraints text[];
  missing_foreign_keys text[];
  missing_indexes text[];
BEGIN
  SELECT array_agg(expected_constraint ORDER BY expected_constraint)
  INTO missing_constraints
  FROM unnest(ARRAY[
    'member_message_thread_pkey',
    'member_message_thread_dm_key_unique',
    'member_message_thread_pair_unique',
    'member_message_thread_dm_key_check',
    'member_message_thread_pair_order_check',
    'member_message_thread_actor_check',
    'member_message_thread_state_check',
    'member_message_thread_category_check',
    'member_message_thread_context_type_check',
    'member_message_thread_context_check',
    'member_message_thread_context_label_check',
    'member_message_thread_timestamp_check',
    'member_message_participant_threadId_userId_pk',
    'member_message_pkey',
    'member_message_thread_id_unique',
    'member_message_type_check',
    'member_message_body_check',
    'member_message_metadata_check',
    'member_message_block_blockerId_blockedUserId_pk',
    'member_message_block_self_check',
    'member_message_preference_pkey',
    'member_message_preference_receive_from_check',
    'member_message_report_pkey',
    'member_message_report_reporter_message_unique',
    'member_message_report_reason_check',
    'member_message_report_details_check',
    'member_message_report_resolution_note_check',
    'member_message_report_evidence_check',
    'member_message_report_status_check'
  ]::text[]) AS expected_constraint
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS actual_constraint
    JOIN pg_catalog.pg_namespace AS constraint_namespace
      ON constraint_namespace.oid = actual_constraint.connamespace
    WHERE constraint_namespace.nspname = 'public'
      AND actual_constraint.conname = expected_constraint
      AND actual_constraint.convalidated
  );

  IF missing_constraints IS NOT NULL THEN
    RAISE EXCEPTION 'member messaging constraints are incomplete: %', missing_constraints;
  END IF;

  SELECT array_agg(expected.table_name ORDER BY expected.table_name)
  INTO missing_foreign_keys
  FROM (VALUES
    ('member_message_thread', 4),
    ('member_message_participant', 2),
    ('member_message', 2),
    ('member_message_block', 2),
    ('member_message_preference', 1),
    ('member_message_report', 4)
  ) AS expected(table_name, required_count)
  WHERE (
    SELECT count(*)
    FROM pg_catalog.pg_constraint AS actual_constraint
    WHERE actual_constraint.conrelid = format('public.%I', expected.table_name)::regclass
      AND actual_constraint.contype = 'f'
      AND actual_constraint.convalidated
  ) < expected.required_count;

  IF missing_foreign_keys IS NOT NULL THEN
    RAISE EXCEPTION 'member messaging foreign keys are incomplete: %', missing_foreign_keys;
  END IF;

  SELECT array_agg(expected_index ORDER BY expected_index)
  INTO missing_indexes
  FROM unnest(ARRAY[
    'idx_member_message_thread_recipient_state',
    'idx_member_message_thread_created_by_created',
    'idx_member_message_thread_last_message',
    'idx_member_message_participant_user_archive',
    'idx_member_message_participant_user_read',
    'idx_member_message_thread_created',
    'idx_member_message_sender_created',
    'idx_member_message_block_target',
    'idx_member_message_report_status_created',
    'idx_member_message_report_reported_user'
  ]::text[]) AS expected_index
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS index_record
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_record.relnamespace
    JOIN pg_catalog.pg_index AS index_state
      ON index_state.indexrelid = index_record.oid
    WHERE index_namespace.nspname = 'public'
      AND index_record.relname = expected_index
      AND index_state.indisvalid
      AND index_state.indisready
      AND index_state.indislive
  );

  IF missing_indexes IS NOT NULL THEN
    RAISE EXCEPTION 'member messaging indexes are incomplete: %', missing_indexes;
  END IF;
END
$member_messaging_cutover_contract$;

REVOKE ALL ON TABLE public."member_message_thread" FROM PUBLIC;
REVOKE ALL ON TABLE public."member_message_participant" FROM PUBLIC;
REVOKE ALL ON TABLE public."member_message" FROM PUBLIC;
REVOKE ALL ON TABLE public."member_message_block" FROM PUBLIC;
REVOKE ALL ON TABLE public."member_message_preference" FROM PUBLIC;
REVOKE ALL ON TABLE public."member_message_report" FROM PUBLIC;

INSERT INTO public."toonspectrum_schema_migration" ("id", "appliedAt")
VALUES ('0059_member_messaging', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
