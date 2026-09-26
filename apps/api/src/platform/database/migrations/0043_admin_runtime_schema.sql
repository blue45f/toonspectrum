-- Provision the legacy administrator contract through managed deployment, never API runtime DDL.
BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id text PRIMARY KEY,
  "adminId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "adminEmail" text,
  action text NOT NULL,
  "targetType" text NOT NULL DEFAULT 'system',
  "targetId" text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_createdat ON public.admin_audit_logs("createdAt");
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON public.admin_audit_logs(action);
CREATE TABLE IF NOT EXISTS public.admin_banned_words (
  id text PRIMARY KEY,
  word text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'general',
  "createdBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.admin_promos (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  "discountType" text NOT NULL DEFAULT 'percent',
  "discountValue" integer NOT NULL DEFAULT 10,
  "maxUses" integer NOT NULL DEFAULT 100,
  "usedCount" integer NOT NULL DEFAULT 0,
  "isActive" boolean NOT NULL DEFAULT true,
  "expiresAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.admin_announcements (
  id text PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT 'info',
  placement text NOT NULL DEFAULT 'top_banner',
  "targetRole" text NOT NULL DEFAULT 'all',
  "isActive" boolean NOT NULL DEFAULT true,
  "startsAt" timestamp,
  "endsAt" timestamp,
  "createdBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_announcements_active ON public.admin_announcements("isActive");
CREATE TABLE IF NOT EXISTS public.admin_security_policies (
  id text PRIMARY KEY,
  "ipAddress" text NOT NULL UNIQUE,
  reason text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT 'block',
  "createdBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.admin_content_reports (
  id text PRIMARY KEY,
  "reporterId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "targetType" text NOT NULL,
  "targetId" text NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  "resolvedBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "resolvedAt" timestamp,
  "resolutionNote" text DEFAULT '',
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_reports_status ON public.admin_content_reports(status);

ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS "reviewedBy" text REFERENCES public."user"(id) ON DELETE SET NULL;
ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS "reviewedAt" timestamp;
ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS "reviewNote" text DEFAULT '';
ALTER TABLE public.revenue_ledger ADD COLUMN IF NOT EXISTS "settledAt" timestamp;
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_createdat ON public.revenue_ledger ("createdAt");
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_status_createdat ON public.revenue_ledger ("status", "createdAt");
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_reviewedat ON public.revenue_ledger ("reviewedAt");
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_settledat ON public.revenue_ledger ("settledAt");

DO $admin_schema_contract$
BEGIN
  IF NOT (NOT EXISTS (
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
)) OR NOT (NOT EXISTS (
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
)) THEN
    RAISE EXCEPTION 'managed administrator schema is incomplete or incompatible';
  END IF;
END
$admin_schema_contract$;

INSERT INTO public."toonspectrum_schema_migration" ("id", "appliedAt")
VALUES ('0043_admin_runtime_schema', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
