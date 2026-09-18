-- Generic marketplace commerce ledger, entitlements, price overrides and verified provider event audit.
-- Payment instruments are never stored here; the PG keeps card/wallet/bank authentication data.

BEGIN;

CREATE TABLE IF NOT EXISTS public.commerce_product_price (
  id text PRIMARY KEY,
  "productType" text NOT NULL,
  "productId" text NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'KRW',
  active boolean NOT NULL DEFAULT true,
  "updatedBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_commerce_product_price_product UNIQUE ("productType", "productId"),
  CONSTRAINT commerce_product_price_type_check CHECK ("productType" IN ('market-resource')),
  CONSTRAINT commerce_product_price_amount_check CHECK (amount BETWEEN 0 AND 10000000),
  CONSTRAINT commerce_product_price_currency_check CHECK (currency = 'KRW'),
  CONSTRAINT commerce_product_price_id_length CHECK (char_length("productId") BETWEEN 1 AND 300)
);

CREATE TABLE IF NOT EXISTS public.commerce_order (
  id text PRIMARY KEY,
  "orderId" text NOT NULL UNIQUE,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "productType" text NOT NULL,
  "productId" text NOT NULL,
  "resourceId" text NOT NULL,
  "productName" text NOT NULL,
  amount integer NOT NULL,
  "balanceAmount" integer NOT NULL,
  currency text NOT NULL DEFAULT 'KRW',
  provider text NOT NULL,
  "providerMode" text NOT NULL,
  "providerStatus" text NOT NULL DEFAULT 'READY',
  "paymentKey" text UNIQUE,
  method text NOT NULL DEFAULT '',
  "receiptUrl" text NOT NULL DEFAULT '',
  "termsVersion" text NOT NULL,
  "createIdempotencyKey" text NOT NULL,
  "confirmIdempotencyKey" text NOT NULL,
  "cancelIdempotencyKey" text,
  "cancelReason" text NOT NULL DEFAULT '',
  "approvedAt" timestamptz,
  "canceledAt" timestamptz,
  "webhookVerifiedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_order_type_check CHECK ("productType" IN ('market-resource')),
  CONSTRAINT commerce_order_amount_check CHECK (amount BETWEEN 1 AND 10000000),
  CONSTRAINT commerce_order_balance_check CHECK ("balanceAmount" BETWEEN 0 AND amount),
  CONSTRAINT commerce_order_currency_check CHECK (currency = 'KRW'),
  CONSTRAINT commerce_order_provider_check CHECK (provider IN ('toss', 'mock')),
  CONSTRAINT commerce_order_provider_mode_check CHECK ("providerMode" IN ('test', 'live', 'mock')),
  CONSTRAINT commerce_order_status_check CHECK (
    "providerStatus" IN (
      'READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'DONE',
      'CANCELED', 'PARTIAL_CANCELED', 'ABORTED', 'EXPIRED'
    )
  ),
  CONSTRAINT commerce_order_id_check CHECK ("orderId" ~ '^[A-Za-z0-9_-]{6,64}$'),
  CONSTRAINT commerce_order_product_id_length CHECK (char_length("productId") BETWEEN 1 AND 300),
  CONSTRAINT commerce_order_resource_id_length CHECK (char_length("resourceId") BETWEEN 1 AND 100),
  CONSTRAINT commerce_order_product_name_length CHECK (char_length("productName") BETWEEN 1 AND 120),
  CONSTRAINT commerce_order_receipt_url_length CHECK (char_length("receiptUrl") <= 1000),
  CONSTRAINT commerce_order_cancel_reason_length CHECK (char_length("cancelReason") <= 200),
  CONSTRAINT uq_commerce_order_create_idempotency UNIQUE ("userId", "createIdempotencyKey")
);

CREATE TABLE IF NOT EXISTS public.commerce_entitlement (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "productType" text NOT NULL,
  "productId" text NOT NULL,
  "sourceOrderId" text REFERENCES public.commerce_order(id) ON DELETE SET NULL,
  "grantedAt" timestamptz NOT NULL DEFAULT now(),
  "revokedAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_commerce_entitlement_user_product UNIQUE ("userId", "productType", "productId"),
  CONSTRAINT commerce_entitlement_type_check CHECK ("productType" IN ('market-resource')),
  CONSTRAINT commerce_entitlement_product_id_length CHECK (char_length("productId") BETWEEN 1 AND 300)
);

CREATE TABLE IF NOT EXISTS public.commerce_payment_event (
  id text PRIMARY KEY,
  "orderId" text REFERENCES public.commerce_order(id) ON DELETE CASCADE,
  provider text NOT NULL,
  "eventKey" text NOT NULL,
  "eventType" text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  "payloadHash" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_commerce_payment_event_key UNIQUE (provider, "eventKey"),
  CONSTRAINT commerce_payment_event_provider_check CHECK (provider IN ('toss', 'mock')),
  CONSTRAINT commerce_payment_event_payload_hash_check CHECK ("payloadHash" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_commerce_product_price_active
  ON public.commerce_product_price ("productType", active);
CREATE INDEX IF NOT EXISTS idx_commerce_order_user_created
  ON public.commerce_order ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_order_status_created
  ON public.commerce_order ("providerStatus", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_order_product
  ON public.commerce_order ("productType", "productId");
CREATE INDEX IF NOT EXISTS idx_commerce_entitlement_active
  ON public.commerce_entitlement ("userId", "productType", "revokedAt");
CREATE INDEX IF NOT EXISTS idx_commerce_payment_event_order
  ON public.commerce_payment_event ("orderId", "createdAt" DESC);

REVOKE ALL ON TABLE public.commerce_product_price FROM PUBLIC;
REVOKE ALL ON TABLE public.commerce_order FROM PUBLIC;
REVOKE ALL ON TABLE public.commerce_entitlement FROM PUBLIC;
REVOKE ALL ON TABLE public.commerce_payment_event FROM PUBLIC;

COMMENT ON TABLE public.commerce_order IS
  'Server-priced commerce order ledger. Payment instrument credentials remain with the payment provider.';
COMMENT ON TABLE public.commerce_entitlement IS
  'Account-scoped durable product entitlement granted only after verified payment or explicit free policy.';
COMMENT ON TABLE public.commerce_payment_event IS
  'Idempotent audit ledger for provider callbacks verified through provider query-back.';

COMMIT;
