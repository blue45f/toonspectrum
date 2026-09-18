-- Membership, wallet, credit reservation and member-level authority.
-- Seller earnings remain outside this wallet by design.

BEGIN;

CREATE TABLE IF NOT EXISTS public.membership_grant (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "planId" text NOT NULL,
  source text NOT NULL,
  "grantKey" text NOT NULL,
  "sourceRef" text,
  status text NOT NULL DEFAULT 'active',
  "startsAt" timestamptz NOT NULL,
  "endsAt" timestamptz,
  "autoRenew" boolean NOT NULL DEFAULT false,
  "createdBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_membership_grant_key UNIQUE ("userId", "grantKey"),
  CONSTRAINT membership_grant_plan_check
    CHECK ("planId" IN ('free','creator','pro','team')),
  CONSTRAINT membership_grant_status_check
    CHECK (status IN ('active','cancelled','expired')),
  CONSTRAINT membership_grant_window_check
    CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);

CREATE INDEX IF NOT EXISTS idx_membership_grant_user_active
  ON public.membership_grant ("userId", status, "startsAt");

CREATE TABLE IF NOT EXISTS public.member_level (
  "userId" text PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  "creatorLevel" text NOT NULL DEFAULT 'new',
  "trustLevel" text NOT NULL DEFAULT 'new',
  "sellerLevel" text NOT NULL DEFAULT 'none',
  "trustScore" integer NOT NULL DEFAULT 0,
  "updatedBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_level_creator_check CHECK (
    "creatorLevel" IN ('new','verified','active','trusted','professional','partner')
  ),
  CONSTRAINT member_level_trust_check CHECK (
    "trustLevel" IN ('new','verified','trusted','restricted')
  ),
  CONSTRAINT member_level_seller_check CHECK (
    "sellerLevel" IN ('none','starter','verified','professional')
  ),
  CONSTRAINT member_level_score_check CHECK ("trustScore" BETWEEN 0 AND 1000)
);

