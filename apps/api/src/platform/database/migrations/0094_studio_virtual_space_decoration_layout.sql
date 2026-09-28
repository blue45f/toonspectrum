-- 가상 스튜디오 가구 배치의 서버 정본을 추가한다.
-- (userId, districtKey) 한 행이 한 유저의 한 장소 배치를 뜻한다.
-- revision은 낙관적 동시성 토큰이라 다른 테이블과 공유하지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = pg_catalog, public;

CREATE TABLE IF NOT EXISTS public.studio_virtual_space_decoration_layout (
  "userId" text NOT NULL,
  "districtKey" text NOT NULL,
  "presetKey" text DEFAULT 'minimal' NOT NULL,
  "presentationMode" text DEFAULT 'minimal' NOT NULL,
  "placements" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "layoutWidth" integer DEFAULT 1280 NOT NULL,
  "layoutHeight" integer DEFAULT 960 NOT NULL,
  "updatedAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT studio_virtual_space_decoration_layout_pkey PRIMARY KEY ("userId", "districtKey"),
  CONSTRAINT studio_virtual_space_decoration_layout_revision_non_negative CHECK ("revision" >= 0),
  CONSTRAINT studio_virtual_space_decoration_layout_placements_capped CHECK (jsonb_array_length("placements") <= 36),
  CONSTRAINT studio_virtual_space_decoration_layout_world_positive CHECK ("layoutWidth" > 0 AND "layoutHeight" > 0)
);

CREATE INDEX IF NOT EXISTS studio_virtual_space_decoration_layout_user_idx
  ON public.studio_virtual_space_decoration_layout USING btree ("userId");

-- 계정이 사라진 유저의 배치는 읽을 사람이 없다. 행이 남지 않게 함께 정리한다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'studio_virtual_space_decoration_layout_user_fkey'
  ) THEN
    ALTER TABLE public.studio_virtual_space_decoration_layout
      DROP CONSTRAINT studio_virtual_space_decoration_layout_user_fkey;
  END IF;
END
$$;

ALTER TABLE public.studio_virtual_space_decoration_layout
  ADD CONSTRAINT studio_virtual_space_decoration_layout_user_fkey
  FOREIGN KEY ("userId") REFERENCES public."user"("id") ON DELETE CASCADE;

COMMIT;
