-- Dedicated first-party traffic analytics storage.
--
-- Privacy boundary: only server-HMAC identifiers and bounded categorical metadata are stored.
-- Raw IP addresses, full user agents, query strings, search terms and full referrer URLs never
-- enter these relations.

CREATE TABLE IF NOT EXISTS public.traffic_page_view (
  id text PRIMARY KEY,
  occurred_at timestamp(3) with time zone NOT NULL,
  visitor_hash text NOT NULL,
  session_hash text NOT NULL,
  path text NOT NULL,
  title text,
  referrer_host text,
  source text NOT NULL,
  medium text NOT NULL,
  campaign text,
  country_code text,
  device_type text NOT NULL,
  browser text NOT NULL,
  os text NOT NULL,
  screen_class text NOT NULL,
  load_time_ms integer,
  is_bot boolean NOT NULL DEFAULT false,
  CONSTRAINT traffic_page_view_visitor_hash_length
    CHECK (length(visitor_hash) = 64),
  CONSTRAINT traffic_page_view_session_hash_length
    CHECK (length(session_hash) = 64),
  CONSTRAINT traffic_page_view_path_length
    CHECK (length(path) BETWEEN 1 AND 320),
  CONSTRAINT traffic_page_view_load_time_range
    CHECK (load_time_ms IS NULL OR load_time_ms BETWEEN 0 AND 120000),
  CONSTRAINT traffic_page_view_country_code
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
);

CREATE INDEX IF NOT EXISTS traffic_page_view_occurred_at_idx
  ON public.traffic_page_view (occurred_at DESC);
CREATE INDEX IF NOT EXISTS traffic_page_view_session_occurred_idx
  ON public.traffic_page_view (session_hash, occurred_at DESC);
CREATE INDEX IF NOT EXISTS traffic_page_view_visitor_occurred_idx
  ON public.traffic_page_view (visitor_hash, occurred_at DESC);
CREATE INDEX IF NOT EXISTS traffic_page_view_path_occurred_idx
  ON public.traffic_page_view (path, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.traffic_session (
  session_hash text PRIMARY KEY,
  visitor_hash text NOT NULL,
  first_seen_at timestamp(3) with time zone NOT NULL,
  last_seen_at timestamp(3) with time zone NOT NULL,
  entry_path text NOT NULL,
  last_path text NOT NULL,
  referrer_host text,
  source text NOT NULL,
  medium text NOT NULL,
  campaign text,
  country_code text,
  device_type text NOT NULL,
  browser text NOT NULL,
  os text NOT NULL,
  screen_class text NOT NULL,
  page_views integer NOT NULL DEFAULT 0,
  engaged_seconds integer NOT NULL DEFAULT 0,
  is_bot boolean NOT NULL DEFAULT false,
  updated_at timestamp(3) with time zone NOT NULL,
  CONSTRAINT traffic_session_visitor_hash_length
    CHECK (length(visitor_hash) = 64),
  CONSTRAINT traffic_session_session_hash_length
    CHECK (length(session_hash) = 64),
  CONSTRAINT traffic_session_entry_path_length
    CHECK (length(entry_path) BETWEEN 1 AND 320),
  CONSTRAINT traffic_session_last_path_length
    CHECK (length(last_path) BETWEEN 1 AND 320),
  CONSTRAINT traffic_session_page_views_nonnegative
    CHECK (page_views >= 0),
  CONSTRAINT traffic_session_engagement_range
    CHECK (engaged_seconds BETWEEN 0 AND 43200),
  CONSTRAINT traffic_session_country_code
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT traffic_session_seen_order
    CHECK (first_seen_at <= last_seen_at AND last_seen_at <= updated_at)
);

CREATE INDEX IF NOT EXISTS traffic_session_last_seen_idx
  ON public.traffic_session (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS traffic_session_first_seen_idx
  ON public.traffic_session (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS traffic_session_visitor_first_seen_idx
  ON public.traffic_session (visitor_hash, first_seen_at DESC);

COMMENT ON TABLE public.traffic_page_view IS
  'Privacy-bounded first-party SPA page-view events with HMAC visitor/session identifiers.';
COMMENT ON TABLE public.traffic_session IS
  'Atomic first-party traffic session aggregates used for engagement and realtime presence.';
