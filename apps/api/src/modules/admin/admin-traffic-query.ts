export const ADMIN_TRAFFIC_OVERVIEW_QUERY = `
  WITH events AS (
    SELECT
      occurred_at,
      visitor_hash,
      session_hash,
      path,
      title,
      source,
      medium,
      campaign,
      country_code,
      device_type,
      browser,
      load_time_ms
    FROM public.traffic_page_view
    WHERE occurred_at >= $1::timestamptz
      AND occurred_at <= $3::timestamptz
      AND NOT is_bot
  ),
  share_events AS (
    SELECT
      occurred_at,
      visitor_hash,
      session_hash,
      path,
      channel,
      outcome,
      country_code,
      device_type,
      browser
    FROM public.traffic_share_event
    WHERE occurred_at >= $1::timestamptz
      AND occurred_at <= $3::timestamptz
  ),
  sessions AS (
    SELECT
      visitor_hash,
      session_hash,
      page_views,
      engaged_seconds,
      first_seen_at,
      last_seen_at
    FROM public.traffic_session
    WHERE first_seen_at >= $1::timestamptz
      AND first_seen_at <= $3::timestamptz
      AND NOT is_bot
  ),
  active_sessions AS (
    SELECT visitor_hash, session_hash
    FROM public.traffic_session
    WHERE last_seen_at >= $3::timestamptz - interval '5 minutes'
      AND NOT is_bot
  ),
  series_buckets AS (
    SELECT generate_series(
      to_timestamp(
        floor(extract(epoch FROM $1::timestamptz) / $2::integer)
          * $2::integer
      ),
      to_timestamp(
        floor(extract(epoch FROM $3::timestamptz) / $2::integer)
          * $2::integer
      ),
      make_interval(secs => $2::integer)
    ) AS bucket
  ),
  series_aggregates AS (
    SELECT
      to_timestamp(
        floor(extract(epoch FROM occurred_at) / $2::integer)
          * $2::integer
      ) AS bucket,
      count(*)::integer AS page_views,
      count(DISTINCT visitor_hash)::integer AS visitors,
      count(DISTINCT session_hash)::integer AS sessions
    FROM events
    GROUP BY bucket
  ),
  series_rows AS (
    SELECT
      bucket.bucket,
      COALESCE(aggregate.page_views, 0)::integer AS page_views,
      COALESCE(aggregate.visitors, 0)::integer AS visitors,
      COALESCE(aggregate.sessions, 0)::integer AS sessions
    FROM series_buckets AS bucket
    LEFT JOIN series_aggregates AS aggregate USING (bucket)
    ORDER BY bucket.bucket
  ),
  realtime_buckets AS (
    SELECT generate_series(
      date_trunc('minute', $3::timestamptz) - interval '29 minutes',
      date_trunc('minute', $3::timestamptz),
      interval '1 minute'
    ) AS bucket
  ),
  realtime_aggregates AS (
    SELECT
      date_trunc('minute', occurred_at) AS bucket,
      count(*)::integer AS page_views,
      count(DISTINCT visitor_hash)::integer AS visitors
    FROM events
    WHERE occurred_at >= $3::timestamptz - interval '30 minutes'
    GROUP BY bucket
  ),
  realtime_rows AS (
    SELECT
      bucket.bucket,
      COALESCE(aggregate.page_views, 0)::integer AS page_views,
      COALESCE(aggregate.visitors, 0)::integer AS visitors
    FROM realtime_buckets AS bucket
    LEFT JOIN realtime_aggregates AS aggregate USING (bucket)
    ORDER BY bucket.bucket
  ),
  top_page_rows AS (
    SELECT
      path,
      max(title) AS title,
      count(*)::integer AS page_views,
      count(DISTINCT visitor_hash)::integer AS visitors,
      count(DISTINCT session_hash)::integer AS sessions,
      round(avg(load_time_ms))::integer AS average_load_time_ms
    FROM events
    GROUP BY path
    ORDER BY page_views DESC, visitors DESC, path
    LIMIT 12
  ),
  source_rows AS (
    SELECT
      source,
      medium,
      count(*)::integer AS page_views,
      count(DISTINCT visitor_hash)::integer AS visitors
    FROM events
    GROUP BY source, medium
    ORDER BY page_views DESC, visitors DESC, source
    LIMIT 10
  ),
  device_rows AS (
    SELECT
      device_type AS label,
      count(*)::integer AS page_views,
      count(DISTINCT visitor_hash)::integer AS visitors
    FROM events
    GROUP BY device_type
    ORDER BY page_views DESC, label
  ),
  browser_rows AS (
    SELECT
      browser AS label,
      count(*)::integer AS page_views,
      count(DISTINCT visitor_hash)::integer AS visitors
    FROM events
    GROUP BY browser
    ORDER BY page_views DESC, label
    LIMIT 8
  ),
  country_rows AS (
    SELECT
      COALESCE(country_code, 'Unknown') AS label,
      count(*)::integer AS page_views,
      count(DISTINCT visitor_hash)::integer AS visitors
    FROM events
    GROUP BY COALESCE(country_code, 'Unknown')
    ORDER BY page_views DESC, label
    LIMIT 10
  ),
  recent_rows AS (
    SELECT
      occurred_at,
      path,
      source,
      medium,
      country_code,
      device_type,
      browser
    FROM events
    ORDER BY occurred_at DESC
    LIMIT 24
  ),
  visitor_frequency AS (
    SELECT
      visitor_hash,
      count(DISTINCT session_hash)::integer AS session_count
    FROM events
    GROUP BY visitor_hash
  ),
  share_channel_rows AS (
    SELECT
      channel,
      count(*)::integer AS attempts,
      count(*) FILTER (WHERE outcome = 'opened')::integer AS opened,
      count(*) FILTER (WHERE outcome = 'completed')::integer AS completed,
      count(*) FILTER (WHERE outcome IN ('opened', 'completed'))::integer AS handoffs,
      count(*) FILTER (WHERE outcome = 'failed')::integer AS failed,
      count(*) FILTER (WHERE outcome = 'cancelled')::integer AS cancelled
    FROM share_events
    GROUP BY channel
    ORDER BY attempts DESC, channel
  ),
  share_content_rows AS (
    SELECT
      path,
      count(*)::integer AS attempts,
      count(*) FILTER (WHERE outcome = 'opened')::integer AS opened,
      count(*) FILTER (WHERE outcome = 'completed')::integer AS completed,
      count(*) FILTER (WHERE outcome IN ('opened', 'completed'))::integer AS handoffs
    FROM share_events
    GROUP BY path
    ORDER BY attempts DESC, handoffs DESC, path
    LIMIT 12
  ),
  share_totals AS (
    SELECT
      count(*)::integer AS attempts,
      count(*) FILTER (WHERE outcome = 'opened')::integer AS opened,
      count(*) FILTER (WHERE outcome = 'completed')::integer AS completed,
      count(*) FILTER (WHERE outcome = 'failed')::integer AS failed,
      count(*) FILTER (WHERE outcome = 'cancelled')::integer AS cancelled,
      count(DISTINCT visitor_hash)::integer AS unique_sharers
    FROM share_events
  ),
  share_attribution AS (
    SELECT
      count(*)::integer AS page_views,
      count(DISTINCT visitor_hash)::integer AS visitors,
      count(DISTINCT session_hash)::integer AS sessions
    FROM events
    WHERE campaign = 'content_share'
  ),
  totals AS (
    SELECT
      count(*)::integer AS page_views,
      count(DISTINCT visitor_hash)::integer AS visitors,
      count(DISTINCT session_hash)::integer AS sessions,
      min(occurred_at) AS coverage_start_at,
      max(occurred_at) AS latest_at,
      round(avg(load_time_ms))::integer AS average_load_time_ms
    FROM events
  ),
  engagement AS (
    SELECT
      count(*) FILTER (
        WHERE page_views > 1 OR engaged_seconds >= 10
      )::integer AS engaged_sessions,
      count(*) FILTER (
        WHERE page_views <= 1 AND engaged_seconds < 10
      )::integer AS bounced_sessions,
      round(avg(engaged_seconds))::integer AS average_engaged_seconds,
      round(avg(page_views)::numeric, 2) AS page_views_per_session
    FROM sessions
    WHERE page_views > 0
  )
  SELECT jsonb_build_object(
    'generatedAt', $3::timestamptz,
    'rangeDays', $4::integer,
    'bucketSeconds', $2::integer,
    'status',
      CASE
        WHEN (SELECT page_views FROM totals) > 0
          OR COALESCE((SELECT attempts FROM share_totals), 0) > 0
        THEN 'live'
        ELSE 'empty'
      END,
    'storageMode', 'first-party-postgres-v2',
    'retentionDays', $5::integer,
    'privacy', jsonb_build_object(
      'storesRawIp', false,
      'storesQueryString', false,
      'honorsBrowserPrivacySignals', true,
      'adminPathsExcluded', true
    ),
    'realtime', jsonb_build_object(
      'windowMinutes', 5,
      'activeVisitors',
        COALESCE((SELECT count(DISTINCT visitor_hash) FROM active_sessions), 0),
      'activeSessions', COALESCE((SELECT count(*) FROM active_sessions), 0),
      'pageViews5m', COALESCE((
        SELECT count(*) FROM events
        WHERE occurred_at >= $3::timestamptz - interval '5 minutes'
      ), 0),
      'pageViews30m', COALESCE((
        SELECT count(*) FROM events
        WHERE occurred_at >= $3::timestamptz - interval '30 minutes'
      ), 0),
      'latestAt', (SELECT latest_at FROM totals)
    ),
    'totals', jsonb_build_object(
      'pageViews', COALESCE((SELECT page_views FROM totals), 0),
      'uniqueVisitors', COALESCE((SELECT visitors FROM totals), 0),
      'sessions', COALESCE((SELECT sessions FROM totals), 0),
      'returningVisitors', COALESCE((
        SELECT count(*) FROM visitor_frequency WHERE session_count > 1
      ), 0),
      'coverageStartAt', (SELECT coverage_start_at FROM totals),
      'latestAt', (SELECT latest_at FROM totals),
      'averageLoadTimeMs', (SELECT average_load_time_ms FROM totals)
    ),
    'engagement', jsonb_build_object(
      'engagedSessions', COALESCE((SELECT engaged_sessions FROM engagement), 0),
      'bounceRate', CASE
        WHEN (
          COALESCE((SELECT engaged_sessions FROM engagement), 0)
          + COALESCE((SELECT bounced_sessions FROM engagement), 0)
        ) = 0 THEN 0
        ELSE round(
          COALESCE((SELECT bounced_sessions FROM engagement), 0)::numeric
          / (
            COALESCE((SELECT engaged_sessions FROM engagement), 0)
            + COALESCE((SELECT bounced_sessions FROM engagement), 0)
          ) * 100,
          1
        )
      END,
      'averageEngagedSeconds',
        COALESCE((SELECT average_engaged_seconds FROM engagement), 0),
      'pageViewsPerSession',
        COALESCE((SELECT page_views_per_session FROM engagement), 0)
    ),
    'sharing', jsonb_build_object(
      'attempts', COALESCE((SELECT attempts FROM share_totals), 0),
      'opened', COALESCE((SELECT opened FROM share_totals), 0),
      'completed', COALESCE((SELECT completed FROM share_totals), 0),
      'failed', COALESCE((SELECT failed FROM share_totals), 0),
      'cancelled', COALESCE((SELECT cancelled FROM share_totals), 0),
      'uniqueSharers', COALESCE((SELECT unique_sharers FROM share_totals), 0),
      'attributedPageViews', COALESCE((SELECT page_views FROM share_attribution), 0),
      'attributedVisitors', COALESCE((SELECT visitors FROM share_attribution), 0),
      'attributedSessions', COALESCE((SELECT sessions FROM share_attribution), 0),
      'channels', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'channel', channel,
          'attempts', attempts,
          'opened', opened,
          'completed', completed,
          'failed', failed,
          'cancelled', cancelled
        ) ORDER BY attempts DESC, channel)
        FROM share_channel_rows
      ), '[]'::jsonb),
      'topContent', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'path', path,
          'attempts', attempts,
          'opened', opened,
          'completed', completed
        ) ORDER BY attempts DESC, handoffs DESC, path)
        FROM share_content_rows
      ), '[]'::jsonb)
    ),
    'series', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'bucket', bucket,
        'pageViews', page_views,
        'visitors', visitors,
        'sessions', sessions
      ) ORDER BY bucket)
      FROM series_rows
    ), '[]'::jsonb),
    'realtimeSeries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'bucket', bucket,
        'pageViews', page_views,
        'visitors', visitors
      ) ORDER BY bucket)
      FROM realtime_rows
    ), '[]'::jsonb),
    'topPages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'path', path,
        'title', title,
        'pageViews', page_views,
        'visitors', visitors,
        'sessions', sessions,
        'averageLoadTimeMs', average_load_time_ms
      ) ORDER BY page_views DESC, visitors DESC, path)
      FROM top_page_rows
    ), '[]'::jsonb),
    'sources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'source', source,
        'medium', medium,
        'pageViews', page_views,
        'visitors', visitors
      ) ORDER BY page_views DESC, visitors DESC, source)
      FROM source_rows
    ), '[]'::jsonb),
    'devices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'label', label,
        'pageViews', page_views,
        'visitors', visitors
      ) ORDER BY page_views DESC, label)
      FROM device_rows
    ), '[]'::jsonb),
    'browsers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'label', label,
        'pageViews', page_views,
        'visitors', visitors
      ) ORDER BY page_views DESC, label)
      FROM browser_rows
    ), '[]'::jsonb),
    'countries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'label', label,
        'pageViews', page_views,
        'visitors', visitors
      ) ORDER BY page_views DESC, label)
      FROM country_rows
    ), '[]'::jsonb),
    'recent', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'occurredAt', occurred_at,
        'path', path,
        'source', source,
        'medium', medium,
        'countryCode', country_code,
        'deviceType', device_type,
        'browser', browser
      ) ORDER BY occurred_at DESC)
      FROM recent_rows
    ), '[]'::jsonb)
  ) AS analytics
`;

