-- 배치 행의 키를 (userId, districtKey)에서 (userId, scopeKey)로 옮긴다.
-- 같은 district라도 프로젝트와 개인/공유 모드가 다르면 다른 배치다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = pg_catalog, public;

ALTER TABLE public.studio_virtual_space_decoration_layout
  ADD COLUMN IF NOT EXISTS "scopeKey" text;

-- 기존 행은 districtKey를 범위 키로 승격시켜 잃지 않는다. 배포 초기에는
-- (projectId, worldScope, authoringMode) 조합이 아직 없으므로 districtKey가 유일한
-- 범위 구분자였다.
UPDATE public.studio_virtual_space_decoration_layout
  SET "scopeKey" = "districtKey"
  WHERE "scopeKey" IS NULL;

ALTER TABLE public.studio_virtual_space_decoration_layout
  ALTER COLUMN "scopeKey" SET NOT NULL;

ALTER TABLE public.studio_virtual_space_decoration_layout
  ADD CONSTRAINT studio_virtual_space_decoration_layout_scope_key_capped
  CHECK (char_length("scopeKey") <= 240);

ALTER TABLE public.studio_virtual_space_decoration_layout
  DROP CONSTRAINT IF EXISTS studio_virtual_space_decoration_layout_pkey;

ALTER TABLE public.studio_virtual_space_decoration_layout
  ADD CONSTRAINT studio_virtual_space_decoration_layout_pkey PRIMARY KEY ("userId", "scopeKey");

COMMIT;
