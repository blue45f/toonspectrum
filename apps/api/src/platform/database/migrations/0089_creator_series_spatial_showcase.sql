BEGIN;

ALTER TABLE public.creator_series
  ADD COLUMN IF NOT EXISTS "showcaseEnabled" boolean NOT NULL DEFAULT false;

COMMIT;
