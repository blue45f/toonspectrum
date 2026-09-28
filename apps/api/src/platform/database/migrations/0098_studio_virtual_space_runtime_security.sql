-- 가상공간의 개인정보와 private object 경로를 공개 Data API에서 분리한다.
-- 런타임 역할의 최소 DML과 명시적 RLS 정책은 승인된 migration runner가 부여한다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = pg_catalog, public;

ALTER TABLE public.studio_virtual_space_decoration_layout ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_virtual_space_custom_furniture ENABLE ROW LEVEL SECURITY;

DO $security$
DECLARE relation_name text; role_name text; columns text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['studio_virtual_space_decoration_layout', 'studio_virtual_space_custom_furniture'] LOOP
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO columns
      FROM pg_catalog.pg_attribute
      WHERE attrelid = format('public.%I', relation_name)::regclass AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', relation_name);
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC', columns, relation_name);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', relation_name, role_name);
        EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM %I', columns, relation_name, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $security$;
COMMIT;
