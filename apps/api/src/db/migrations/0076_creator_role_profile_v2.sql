-- Upgrade creator role profiles to private-by-default v2 records.
-- Existing v1 visibility choices are preserved, while onboarding, work capacity,
-- notification policy, aliases and project workspace preferences remain private.

BEGIN;

UPDATE public."user"
SET "creatorRoleProfile" = jsonb_build_object(
  'version', 2,
  'primaryRole', "creatorRoleProfile" -> 'primaryRole',
  'secondaryRoles', COALESCE("creatorRoleProfile" -> 'secondaryRoles', '[]'::jsonb),
  'specialties', COALESCE("creatorRoleProfile" -> 'specialties', '[]'::jsonb),
  'experienceLevel', "creatorRoleProfile" -> 'experienceLevel',
  'collaborationStatus', "creatorRoleProfile" -> 'collaborationStatus',
  'visibility', CASE
    WHEN jsonb_typeof("creatorRoleProfile" -> 'visibility') = 'object'
      THEN "creatorRoleProfile" -> 'visibility'
    ELSE jsonb_build_object(
      'roles', COALESCE(("creatorRoleProfile" ->> 'roleVisibility')::boolean, false),
      'specialties', COALESCE(("creatorRoleProfile" ->> 'roleVisibility')::boolean, false),
      'experienceLevel', COALESCE(("creatorRoleProfile" ->> 'roleVisibility')::boolean, false),
      'collaborationStatus', COALESCE(("creatorRoleProfile" ->> 'roleVisibility')::boolean, false)
    )
  END,
  'activeRole', "creatorRoleProfile" -> 'activeRole',
  'usagePurposes', CASE
    WHEN jsonb_typeof("creatorRoleProfile" -> 'usagePurposes') = 'array'
      THEN "creatorRoleProfile" -> 'usagePurposes'
    ELSE '[]'::jsonb
  END,
  'roleAliases', CASE
    WHEN jsonb_typeof("creatorRoleProfile" -> 'roleAliases') = 'array'
      THEN "creatorRoleProfile" -> 'roleAliases'
    ELSE '[]'::jsonb
  END,
  'workCapacity', CASE
    WHEN jsonb_typeof("creatorRoleProfile" -> 'workCapacity') = 'object'
      THEN "creatorRoleProfile" -> 'workCapacity'
    ELSE jsonb_build_object(
      'weeklyHours', null,
      'maxConcurrentTasks', null,
      'availabilityNote', ''
    )
  END,
  'defaultNotificationLevel', CASE
    WHEN "creatorRoleProfile" ->> 'defaultNotificationLevel' IN ('essential', 'standard', 'all')
      THEN "creatorRoleProfile" ->> 'defaultNotificationLevel'
    ELSE 'standard'
  END,
  'onboarding', CASE
    WHEN jsonb_typeof("creatorRoleProfile" -> 'onboarding') = 'object'
      THEN "creatorRoleProfile" -> 'onboarding'
    WHEN "creatorRoleProfile" -> 'primaryRole' IS NOT NULL
      AND "creatorRoleProfile" -> 'primaryRole' <> 'null'::jsonb
      THEN jsonb_build_object(
        'status', 'completed',
        'step', 4,
        'completedAt', null,
        'updatedAt', null
      )
    ELSE jsonb_build_object(
      'status', 'not-started',
      'step', 1,
      'completedAt', null,
      'updatedAt', null
    )
  END,
  'projectRolePreferences', CASE
    WHEN jsonb_typeof("creatorRoleProfile" -> 'projectRolePreferences') = 'array'
      THEN "creatorRoleProfile" -> 'projectRolePreferences'
    ELSE '[]'::jsonb
  END
)
WHERE COALESCE("creatorRoleProfile" ->> 'version', '1') <> '2'
   OR NOT ("creatorRoleProfile" ?& ARRAY[
     'visibility',
     'usagePurposes',
     'roleAliases',
     'workCapacity',
     'defaultNotificationLevel',
     'onboarding',
     'projectRolePreferences'
   ]::text[]);

ALTER TABLE public."user"
  ALTER COLUMN "creatorRoleProfile" SET DEFAULT
    '{"version":2,"primaryRole":null,"secondaryRoles":[],"specialties":[],"experienceLevel":null,"collaborationStatus":null,"visibility":{"roles":false,"specialties":false,"experienceLevel":false,"collaborationStatus":false},"activeRole":null,"usagePurposes":[],"roleAliases":[],"workCapacity":{"weeklyHours":null,"maxConcurrentTasks":null,"availabilityNote":""},"defaultNotificationLevel":"standard","onboarding":{"status":"not-started","step":1,"completedAt":null,"updatedAt":null},"projectRolePreferences":[]}'::jsonb;

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
        'visibility',
        'activeRole',
        'usagePurposes',
        'roleAliases',
        'workCapacity',
        'defaultNotificationLevel',
        'onboarding',
        'projectRolePreferences'
      ]::text[]
      AND ("creatorRoleProfile" ->> 'version') = '2'
      AND jsonb_typeof("creatorRoleProfile" -> 'secondaryRoles') = 'array'
      AND jsonb_typeof("creatorRoleProfile" -> 'specialties') = 'array'
      AND jsonb_typeof("creatorRoleProfile" -> 'visibility') = 'object'
      AND jsonb_typeof("creatorRoleProfile" -> 'visibility' -> 'roles') = 'boolean'
      AND jsonb_typeof("creatorRoleProfile" -> 'visibility' -> 'specialties') = 'boolean'
      AND jsonb_typeof("creatorRoleProfile" -> 'visibility' -> 'experienceLevel') = 'boolean'
      AND jsonb_typeof("creatorRoleProfile" -> 'visibility' -> 'collaborationStatus') = 'boolean'
      AND jsonb_typeof("creatorRoleProfile" -> 'usagePurposes') = 'array'
      AND jsonb_typeof("creatorRoleProfile" -> 'roleAliases') = 'array'
      AND jsonb_typeof("creatorRoleProfile" -> 'workCapacity') = 'object'
      AND "creatorRoleProfile" ->> 'defaultNotificationLevel' IN ('essential', 'standard', 'all')
      AND jsonb_typeof("creatorRoleProfile" -> 'onboarding') = 'object'
      AND jsonb_typeof("creatorRoleProfile" -> 'projectRolePreferences') = 'array'
    ) NOT VALID;

ALTER TABLE public."user"
  VALIDATE CONSTRAINT "user_creator_role_profile_object_check";

CREATE INDEX IF NOT EXISTS idx_user_creator_primary_role_public
  ON public."user" (("creatorRoleProfile" ->> 'primaryRole'))
  WHERE "status" = 'active'
    AND ("creatorRoleProfile" -> 'visibility' ->> 'roles')::boolean = true;

CREATE INDEX IF NOT EXISTS idx_user_creator_specialties_public_gin
  ON public."user" USING gin (("creatorRoleProfile" -> 'specialties'))
  WHERE "status" = 'active'
    AND ("creatorRoleProfile" -> 'visibility' ->> 'specialties')::boolean = true;

CREATE INDEX IF NOT EXISTS idx_user_creator_collaboration_public
  ON public."user" (("creatorRoleProfile" ->> 'collaborationStatus'))
  WHERE "status" = 'active'
    AND ("creatorRoleProfile" -> 'visibility' ->> 'collaborationStatus')::boolean = true;

COMMIT;
