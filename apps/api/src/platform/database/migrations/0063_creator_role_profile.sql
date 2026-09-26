-- Persist creator job preferences independently from project authorization roles.
-- Existing accounts receive a private-safe, empty v1 profile and can opt into
-- public role discovery from account settings.

BEGIN;

ALTER TABLE public."user"
  ADD COLUMN IF NOT EXISTS "creatorRoleProfile" jsonb;

UPDATE public."user"
SET "creatorRoleProfile" =
  '{"version":1,"primaryRole":null,"secondaryRoles":[],"specialties":[],"experienceLevel":null,"collaborationStatus":null,"roleVisibility":true,"activeRole":null}'::jsonb
WHERE "creatorRoleProfile" IS NULL;

ALTER TABLE public."user"
  ALTER COLUMN "creatorRoleProfile" SET DEFAULT
    '{"version":1,"primaryRole":null,"secondaryRoles":[],"specialties":[],"experienceLevel":null,"collaborationStatus":null,"roleVisibility":true,"activeRole":null}'::jsonb,
  ALTER COLUMN "creatorRoleProfile" SET NOT NULL;

ALTER TABLE public."user"
  DROP CONSTRAINT IF EXISTS "user_creator_role_profile_object_check";

ALTER TABLE public."user"
  ADD CONSTRAINT "user_creator_role_profile_object_check"
    CHECK (
      jsonb_typeof("creatorRoleProfile") = 'object'
      AND "creatorRoleProfile" ?& ARRAY[
        'version',
        'primaryRole',
        'secondaryRoles',
        'specialties',
        'experienceLevel',
        'collaborationStatus',
        'roleVisibility',
        'activeRole'
      ]::text[]
      AND ("creatorRoleProfile" ->> 'version') = '1'
      AND jsonb_typeof("creatorRoleProfile" -> 'secondaryRoles') = 'array'
      AND jsonb_typeof("creatorRoleProfile" -> 'specialties') = 'array'
      AND jsonb_typeof("creatorRoleProfile" -> 'roleVisibility') = 'boolean'
    ) NOT VALID;

ALTER TABLE public."user"
  VALIDATE CONSTRAINT "user_creator_role_profile_object_check";

COMMIT;
