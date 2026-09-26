-- Record privacy-preserving share interactions alongside first-party traffic analytics.

BEGIN;

CREATE TABLE IF NOT EXISTS public.traffic_share_event (
  id text PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  visitor_hash text NOT NULL,
  session_hash text NOT NULL,
  path text NOT NULL,
  channel text NOT NULL,
  outcome text NOT NULL,
  country_code text,
  device_type text NOT NULL,
  browser text NOT NULL,
  os text NOT NULL,
  CONSTRAINT traffic_share_event_id_length
    CHECK (length(id) BETWEEN 16 AND 128),
  CONSTRAINT traffic_share_event_visitor_hash_length
    CHECK (length(visitor_hash) = 64),
  CONSTRAINT traffic_share_event_session_hash_length
    CHECK (length(session_hash) = 64),
  CONSTRAINT traffic_share_event_path_length
    CHECK (length(path) BETWEEN 1 AND 320),
  CONSTRAINT traffic_share_event_channel
    CHECK (channel IN (
      'native', 'kakao', 'naver', 'line', 'x', 'facebook',
      'telegram', 'email', 'copy', 'qr'
    )),
  CONSTRAINT traffic_share_event_outcome
    CHECK (outcome IN ('opened', 'completed', 'cancelled', 'failed')),
  CONSTRAINT traffic_share_event_country_code
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT traffic_share_event_device_type_length
    CHECK (length(device_type) BETWEEN 1 AND 32),
  CONSTRAINT traffic_share_event_browser_length
    CHECK (length(browser) BETWEEN 1 AND 64),
  CONSTRAINT traffic_share_event_os_length
    CHECK (length(os) BETWEEN 1 AND 64)
);

CREATE INDEX IF NOT EXISTS traffic_share_event_occurred_at_idx
  ON public.traffic_share_event (occurred_at DESC);
CREATE INDEX IF NOT EXISTS traffic_share_event_session_occurred_idx
  ON public.traffic_share_event (session_hash, occurred_at DESC);
CREATE INDEX IF NOT EXISTS traffic_share_event_path_occurred_idx
  ON public.traffic_share_event (path, occurred_at DESC);
CREATE INDEX IF NOT EXISTS traffic_share_event_channel_occurred_idx
  ON public.traffic_share_event (channel, occurred_at DESC);

COMMENT ON TABLE public.traffic_share_event IS
  'First-party share attempts with one-way hashed identifiers; stores no IP, query string, or message body.';

COMMIT;
