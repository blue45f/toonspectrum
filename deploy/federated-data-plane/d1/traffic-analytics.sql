-- 트래픽 분석 전용 D1 스키마. 원본 IP·사용자 ID·URL query는 저장하지 않는다.
-- 시각은 서버가 만든 UTC ISO 8601(밀리초 3자리) 문자열로 고정한다.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS traffic_page_view (
  id text PRIMARY KEY,
  occurred_at TEXT NOT NULL,
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
  is_bot INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT traffic_page_view_visitor_hash_length
    CHECK (length(visitor_hash) = 64),
  CONSTRAINT traffic_page_view_session_hash_length
    CHECK (length(session_hash) = 64),
  CONSTRAINT traffic_page_view_path_length
    CHECK (length(path) BETWEEN 1 AND 320),
  CONSTRAINT traffic_page_view_load_time_range
    CHECK (load_time_ms IS NULL OR load_time_ms BETWEEN 0 AND 120000),
  CONSTRAINT traffic_page_view_country_code
    CHECK (country_code IS NULL OR country_code GLOB '[A-Z][A-Z]')
);

CREATE INDEX IF NOT EXISTS traffic_page_view_occurred_at_idx
  ON traffic_page_view (occurred_at DESC);

CREATE TABLE IF NOT EXISTS traffic_session (
  session_hash text PRIMARY KEY,
  visitor_hash text NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
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
  is_bot INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
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
    CHECK (country_code IS NULL OR country_code GLOB '[A-Z][A-Z]'),
  CONSTRAINT traffic_session_seen_order
    CHECK (first_seen_at <= last_seen_at AND last_seen_at <= updated_at)
);

CREATE INDEX IF NOT EXISTS traffic_session_last_seen_idx
  ON traffic_session (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS traffic_session_first_seen_idx
  ON traffic_session (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS traffic_session_visitor_first_seen_idx
  ON traffic_session (visitor_hash, first_seen_at DESC);

CREATE TABLE IF NOT EXISTS traffic_share_event (
  id text PRIMARY KEY,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
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
    CHECK (country_code IS NULL OR country_code GLOB '[A-Z][A-Z]'),
  CONSTRAINT traffic_share_event_device_type_length
    CHECK (length(device_type) BETWEEN 1 AND 32),
  CONSTRAINT traffic_share_event_browser_length
    CHECK (length(browser) BETWEEN 1 AND 64),
  CONSTRAINT traffic_share_event_os_length
    CHECK (length(os) BETWEEN 1 AND 64)
);

CREATE INDEX IF NOT EXISTS traffic_share_event_occurred_at_idx
  ON traffic_share_event (occurred_at DESC);

-- 신규 페이지 이벤트 한 건과 세션 카운터 증가를 같은 statement에 묶는다.
CREATE TRIGGER IF NOT EXISTS traffic_page_view_owner_guard
BEFORE INSERT ON traffic_page_view
WHEN NOT EXISTS (
  SELECT 1 FROM traffic_session
  WHERE session_hash = NEW.session_hash AND visitor_hash = NEW.visitor_hash
)
BEGIN
  SELECT RAISE(ABORT, 'traffic_session_owner_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS traffic_page_view_count
AFTER INSERT ON traffic_page_view
BEGIN
  UPDATE traffic_session SET page_views = page_views + 1
  WHERE session_hash = NEW.session_hash AND visitor_hash = NEW.visitor_hash;
END;

-- 여러 API 인스턴스의 보존 정리를 한 실행에 한정한다. 실패한 batch는 이 행도 rollback한다.
CREATE TABLE IF NOT EXISTS traffic_analytics_maintenance (
  name TEXT PRIMARY KEY CHECK (name = 'retention'),
  last_run_ms INTEGER NOT NULL,
  lease_token TEXT NOT NULL
);
