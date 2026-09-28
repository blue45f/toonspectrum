-- migration: 관리자 전용 테스트 계정 구분. 공개 프로필/인증 역할은 변경하지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public.admin_member_test_accounts (
  "userId" text PRIMARY KEY REFERENCES public."user"("id") ON DELETE CASCADE,
  "isTestAccount" boolean NOT NULL DEFAULT false,
  "reason" text NOT NULL CHECK (length(btrim("reason")) BETWEEN 1 AND 300),
  "updatedBy" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_member_test_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_member_test_accounts FROM PUBLIC;
-- 브라우저 Data API 역할은 내부 품질 구분을 조회하거나 변경할 수 없다.
DO $migration$
DECLARE browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      EXECUTE format('REVOKE ALL ON public.admin_member_test_accounts FROM %I', browser_role);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'toonspectrum_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON public.admin_member_test_accounts TO toonspectrum_runtime;
    DROP POLICY IF EXISTS admin_member_test_accounts_runtime ON public.admin_member_test_accounts;
    CREATE POLICY admin_member_test_accounts_runtime ON public.admin_member_test_accounts
      TO toonspectrum_runtime USING (true) WITH CHECK (true);
  END IF;
END;
$migration$;
COMMIT;
-- 복구: 이전 API/Web으로 롤백해도 이 테이블은 남겨 감사 추적을 보존한다.
-- 영구 제거는 별도 승인과 백업 후 DROP TABLE public.admin_member_test_accounts;
