-- Optional, no-cost-first external integration state for production projects.
-- Secrets remain encrypted at the application layer; webhook and provider calls are idempotency-fenced.
BEGIN;

CREATE TABLE IF NOT EXISTS "production_integration_receipt" (
  "projectId" text NOT NULL REFERENCES "production_project"("id") ON DELETE CASCADE,
  "actorUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "mutationId" text NOT NULL,
  "provider" text NOT NULL,
  "operation" text NOT NULL,
  "requestDigest" text NOT NULL,
  "state" text NOT NULL DEFAULT 'pending',
  "externalId" text,
  "response" jsonb,
  "errorCode" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("projectId", "actorUserId", "mutationId"),
  CONSTRAINT "production_integration_receipt_mutation_check"
    CHECK ("mutationId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT "production_integration_receipt_provider_check"
    CHECK (length(btrim("provider")) BETWEEN 1 AND 80),
  CONSTRAINT "production_integration_receipt_operation_check"
    CHECK (length(btrim("operation")) BETWEEN 1 AND 120),
  CONSTRAINT "production_integration_receipt_digest_check"
    CHECK ("requestDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "production_integration_receipt_state_check"
    CHECK ("state" IN ('pending', 'succeeded', 'failed', 'uncertain')),
  CONSTRAINT "production_integration_receipt_response_check"
    CHECK ("response" IS NULL OR jsonb_typeof("response") = 'object'),
  CONSTRAINT "production_integration_receipt_result_check"
    CHECK (
      ("state" = 'pending' AND "response" IS NULL AND "errorCode" IS NULL)
      OR ("state" = 'succeeded' AND "response" IS NOT NULL AND "errorCode" IS NULL)
      OR ("state" IN ('failed', 'uncertain') AND "errorCode" IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS "idx_production_integration_receipt_state"
  ON "production_integration_receipt" ("provider", "state", "updatedAt");

CREATE TABLE IF NOT EXISTS "production_integration_connection" (
  "projectId" text NOT NULL REFERENCES "production_project"("id") ON DELETE CASCADE,
  "actorUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "ciphertext" text NOT NULL,
  "externalAccountId" text,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "expiresAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("projectId", "actorUserId", "provider"),
  CONSTRAINT "production_integration_connection_provider_check"
    CHECK ("provider" IN ('google-workspace')),
  CONSTRAINT "production_integration_connection_ciphertext_check"
    CHECK (length("ciphertext") BETWEEN 32 AND 16384),
  CONSTRAINT "production_integration_connection_scopes_check"
    CHECK (jsonb_typeof("scopes") = 'array')
);
CREATE INDEX IF NOT EXISTS "idx_production_integration_connection_actor"
  ON "production_integration_connection" ("actorUserId", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS "production_integration_oauth_state" (
  "stateHash" text PRIMARY KEY,
  "projectId" text NOT NULL REFERENCES "production_project"("id") ON DELETE CASCADE,
  "actorUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "redirectPath" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "production_integration_oauth_state_hash_check"
    CHECK ("stateHash" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "production_integration_oauth_state_provider_check"
    CHECK ("provider" IN ('google-workspace')),
  CONSTRAINT "production_integration_oauth_state_redirect_check"
    CHECK ("redirectPath" ~ '^/production(?:/|$)' AND length("redirectPath") <= 512),
  CONSTRAINT "production_integration_oauth_state_expiry_check"
    CHECK ("expiresAt" > "createdAt")
);
CREATE INDEX IF NOT EXISTS "idx_production_integration_oauth_expiry"
  ON "production_integration_oauth_state" ("expiresAt") WHERE "consumedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "production_push_subscription" (
  "projectId" text NOT NULL REFERENCES "production_project"("id") ON DELETE CASCADE,
  "actorUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "endpointHash" text NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "expirationTime" bigint,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("projectId", "actorUserId", "endpointHash"),
  CONSTRAINT "production_push_subscription_endpoint_hash_check"
    CHECK ("endpointHash" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "production_push_subscription_endpoint_check"
    CHECK ("endpoint" ~ '^https://' AND length("endpoint") <= 4096),
  CONSTRAINT "production_push_subscription_key_check"
    CHECK (length("p256dh") BETWEEN 32 AND 512 AND length("auth") BETWEEN 8 AND 256),
  CONSTRAINT "production_push_subscription_expiry_check"
    CHECK ("expirationTime" IS NULL OR "expirationTime" >= 0)
);
CREATE INDEX IF NOT EXISTS "idx_production_push_subscription_project"
  ON "production_push_subscription" ("projectId", "updatedAt" DESC);

COMMIT;
