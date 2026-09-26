-- Server-authoritative webtoon planning, writer/artist handoff, review, credit and procurement aggregate.
-- The existing creator_work and collaborator ACL remain the identity and access root.
BEGIN;

CREATE TABLE IF NOT EXISTS public.production_project (
  "id" text PRIMARY KEY,
  "workId" text NOT NULL REFERENCES public.creator_work("id") ON DELETE CASCADE,
  "organizationId" text,
  "title" text NOT NULL,
  "collaborationModel" text NOT NULL,
  "modelVersion" integer NOT NULL DEFAULT 1,
  "revision" integer NOT NULL DEFAULT 0,
  "aggregate" jsonb NOT NULL,
  "createdBy" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT production_project_work_unique UNIQUE ("workId"),
  CONSTRAINT production_project_id_check CHECK (length("id") BETWEEN 1 AND 160),
  CONSTRAINT production_project_title_check CHECK (length(btrim("title")) BETWEEN 1 AND 240),
  CONSTRAINT production_project_collaboration_model_check CHECK (
    "collaborationModel" IN (
      'solo', 'co-creator', 'story-led-commission', 'art-led-commission',
      'adaptation', 'studio-production', 'anthology', 'replacement'
    )
  ),
  CONSTRAINT production_project_model_version_check CHECK ("modelVersion" = 1),
  CONSTRAINT production_project_revision_check CHECK ("revision" BETWEEN 0 AND 2147483647),
  CONSTRAINT production_project_aggregate_check CHECK ((
    jsonb_typeof("aggregate") = 'object'
    AND "aggregate"->>'modelVersion' = "modelVersion"::text
    AND "aggregate"->>'projectId' = "id"
    AND "aggregate"->>'workId' = "workId"
    AND "aggregate"->>'revision' = "revision"::text
    AND jsonb_typeof("aggregate"->'parties') = 'array'
    AND jsonb_typeof("aggregate"->'assignments') = 'array'
    AND jsonb_typeof("aggregate"->'auditEvents') = 'array'
  ) IS TRUE)
);
CREATE INDEX IF NOT EXISTS idx_production_project_updated
  ON public.production_project ("updatedAt" DESC, "id");
CREATE INDEX IF NOT EXISTS idx_production_project_organization_updated
  ON public.production_project ("organizationId", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS public.production_project_event (
  "id" text NOT NULL,
  "projectId" text NOT NULL REFERENCES public.production_project("id") ON DELETE CASCADE,
  "aggregateRevision" integer NOT NULL,
  "actorUserId" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "actorPartyId" text,
  "action" text NOT NULL,
  "targetType" text NOT NULL,
  "targetId" text NOT NULL,
  "beforeDigest" text,
  "afterDigest" text,
  "reason" text,
  "occurredAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT production_project_event_pkey PRIMARY KEY ("projectId", "aggregateRevision"),
  CONSTRAINT production_project_event_id_unique UNIQUE ("id"),
  CONSTRAINT production_project_event_revision_check CHECK ("aggregateRevision" BETWEEN 1 AND 2147483647),
  CONSTRAINT production_project_event_action_check CHECK (length(btrim("action")) BETWEEN 1 AND 120),
  CONSTRAINT production_project_event_target_type_check CHECK (length(btrim("targetType")) BETWEEN 1 AND 120),
  CONSTRAINT production_project_event_target_id_check CHECK (length(btrim("targetId")) BETWEEN 1 AND 160),
  CONSTRAINT production_project_event_digest_check CHECK (
    ("beforeDigest" IS NULL OR "beforeDigest" ~ '^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$')
    AND ("afterDigest" IS NULL OR "afterDigest" ~ '^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$')
  )
);
CREATE INDEX IF NOT EXISTS idx_production_project_event_actor_created
  ON public.production_project_event ("actorUserId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public.production_project_mutation_receipt (
  "projectId" text NOT NULL REFERENCES public.production_project("id") ON DELETE CASCADE,
  "actorUserId" text NOT NULL,
  "mutationId" text NOT NULL,
  "requestDigest" text NOT NULL,
  "resultRevision" integer NOT NULL,
  "response" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT production_project_mutation_receipt_pkey
    PRIMARY KEY ("projectId", "actorUserId", "mutationId"),
  CONSTRAINT production_project_mutation_receipt_id_check CHECK (
    "mutationId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT production_project_mutation_receipt_digest_check CHECK (
    "requestDigest" ~ '^fnv1a64:[0-9a-f]{16}$'
  ),
  CONSTRAINT production_project_mutation_receipt_revision_check CHECK (
    "resultRevision" BETWEEN 1 AND 2147483647
  ),
  CONSTRAINT production_project_mutation_receipt_response_check CHECK ((
    jsonb_typeof("response") = 'object'
    AND jsonb_typeof("response"->'aggregate') = 'object'
  ) IS TRUE)
);
CREATE INDEX IF NOT EXISTS idx_production_project_mutation_receipt_created
  ON public.production_project_mutation_receipt ("createdAt");

REVOKE ALL ON TABLE public.production_project FROM PUBLIC;
REVOKE ALL ON TABLE public.production_project_event FROM PUBLIC;
REVOKE ALL ON TABLE public.production_project_mutation_receipt FROM PUBLIC;

COMMIT;