CREATE INDEX IF NOT EXISTS idx_member_level_creator
  ON public.member_level ("creatorLevel", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_member_level_trust
  ON public.member_level ("trustLevel", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS public.wallet_account (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  asset text NOT NULL,
  "availableAmount" bigint NOT NULL DEFAULT 0,
  "reservedAmount" bigint NOT NULL DEFAULT 0,
  "lifetimeGranted" bigint NOT NULL DEFAULT 0,
  "lifetimeSpent" bigint NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_wallet_account_user_asset UNIQUE ("userId", asset),
  CONSTRAINT wallet_account_asset_check
    CHECK (asset IN ('studio_credit','reward_point')),
  CONSTRAINT wallet_account_amounts_check CHECK (
    "availableAmount" >= 0
    AND "reservedAmount" >= 0
    AND "lifetimeGranted" >= 0
    AND "lifetimeSpent" >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_wallet_account_user
  ON public.wallet_account ("userId");

CREATE TABLE IF NOT EXISTS public.wallet_lot (
  id text PRIMARY KEY,
  "accountId" text NOT NULL
    REFERENCES public.wallet_account(id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  asset text NOT NULL,
  source text NOT NULL,
  "sourceKey" text NOT NULL,
  "sourceRef" text,
  "grantedAmount" bigint NOT NULL,
  "remainingAmount" bigint NOT NULL,
  "reservedAmount" bigint NOT NULL DEFAULT 0,
  "spendPriority" integer NOT NULL DEFAULT 50,
  "expiresAt" timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_wallet_lot_source_key UNIQUE ("accountId", "sourceKey"),
  CONSTRAINT wallet_lot_asset_check
    CHECK (asset IN ('studio_credit','reward_point')),
  CONSTRAINT wallet_lot_granted_check CHECK ("grantedAmount" > 0),
  CONSTRAINT wallet_lot_balance_check CHECK (
    "remainingAmount" >= 0
    AND "reservedAmount" >= 0
    AND "remainingAmount" + "reservedAmount" <= "grantedAmount"
  ),
  CONSTRAINT wallet_lot_priority_check CHECK ("spendPriority" BETWEEN 0 AND 1000)
);

CREATE INDEX IF NOT EXISTS idx_wallet_lot_spend
  ON public.wallet_lot (
    "accountId",
    "spendPriority",
    "expiresAt",
    "createdAt"
  );
CREATE INDEX IF NOT EXISTS idx_wallet_lot_user_source
  ON public.wallet_lot ("userId", source, "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public.wallet_reservation (
  id text PRIMARY KEY,
  "accountId" text NOT NULL
    REFERENCES public.wallet_account(id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "featureKey" text,
  "requestedAmount" bigint NOT NULL,
  "capturedAmount" bigint NOT NULL DEFAULT 0,
  "idempotencyKey" text NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  "expiresAt" timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_wallet_reservation_idempotency
    UNIQUE ("userId", "idempotencyKey"),
  CONSTRAINT wallet_reservation_requested_check CHECK ("requestedAmount" > 0),
  CONSTRAINT wallet_reservation_captured_check CHECK (
    "capturedAmount" >= 0 AND "capturedAmount" <= "requestedAmount"
  ),
  CONSTRAINT wallet_reservation_status_check CHECK (
    status IN ('reserved','captured','released','expired')
  )
);

CREATE INDEX IF NOT EXISTS idx_wallet_reservation_active
  ON public.wallet_reservation ("accountId", status, "expiresAt");

CREATE TABLE IF NOT EXISTS public.wallet_reservation_allocation (
  id text PRIMARY KEY,
  "reservationId" text NOT NULL
    REFERENCES public.wallet_reservation(id) ON DELETE CASCADE,
  "lotId" text NOT NULL
    REFERENCES public.wallet_lot(id) ON DELETE RESTRICT,
  "allocatedAmount" bigint NOT NULL,
  "capturedAmount" bigint NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_wallet_allocation_reservation_lot UNIQUE ("reservationId", "lotId"),
  CONSTRAINT wallet_allocation_amount_check CHECK (
    "allocatedAmount" > 0
    AND "capturedAmount" >= 0
    AND "capturedAmount" <= "allocatedAmount"
  )
);

CREATE INDEX IF NOT EXISTS idx_wallet_allocation_lot
  ON public.wallet_reservation_allocation ("lotId");

CREATE TABLE IF NOT EXISTS public.wallet_ledger_entry (
  id text PRIMARY KEY,
  "accountId" text NOT NULL
    REFERENCES public.wallet_account(id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "lotId" text REFERENCES public.wallet_lot(id) ON DELETE SET NULL,
  "reservationId" text
    REFERENCES public.wallet_reservation(id) ON DELETE SET NULL,
  "entryType" text NOT NULL,
  amount bigint NOT NULL,
  "deltaAvailable" bigint NOT NULL DEFAULT 0,
  "deltaReserved" bigint NOT NULL DEFAULT 0,
  reason text NOT NULL,
  "referenceKey" text,
  "idempotencyKey" text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_wallet_ledger_idempotency
    UNIQUE ("accountId", "idempotencyKey"),
  CONSTRAINT wallet_ledger_amount_check CHECK (amount >= 0),
  CONSTRAINT wallet_ledger_type_check CHECK (
    "entryType" IN (
      'grant','purchase','reserve','capture','release',
      'refund','expire','adjustment','reversal'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created
  ON public.wallet_ledger_entry ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_reservation
  ON public.wallet_ledger_entry ("reservationId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public.membership_policy_override (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  "updatedBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_policy_override_active
  ON public.membership_policy_override (active, "updatedAt" DESC);

REVOKE ALL ON TABLE public.membership_grant FROM PUBLIC;
REVOKE ALL ON TABLE public.member_level FROM PUBLIC;
REVOKE ALL ON TABLE public.wallet_account FROM PUBLIC;
REVOKE ALL ON TABLE public.wallet_lot FROM PUBLIC;
REVOKE ALL ON TABLE public.wallet_reservation FROM PUBLIC;
REVOKE ALL ON TABLE public.wallet_reservation_allocation FROM PUBLIC;
REVOKE ALL ON TABLE public.wallet_ledger_entry FROM PUBLIC;
REVOKE ALL ON TABLE public.membership_policy_override FROM PUBLIC;

COMMENT ON TABLE public.wallet_ledger_entry IS
  'Append-only wallet audit ledger. Corrections are represented by new entries.';
COMMENT ON TABLE public.wallet_lot IS
  'Credit and reward-point grants with independent expiry and spend priority.';
COMMENT ON TABLE public.membership_grant IS
  'Subscription and promotional plan grants. Beta access is represented as a grant.';

COMMIT;
