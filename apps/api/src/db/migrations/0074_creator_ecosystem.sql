CREATE TABLE IF NOT EXISTS "creator_collaboration_preference" (
  "userId" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "discoverable" boolean NOT NULL DEFAULT false,
  "acceptedTypes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "acceptUnverified" boolean NOT NULL DEFAULT false,
  "note" text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_creator_collaboration_discoverable"
  ON "creator_collaboration_preference" ("discoverable", "updatedAt");

CREATE TABLE IF NOT EXISTS "creator_business_profile" (
  "userId" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "organization" text NOT NULL,
  "website" text NOT NULL,
  "contactEmail" text NOT NULL,
  "evidenceNote" text NOT NULL DEFAULT '',
  "verificationStatus" text NOT NULL DEFAULT 'draft',
  "reviewNote" text NOT NULL DEFAULT '',
  "reviewedBy" text REFERENCES "user"("id") ON DELETE SET NULL,
  "reviewedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_creator_business_verification"
  ON "creator_business_profile" ("verificationStatus", "updatedAt");

CREATE TABLE IF NOT EXISTS "creator_ip_proposal" (
  "id" text PRIMARY KEY,
  "senderId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "targetCreatorId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "organization" text NOT NULL,
  "contactEmail" text NOT NULL,
  "senderVerificationStatus" text NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "budgetMinWon" bigint NOT NULL DEFAULT 0,
  "budgetMaxWon" bigint NOT NULL DEFAULT 0,
  "currency" text NOT NULL DEFAULT 'KRW',
  "territories" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "exclusive" boolean NOT NULL DEFAULT false,
  "durationMonths" integer NOT NULL DEFAULT 0,
  "projectUrl" text NOT NULL DEFAULT '',
  "rightsRequested" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'new',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "creator_ip_proposal_not_self"
    CHECK ("senderId" <> "targetCreatorId"),
  CONSTRAINT "creator_ip_proposal_budget_range"
    CHECK ("budgetMinWon" >= 0 AND "budgetMaxWon" >= "budgetMinWon")
);
CREATE INDEX IF NOT EXISTS "idx_creator_ip_proposal_target"
  ON "creator_ip_proposal" ("targetCreatorId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_creator_ip_proposal_sender"
  ON "creator_ip_proposal" ("senderId", "createdAt");

CREATE TABLE IF NOT EXISTS "creator_collection_item" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "isbn13" text NOT NULL DEFAULT '',
  "title" text NOT NULL,
  "creator" text NOT NULL DEFAULT '',
  "publisher" text NOT NULL DEFAULT '',
  "volumeLabel" text NOT NULL DEFAULT '',
  "coverUrl" text NOT NULL DEFAULT '',
  "ownershipStatus" text NOT NULL DEFAULT 'owned',
  "readStatus" text NOT NULL DEFAULT 'unread',
  "editionType" text NOT NULL DEFAULT 'standard',
  "lentTo" text NOT NULL DEFAULT '',
  "notes" text NOT NULL DEFAULT '',
  "sourceProvider" text NOT NULL DEFAULT '',
  "sourceUrl" text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_creator_collection_user_updated"
  ON "creator_collection_item" ("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "idx_creator_collection_user_isbn"
  ON "creator_collection_item" ("userId", "isbn13");
