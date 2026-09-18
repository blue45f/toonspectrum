BEGIN;

ALTER TABLE public."user"
  ADD COLUMN IF NOT EXISTS "regionSettings" jsonb;

COMMENT ON COLUMN public."user"."regionSettings" IS
  'Versioned country, language, currency and time-zone preferences for the canonical user.';

COMMIT;
