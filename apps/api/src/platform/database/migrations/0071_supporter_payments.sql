-- One-time ToonSpectrum operating-cost supporter ledger and public funding settings.
-- Stores lifecycle metadata only; never card numbers, bank authentication data, or tax-donation receipt data.

BEGIN;

CREATE TABLE IF NOT EXISTS public.supporter_payment (
  id text PRIMARY KEY,
  "orderId" text NOT NULL UNIQUE,
  amount integer NOT NULL,
  "balanceAmount" integer NOT NULL,
  currency text NOT NULL DEFAULT 'KRW',
  "orderName" text NOT NULL,
  "supporterName" text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'anonymous',
  "showAmount" boolean NOT NULL DEFAULT false,
  "showMessage" boolean NOT NULL DEFAULT false,
  "publicHidden" boolean NOT NULL DEFAULT false,
  "termsVersion" text NOT NULL,
  mode text NOT NULL,
  "providerStatus" text NOT NULL DEFAULT 'READY',
  "paymentKey" text UNIQUE,
  method text NOT NULL DEFAULT '',
  "receiptUrl" text NOT NULL DEFAULT '',
  "confirmIdempotencyKey" text NOT NULL,
  "cancelIdempotencyKey" text,
  "cancelReason" text NOT NULL DEFAULT '',
  "approvedAt" timestamptz,
  "canceledAt" timestamptz,
  "webhookVerifiedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supporter_payment_amount_check CHECK (amount BETWEEN 1000 AND 1000000),
  CONSTRAINT supporter_payment_balance_check CHECK ("balanceAmount" BETWEEN 0 AND amount),
  CONSTRAINT supporter_payment_currency_check CHECK (currency = 'KRW'),
  CONSTRAINT supporter_payment_visibility_check CHECK (visibility IN ('anonymous', 'name')),
  CONSTRAINT supporter_payment_mode_check CHECK (mode IN ('test', 'live')),
  CONSTRAINT supporter_payment_status_check CHECK (
    "providerStatus" IN (
      'READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'DONE',
      'CANCELED', 'PARTIAL_CANCELED', 'ABORTED', 'EXPIRED'
    )
  ),
  CONSTRAINT supporter_payment_order_id_check CHECK ("orderId" ~ '^[A-Za-z0-9_-]{6,64}$'),
  CONSTRAINT supporter_payment_order_name_length CHECK (char_length("orderName") BETWEEN 1 AND 100),
  CONSTRAINT supporter_payment_supporter_name_length CHECK (char_length("supporterName") <= 80),
  CONSTRAINT supporter_payment_message_length CHECK (char_length(message) <= 500),
  CONSTRAINT supporter_payment_receipt_url_length CHECK (char_length("receiptUrl") <= 1000),
  CONSTRAINT supporter_payment_cancel_reason_length CHECK (char_length("cancelReason") <= 200),
  CONSTRAINT supporter_payment_public_fields_check CHECK (
    visibility = 'name' OR ("showAmount" = false AND "showMessage" = false)
  )
);
CREATE INDEX IF NOT EXISTS idx_supporter_payment_status_created
  ON public.supporter_payment ("providerStatus", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_supporter_payment_public_wall
  ON public.supporter_payment (visibility, "approvedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_supporter_payment_created
  ON public.supporter_payment ("createdAt" DESC);

CREATE TABLE IF NOT EXISTS public.supporter_funding_setting (
  id text PRIMARY KEY,
  "monthlyGoalAmount" integer NOT NULL DEFAULT 300000,
  "publicWallEnabled" boolean NOT NULL DEFAULT true,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supporter_funding_goal_check CHECK (
    "monthlyGoalAmount" BETWEEN 0 AND 100000000
  )
);

INSERT INTO public.supporter_funding_setting (
  id, "monthlyGoalAmount", "publicWallEnabled"
) VALUES ('default', 300000, true)
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON TABLE public.supporter_payment FROM PUBLIC;
REVOKE ALL ON TABLE public.supporter_funding_setting FROM PUBLIC;
COMMENT ON TABLE public.supporter_payment IS
  'One-time voluntary operating-cost support ledger; no card/bank authentication data or tax-donation receipt data.';
COMMENT ON TABLE public.supporter_funding_setting IS
  'Public operating-cost goal and supporter-wall visibility settings managed by ToonSpectrum operators.';

COMMIT;