export const ADMIN_TRAFFIC_PULSE_QUERY = `
  WITH active_sessions AS (
    SELECT visitor_hash, session_hash
    FROM public.traffic_session
    WHERE last_seen_at >= $1::timestamptz
      AND NOT is_bot
  ),
  recent_page_views AS (
    SELECT occurred_at, visitor_hash
    FROM public.traffic_page_view
    WHERE occurred_at >= $2::timestamptz
      AND occurred_at <= $3::timestamptz
      AND NOT is_bot
  ),
  realtime_buckets AS (
    SELECT generate_series(
      date_trunc('minute', $3::timestamptz) - interval '29 minutes',
      date_trunc('minute', $3::timestamptz),
      interval '1 minute'
    ) AS bucket
  ),
  realtime_aggregates AS (
    SELECT
      date_trunc('minute', occurred_at) AS bucket,
      count(*)::integer AS page_views,
      count(DISTINCT visitor_hash)::integer AS visitors
    FROM recent_page_views
    GROUP BY bucket
  ),
  realtime_rows AS (
    SELECT
      bucket.bucket,
      COALESCE(aggregate.page_views, 0)::integer AS page_views,
      COALESCE(aggregate.visitors, 0)::integer AS visitors
    FROM realtime_buckets AS bucket
    LEFT JOIN realtime_aggregates AS aggregate USING (bucket)
    ORDER BY bucket.bucket
  )
  SELECT jsonb_build_object(
    'generatedAt', $3::timestamptz,
    'windowMinutes', 5,
    'activeVisitors',
      COALESCE((SELECT count(DISTINCT visitor_hash) FROM active_sessions), 0),
    'activeSessions', COALESCE((SELECT count(*) FROM active_sessions), 0),
    'pageViews5m', COALESCE((
      SELECT count(*) FROM recent_page_views
      WHERE occurred_at >= $1::timestamptz
    ), 0),
    'pageViews30m', COALESCE((SELECT count(*) FROM recent_page_views), 0),
    'latestAt', (SELECT max(occurred_at) FROM recent_page_views),
    'series', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'bucket', bucket,
        'pageViews', page_views,
        'visitors', visitors
      ) ORDER BY bucket)
      FROM realtime_rows
    ), '[]'::jsonb)
  ) AS pulse
`;
