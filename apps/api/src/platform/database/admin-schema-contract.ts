/** Read-only managed administrator schema checks; no runtime DDL. */
export const ADMIN_SCHEMA_COLUMNS_SQL = `NOT EXISTS (
  SELECT 1 FROM (VALUES
    ('admin_audit_logs', 'id', 'text', true),
    ('admin_audit_logs', 'adminId', 'text', true),
    ('admin_audit_logs', 'adminEmail', 'text', false),
    ('admin_audit_logs', 'action', 'text', true),
    ('admin_audit_logs', 'targetType', 'text', true),
    ('admin_audit_logs', 'targetId', 'text', false),
    ('admin_audit_logs', 'details', 'jsonb', true),
    ('admin_audit_logs', 'createdAt', 'timestamp without time zone', true),
    ('admin_banned_words', 'id', 'text', true),
    ('admin_banned_words', 'word', 'text', true),
    ('admin_banned_words', 'category', 'text', true),
    ('admin_banned_words', 'createdBy', 'text', false),
    ('admin_banned_words', 'createdAt', 'timestamp without time zone', true),
    ('admin_promos', 'id', 'text', true),
    ('admin_promos', 'code', 'text', true),
    ('admin_promos', 'discountType', 'text', true),
    ('admin_promos', 'discountValue', 'integer', true),
    ('admin_promos', 'maxUses', 'integer', true),
    ('admin_promos', 'usedCount', 'integer', true),
    ('admin_promos', 'isActive', 'boolean', true),
    ('admin_promos', 'expiresAt', 'timestamp without time zone', false),
    ('admin_promos', 'createdAt', 'timestamp without time zone', true),
    ('admin_announcements', 'id', 'text', true),
    ('admin_announcements', 'title', 'text', true),
    ('admin_announcements', 'content', 'text', true),
    ('admin_announcements', 'level', 'text', true),
    ('admin_announcements', 'placement', 'text', true),
    ('admin_announcements', 'targetRole', 'text', true),
    ('admin_announcements', 'isActive', 'boolean', true),
    ('admin_announcements', 'startsAt', 'timestamp without time zone', false),
    ('admin_announcements', 'endsAt', 'timestamp without time zone', false),
    ('admin_announcements', 'createdBy', 'text', false),
    ('admin_announcements', 'createdAt', 'timestamp without time zone', true),
    ('admin_security_policies', 'id', 'text', true),
    ('admin_security_policies', 'ipAddress', 'text', true),
    ('admin_security_policies', 'reason', 'text', true),
    ('admin_security_policies', 'action', 'text', true),
    ('admin_security_policies', 'createdBy', 'text', false),
    ('admin_security_policies', 'createdAt', 'timestamp without time zone', true),
    ('admin_content_reports', 'id', 'text', true),
    ('admin_content_reports', 'reporterId', 'text', true),
    ('admin_content_reports', 'targetType', 'text', true),
    ('admin_content_reports', 'targetId', 'text', true),
    ('admin_content_reports', 'reason', 'text', true),
    ('admin_content_reports', 'status', 'text', true),
    ('admin_content_reports', 'resolvedBy', 'text', false),
    ('admin_content_reports', 'resolvedAt', 'timestamp without time zone', false),
    ('admin_content_reports', 'resolutionNote', 'text', false),
    ('admin_content_reports', 'createdAt', 'timestamp without time zone', true),
    ('revenue_ledger', 'reviewedBy', 'text', false),
    ('revenue_ledger', 'reviewedAt', 'timestamp without time zone', false),
    ('revenue_ledger', 'reviewNote', 'text', false),
    ('revenue_ledger', 'settledAt', 'timestamp without time zone', false)
  ) AS expected(table_name, column_name, column_type, not_null)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = to_regclass('public.' || expected.table_name)
      AND attribute.attname = expected.column_name
      AND pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = expected.column_type
      AND attribute.attnotnull = expected.not_null
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
  )
)`;

export const ADMIN_SCHEMA_INDEXES_SQL = `NOT EXISTS (
  SELECT 1 FROM (VALUES
    ('idx_admin_audit_logs_createdat', 'admin_audit_logs', ARRAY['createdAt']::text[]),
    ('idx_admin_audit_logs_action', 'admin_audit_logs', ARRAY['action']::text[]),
    ('idx_admin_announcements_active', 'admin_announcements', ARRAY['isActive']::text[]),
    ('idx_admin_reports_status', 'admin_content_reports', ARRAY['status']::text[]),
    ('idx_revenue_ledger_createdat', 'revenue_ledger', ARRAY['createdAt']::text[]),
    ('idx_revenue_ledger_status_createdat', 'revenue_ledger', ARRAY['status', 'createdAt']::text[]),
    ('idx_revenue_ledger_reviewedat', 'revenue_ledger', ARRAY['reviewedAt']::text[]),
    ('idx_revenue_ledger_settledat', 'revenue_ledger', ARRAY['settledAt']::text[])
  ) AS expected(index_name, table_name, columns)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index AS state
    JOIN pg_catalog.pg_class AS index_record ON index_record.oid = state.indexrelid
    WHERE state.indrelid = to_regclass('public.' || expected.table_name)
      AND index_record.relnamespace = to_regnamespace('public')
      AND index_record.relname = expected.index_name
      AND state.indisvalid AND state.indisready AND state.indislive
      AND NOT state.indisunique AND NOT state.indisprimary AND NOT state.indisexclusion
      AND state.indpred IS NULL AND state.indexprs IS NULL
      AND state.indnatts = state.indnkeyatts
      AND ARRAY(SELECT attribute.attname::text
        FROM unnest(state.indkey) WITH ORDINALITY AS key(attnum, position)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = state.indrelid AND attribute.attnum = key.attnum
        ORDER BY key.position) = expected.columns
  )
)`;
