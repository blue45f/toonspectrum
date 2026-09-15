-- Additive governance model for member-created communities.
-- This migration preserves every existing cafe, member, post URL and slug.
BEGIN;
SELECT pg_advisory_xact_lock(82361753);

ALTER TABLE public.community_cafe
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'genre',
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS "joinPolicy" text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS "postingPolicy" text NOT NULL DEFAULT 'members',
  ADD COLUMN IF NOT EXISTS rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now();

UPDATE public.community_cafe
SET
  kind = COALESCE(NULLIF(kind, ''), 'genre'),
  tags = COALESCE(tags, '[]'::jsonb),
  visibility = COALESCE(NULLIF(visibility, ''), 'public'),
  "joinPolicy" = COALESCE(NULLIF("joinPolicy", ''), 'open'),
  "postingPolicy" = COALESCE(NULLIF("postingPolicy", ''), 'members'),
  rules = COALESCE(rules, '[]'::jsonb),
  status = COALESCE(NULLIF(status, ''), 'active'),
  "updatedAt" = COALESCE("updatedAt", "createdAt", now());

DO $community_cafe_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.community_cafe'::regclass
      AND conname = 'community_cafe_kind_check'
  ) THEN
    ALTER TABLE public.community_cafe
      ADD CONSTRAINT community_cafe_kind_check
      CHECK (kind IN ('creator', 'work', 'genre', 'project', 'study', 'social'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.community_cafe'::regclass
      AND conname = 'community_cafe_visibility_check'
  ) THEN
    ALTER TABLE public.community_cafe
      ADD CONSTRAINT community_cafe_visibility_check
      CHECK (visibility IN ('public', 'private'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.community_cafe'::regclass
      AND conname = 'community_cafe_join_policy_check'
  ) THEN
    ALTER TABLE public.community_cafe
      ADD CONSTRAINT community_cafe_join_policy_check
      CHECK ("joinPolicy" IN ('open', 'approval', 'invite'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.community_cafe'::regclass
      AND conname = 'community_cafe_posting_policy_check'
  ) THEN
    ALTER TABLE public.community_cafe
      ADD CONSTRAINT community_cafe_posting_policy_check
      CHECK ("postingPolicy" IN ('members', 'staff'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.community_cafe'::regclass
      AND conname = 'community_cafe_status_check'
  ) THEN
    ALTER TABLE public.community_cafe
      ADD CONSTRAINT community_cafe_status_check
      CHECK (status IN ('active', 'archived'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.community_cafe_member'::regclass
      AND conname = 'community_cafe_member_role_check'
  ) THEN
    ALTER TABLE public.community_cafe_member
      ADD CONSTRAINT community_cafe_member_role_check
      CHECK (role IN ('owner', 'admin', 'moderator', 'member'));
  END IF;
END
$community_cafe_constraints$;

CREATE INDEX IF NOT EXISTS idx_community_cafe_discovery
  ON public.community_cafe(visibility, status, "createdAt");
CREATE INDEX IF NOT EXISTS idx_community_cafe_kind_created
  ON public.community_cafe(kind, "createdAt");
CREATE INDEX IF NOT EXISTS idx_community_cafe_member_role
  ON public.community_cafe_member("cafeId", role, "joinedAt");
CREATE UNIQUE INDEX IF NOT EXISTS uq_community_cafe_single_owner
  ON public.community_cafe_member("cafeId")
  WHERE role = 'owner';

CREATE TABLE IF NOT EXISTS public.community_cafe_join_request (
  id text PRIMARY KEY,
  "cafeId" text NOT NULL REFERENCES public.community_cafe(id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  "reviewedBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "reviewedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT community_cafe_join_request_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT uq_community_cafe_join_request_user UNIQUE ("cafeId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_community_cafe_join_request_queue
  ON public.community_cafe_join_request("cafeId", status, "createdAt");
CREATE INDEX IF NOT EXISTS idx_community_cafe_join_request_user
  ON public.community_cafe_join_request("userId", status);

CREATE TABLE IF NOT EXISTS public.community_cafe_invite (
  id text PRIMARY KEY,
  "cafeId" text NOT NULL REFERENCES public.community_cafe(id) ON DELETE CASCADE,
  "codeHash" text NOT NULL UNIQUE,
  "createdBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "maxUses" integer NOT NULL DEFAULT 1,
  "useCount" integer NOT NULL DEFAULT 0,
  "expiresAt" timestamp NOT NULL,
  "revokedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT community_cafe_invite_uses_check
    CHECK ("maxUses" BETWEEN 1 AND 1000 AND "useCount" BETWEEN 0 AND "maxUses"),
  CONSTRAINT community_cafe_invite_expiry_check
    CHECK ("expiresAt" > "createdAt")
);
CREATE INDEX IF NOT EXISTS idx_community_cafe_invite_cafe
  ON public.community_cafe_invite("cafeId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_community_cafe_invite_expiry
  ON public.community_cafe_invite("expiresAt", "revokedAt");

CREATE TABLE IF NOT EXISTS public.community_cafe_ban (
  "cafeId" text NOT NULL REFERENCES public.community_cafe(id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  "bannedBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "expiresAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("cafeId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_community_cafe_ban_cafe
  ON public.community_cafe_ban("cafeId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_community_cafe_ban_user
  ON public.community_cafe_ban("userId", "expiresAt");

CREATE TABLE IF NOT EXISTS public.community_cafe_moderation_log (
  id text PRIMARY KEY,
  "cafeId" text NOT NULL REFERENCES public.community_cafe(id) ON DELETE CASCADE,
  "actorId" text REFERENCES public."user"(id) ON DELETE SET NULL,
  action text NOT NULL,
  "targetUserId" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "targetPostId" text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_cafe_moderation_log_cafe
  ON public.community_cafe_moderation_log("cafeId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_community_cafe_moderation_log_actor
  ON public.community_cafe_moderation_log("actorId", "createdAt");

REVOKE ALL ON TABLE
  public.community_cafe,
  public.community_cafe_member,
  public.community_cafe_join_request,
  public.community_cafe_invite,
  public.community_cafe_ban,
  public.community_cafe_moderation_log
FROM PUBLIC;

DO $community_cafe_governance_ready$
BEGIN
  IF to_regclass('public.community_cafe_join_request') IS NULL
    OR to_regclass('public.community_cafe_invite') IS NULL
    OR to_regclass('public.community_cafe_ban') IS NULL
    OR to_regclass('public.community_cafe_moderation_log') IS NULL THEN
    RAISE EXCEPTION 'community cafe governance relations are incomplete';
  END IF;
  PERFORM id, kind, tags, visibility, "joinPolicy", "postingPolicy", rules,
    status, "updatedAt" FROM public.community_cafe LIMIT 0;
  PERFORM "cafeId", "userId", role, "joinedAt"
    FROM public.community_cafe_member LIMIT 0;
  PERFORM id, "cafeId", "userId", message, status, "reviewedBy",
    "reviewedAt", "createdAt", "updatedAt"
    FROM public.community_cafe_join_request LIMIT 0;
  PERFORM id, "cafeId", "codeHash", "createdBy", "maxUses", "useCount",
    "expiresAt", "revokedAt", "createdAt"
    FROM public.community_cafe_invite LIMIT 0;
  PERFORM "cafeId", "userId", reason, "bannedBy", "expiresAt", "createdAt"
    FROM public.community_cafe_ban LIMIT 0;
  PERFORM id, "cafeId", "actorId", action, "targetUserId", "targetPostId",
    metadata, "createdAt" FROM public.community_cafe_moderation_log LIMIT 0;
END
$community_cafe_governance_ready$;

COMMIT;
