-- 여러 API 인스턴스에서 동일 편집 리소스를 동시에 잠그지 못하도록 하는 짧은 PostgreSQL lease.
-- 프로세스 장애 시에도 expiresAt 이후 재획득할 수 있으며 work 삭제는 cascade 정리된다.
CREATE TABLE IF NOT EXISTS "creator_work_live_lock" (
  "workId" text NOT NULL,
  "resourceId" text NOT NULL,
  "leaseId" text NOT NULL,
  "acquisitionId" text NOT NULL,
  "ownerConnectionId" text NOT NULL,
  "ownerName" text NOT NULL,
  "expiresAt" timestamp with time zone NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "creator_work_live_lock_pkey" PRIMARY KEY ("workId", "resourceId"),
  CONSTRAINT "creator_work_live_lock_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_live_lock_resource_id_check"
    CHECK (length("resourceId") BETWEEN 1 AND 200),
  CONSTRAINT "creator_work_live_lock_lease_id_check"
    CHECK (length("leaseId") BETWEEN 1 AND 80),
  CONSTRAINT "creator_work_live_lock_acquisition_id_check"
    CHECK (length("acquisitionId") BETWEEN 1 AND 80),
  CONSTRAINT "creator_work_live_lock_connection_id_check"
    CHECK (length("ownerConnectionId") BETWEEN 1 AND 128),
  CONSTRAINT "creator_work_live_lock_owner_name_check"
    CHECK (length("ownerName") BETWEEN 1 AND 80),
  CONSTRAINT "creator_work_live_lock_expiry_order_check"
    CHECK ("expiresAt" > "createdAt")
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_live_lock_expiry"
  ON "creator_work_live_lock" ("expiresAt");
