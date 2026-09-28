-- 사용자가 직접 올린 가구 레지스트리. 바이트는 private object storage에 있다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = pg_catalog, public;

CREATE TABLE IF NOT EXISTS public.studio_virtual_space_custom_furniture (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "name" text NOT NULL,
  "mimeType" text NOT NULL,
  "objectPath" text NOT NULL,
  "digest" text NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "byteLength" integer NOT NULL DEFAULT 1,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT studio_virtual_space_custom_furniture_dimensions_positive
    CHECK ("width" > 0 AND "height" > 0 AND "byteLength" > 0)
);

CREATE INDEX IF NOT EXISTS studio_virtual_space_custom_furniture_user_idx
  ON public.studio_virtual_space_custom_furniture USING btree ("userId");

-- 계정이 사라지면 그 사람이 올린 가구도 읽을 사람이 없다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'studio_virtual_space_custom_furniture_user_fkey'
  ) THEN
    ALTER TABLE public.studio_virtual_space_custom_furniture
      DROP CONSTRAINT studio_virtual_space_custom_furniture_user_fkey;
  END IF;
END
$$;

ALTER TABLE public.studio_virtual_space_custom_furniture
  ADD CONSTRAINT studio_virtual_space_custom_furniture_user_fkey
  FOREIGN KEY ("userId") REFERENCES public."user"("id") ON DELETE CASCADE;

COMMIT;
