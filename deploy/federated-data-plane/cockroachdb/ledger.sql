CREATE TABLE IF NOT EXISTS ledger_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_type STRING NOT NULL,
  aggregate_id STRING NOT NULL,
  idempotency_key STRING NOT NULL UNIQUE,
  sequence_number INT8 NOT NULL CHECK (sequence_number > 0),
  amount_minor INT8,
  currency STRING,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ledger_amount_contract CHECK (
    (amount_minor IS NULL AND currency IS NULL)
    OR (amount_minor IS NOT NULL AND currency ~ '^[A-Z]{3}$')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ledger_entry_aggregate_sequence_uq
  ON ledger_entry (ledger_type, aggregate_id, sequence_number);

CREATE TABLE IF NOT EXISTS idempotency_receipt (
  idempotency_key STRING PRIMARY KEY,
  request_hash STRING NOT NULL,
  response_code INT4 NOT NULL,
  response_payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idempotency_receipt_expiry_idx
  ON idempotency_receipt (expires_at);
