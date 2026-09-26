BEGIN;

CREATE TABLE IF NOT EXISTS public.membership_resource_usage_event (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  kind text NOT NULL,
  "sourceKey" text NOT NULL,
  bytes bigint NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membership_resource_usage_event_kind_check
    CHECK (kind IN ('upload','generated')),
  CONSTRAINT membership_resource_usage_event_bytes_check
    CHECK (bytes > 0),
  CONSTRAINT uq_membership_resource_usage_source
    UNIQUE ("userId", "sourceKey")
);

CREATE INDEX IF NOT EXISTS idx_membership_resource_usage_user_created
  ON public.membership_resource_usage_event ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public.membership_resource_state (
  "userId" text PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  "planId" text NOT NULL,
  status text NOT NULL DEFAULT 'normal',
  "overQuotaSince" timestamptz,
  "graceEndsAt" timestamptz,
  "lastUsageBytes" bigint NOT NULL DEFAULT 0,
  "lastLimitBytes" bigint NOT NULL DEFAULT 0,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membership_resource_state_plan_check
    CHECK ("planId" IN ('free','creator','pro','team')),
  CONSTRAINT membership_resource_state_status_check
    CHECK (status IN ('normal','warning','grace','read_only')),
  CONSTRAINT membership_resource_state_usage_check
    CHECK ("lastUsageBytes" >= 0 AND "lastLimitBytes" >= 0),
  CONSTRAINT membership_resource_state_grace_check
    CHECK (
      (status IN ('normal','warning') AND "overQuotaSince" IS NULL AND "graceEndsAt" IS NULL)
      OR
      (status IN ('grace','read_only') AND "overQuotaSince" IS NOT NULL AND "graceEndsAt" IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_membership_resource_state_status
  ON public.membership_resource_state (status, "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS public.membership_notice (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  type text NOT NULL,
  "dedupeKey" text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  "seenAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membership_notice_type_check
    CHECK (type IN (
      'storage_warning',
      'storage_over_quota',
      'storage_read_only',
      'membership_expiring'
    )),
  CONSTRAINT uq_membership_notice_dedupe
    UNIQUE ("userId", "dedupeKey")
);

CREATE INDEX IF NOT EXISTS idx_membership_notice_user_unseen
  ON public.membership_notice ("userId", "seenAt", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public.membership_reward_reversal (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  activity text NOT NULL,
  "sourceRef" text NOT NULL,
  reason text NOT NULL,
  "requestedAmount" bigint NOT NULL,
  "reversedAmount" bigint NOT NULL,
  "pendingAmount" bigint NOT NULL,
  "actorUserId" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membership_reward_reversal_amount_check
    CHECK (
      "requestedAmount" > 0
      AND "reversedAmount" >= 0
      AND "pendingAmount" >= 0
      AND "reversedAmount" + "pendingAmount" = "requestedAmount"
    ),
  CONSTRAINT uq_membership_reward_reversal_source
    UNIQUE ("userId", activity, "sourceRef")
);

CREATE INDEX IF NOT EXISTS idx_membership_reward_reversal_pending
  ON public.membership_reward_reversal ("userId", "pendingAmount", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public.membership_policy_change (
  revision bigserial PRIMARY KEY,
  key text NOT NULL,
  "beforeValue" jsonb,
  "afterValue" jsonb,
  "beforeActive" boolean,
  "afterActive" boolean,
  "changedBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "changedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_policy_change_key_revision
  ON public.membership_policy_change (key, revision DESC);

CREATE OR REPLACE FUNCTION public.capture_membership_policy_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.membership_policy_change (
      key, "beforeValue", "afterValue", "beforeActive", "afterActive", "changedBy"
    ) VALUES (
      NEW.key, NULL, NEW.value, NULL, NEW.active, NEW."updatedBy"
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.value IS DISTINCT FROM NEW.value OR OLD.active IS DISTINCT FROM NEW.active THEN
      INSERT INTO public.membership_policy_change (
        key, "beforeValue", "afterValue", "beforeActive", "afterActive", "changedBy"
      ) VALUES (
        NEW.key, OLD.value, NEW.value, OLD.active, NEW.active, NEW."updatedBy"
      );
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO public.membership_policy_change (
      key, "beforeValue", "afterValue", "beforeActive", "afterActive", "changedBy"
    ) VALUES (
      OLD.key, OLD.value, NULL, OLD.active, NULL, OLD."updatedBy"
    );
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS membership_policy_change_capture
  ON public.membership_policy_override;
CREATE TRIGGER membership_policy_change_capture
AFTER INSERT OR UPDATE OR DELETE ON public.membership_policy_override
FOR EACH ROW EXECUTE FUNCTION public.capture_membership_policy_change();


CREATE OR REPLACE FUNCTION public.apply_pending_reward_recovery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  account_asset text;
  remaining bigint;
  take bigint;
  total_take bigint := 0;
  recovery record;
BEGIN
  IF NEW."entryType" <> 'grant' OR NEW."lotId" IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT asset INTO account_asset
  FROM public.wallet_account
  WHERE id = NEW."accountId";

  IF account_asset <> 'reward_point' THEN
    RETURN NEW;
  END IF;

  remaining := NEW.amount;
  FOR recovery IN
    SELECT id, "pendingAmount"
    FROM public.membership_reward_reversal
    WHERE "userId" = NEW."userId"
      AND "pendingAmount" > 0
    ORDER BY "createdAt" ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    take := LEAST(remaining, recovery."pendingAmount");
    UPDATE public.membership_reward_reversal
    SET "reversedAmount" = "reversedAmount" + take,
        "pendingAmount" = "pendingAmount" - take
    WHERE id = recovery.id;
    remaining := remaining - take;
    total_take := total_take + take;
  END LOOP;

  IF total_take <= 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.wallet_lot
  SET "remainingAmount" = "remainingAmount" - total_take
  WHERE id = NEW."lotId"
    AND "remainingAmount" >= total_take;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_pending_recovery_lot_invariant_failed';
  END IF;

  UPDATE public.wallet_account
  SET "availableAmount" = "availableAmount" - total_take,
      "updatedAt" = now()
  WHERE id = NEW."accountId"
    AND "availableAmount" >= total_take;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_pending_recovery_account_invariant_failed';
  END IF;

  INSERT INTO public.wallet_ledger_entry (
    id, "accountId", "userId", "lotId", "entryType", amount,
    "deltaAvailable", "deltaReserved", reason, "referenceKey",
    "idempotencyKey", metadata
  ) VALUES (
    'auto-recovery:' || NEW.id,
    NEW."accountId",
    NEW."userId",
    NEW."lotId",
    'reversal',
    total_take,
    -total_take,
    0,
    '이전 활동 보상 회수 잔액 자동 정산',
    NEW."referenceKey",
    'auto-recovery:' || NEW.id,
    jsonb_build_object('originLedgerId', NEW.id)
  )
  ON CONFLICT ("accountId", "idempotencyKey") DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallet_pending_reward_recovery
  ON public.wallet_ledger_entry;
CREATE TRIGGER wallet_pending_reward_recovery
AFTER INSERT ON public.wallet_ledger_entry
FOR EACH ROW EXECUTE FUNCTION public.apply_pending_reward_recovery();

REVOKE ALL ON TABLE public.membership_resource_usage_event FROM PUBLIC;
REVOKE ALL ON TABLE public.membership_resource_state FROM PUBLIC;
REVOKE ALL ON TABLE public.membership_notice FROM PUBLIC;
REVOKE ALL ON TABLE public.membership_reward_reversal FROM PUBLIC;
REVOKE ALL ON TABLE public.membership_policy_change FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.membership_policy_change_revision_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_membership_policy_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_pending_reward_recovery() FROM PUBLIC;

COMMENT ON TABLE public.membership_resource_usage_event IS
  'Append-only successful resource usage events used for daily upload accounting.';
COMMENT ON TABLE public.membership_resource_state IS
  'Derived per-user storage quota state. Downgrades never delete data; over-quota accounts block new storage.';
COMMENT ON TABLE public.membership_notice IS
  'Deduplicated account notices for storage thresholds and membership expiry.';
COMMENT ON TABLE public.membership_reward_reversal IS
  'Append-only reward clawback receipts. Any uncollectable remainder stays visible as pending recovery.';
COMMENT ON TABLE public.membership_policy_change IS
  'Immutable history captured automatically whenever a membership policy override changes.';

COMMIT;
