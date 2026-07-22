-- Cross-instance Studio AI request rate limit and paid-upstream concurrency lease.
-- Apply before deploying the matching API build. The API preflight intentionally refuses to
-- start when this bounded per-user gate is missing or incomplete.

BEGIN;

CREATE TABLE IF NOT EXISTS "studio_ai_request_gate" (
  "userId" text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  "requestTimes" timestamptz[] NOT NULL DEFAULT '{}'::timestamptz[],
  "leaseTokenHash" bytea,
  "leaseFence" bigint NOT NULL DEFAULT 0,
  "leaseExpiresAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT studio_ai_request_gate_request_times_check
    CHECK (cardinality("requestTimes") BETWEEN 0 AND 10000),
  CONSTRAINT studio_ai_request_gate_lease_fence_check CHECK ("leaseFence" >= 0),
  CONSTRAINT studio_ai_request_gate_lease_state_check
    CHECK (
      ("leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL)
      OR (
        "leaseTokenHash" IS NOT NULL
        AND octet_length("leaseTokenHash") = 32
        AND "leaseExpiresAt" IS NOT NULL
      )
    )
);

-- Reapplying this forward migration repairs supported Drizzle/partial-bootstrap drift instead of
-- letting CREATE TABLE IF NOT EXISTS silently preserve a same-name but weaker gate contract.
ALTER TABLE "studio_ai_request_gate"
  ALTER COLUMN "requestTimes" SET DEFAULT '{}'::timestamptz[],
  ALTER COLUMN "requestTimes" SET NOT NULL,
  ALTER COLUMN "leaseTokenHash" DROP NOT NULL,
  ALTER COLUMN "leaseFence" SET DEFAULT 0,
  ALTER COLUMN "leaseFence" SET NOT NULL,
  ALTER COLUMN "leaseExpiresAt" DROP NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET NOT NULL;

-- These names are owned by this migration. A same-name constraint is not evidence that the gate
-- is safe: partial bootstraps have installed CHECK (... OR true), changed bounds, and even used
-- another constraint type. Replacement is transactional; invalid existing rows abort everything.
ALTER TABLE "studio_ai_request_gate"
  DROP CONSTRAINT IF EXISTS "studio_ai_request_gate_request_times_check",
  DROP CONSTRAINT IF EXISTS "studio_ai_request_gate_lease_fence_check",
  DROP CONSTRAINT IF EXISTS "studio_ai_request_gate_lease_state_check";

ALTER TABLE "studio_ai_request_gate"
  ADD CONSTRAINT "studio_ai_request_gate_request_times_check"
    CHECK (cardinality("requestTimes") BETWEEN 0 AND 10000),
  ADD CONSTRAINT "studio_ai_request_gate_lease_fence_check"
    CHECK ("leaseFence" >= 0),
  ADD CONSTRAINT "studio_ai_request_gate_lease_state_check"
    CHECK (
      ("leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL)
      OR (
        "leaseTokenHash" IS NOT NULL
        AND octet_length("leaseTokenHash") = 32
        AND "leaseExpiresAt" IS NOT NULL
      )
    );

COMMIT;
