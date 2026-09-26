BEGIN;

UPDATE public.creator_series
SET status = 'ongoing'
WHERE status NOT IN ('ongoing', 'hiatus', 'completed')
   OR status IS NULL;

ALTER TABLE public.creator_series
  DROP CONSTRAINT IF EXISTS creator_series_status_check;

ALTER TABLE public.creator_series
  ADD CONSTRAINT creator_series_status_check
  CHECK (status IN ('ongoing', 'hiatus', 'completed'))
  NOT VALID;

ALTER TABLE public.creator_series
  VALIDATE CONSTRAINT creator_series_status_check;

COMMIT;
