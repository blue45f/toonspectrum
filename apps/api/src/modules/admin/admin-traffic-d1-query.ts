// PostgreSQL 관리자 지표와 동일한 집계 계약. UTC bucket은 재귀 CTE로 빈 구간까지 생성한다.
export const D1_TRAFFIC_OVERVIEW_QUERY = `
  WITH RECURSIVE events AS (
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
    FROM traffic_page_view
    WHERE occurred_at >= ?1
      AND occurred_at <= ?3
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
    FROM traffic_share_event
    WHERE occurred_at >= ?1
      AND occurred_at <= ?3
  ),
  sessions AS (
    SELECT
      visitor_hash,
      session_hash,
      page_views,
      engaged_seconds,
      first_seen_at,
      last_seen_at
    FROM traffic_session
    WHERE first_seen_at >= ?1
      AND first_seen_at <= ?3
      AND NOT is_bot
  ),
  active_totals AS (
    SELECT count(DISTINCT visitor_hash) AS visitors, count(*) AS sessions
    FROM traffic_session
    WHERE last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ', ?3, '-5 minutes')
      AND NOT is_bot
  ),
  series_epoch(bucket_epoch) AS (
    SELECT CAST(strftime('%s', ?1) AS INTEGER) / CAST(?2 AS INTEGER) * CAST(?2 AS INTEGER)
    UNION ALL SELECT bucket_epoch + ?2 FROM series_epoch
    WHERE bucket_epoch + ?2 <= CAST(strftime('%s', ?3) AS INTEGER) / CAST(?2 AS INTEGER) * CAST(?2 AS INTEGER)
  ),
  series_buckets AS (
    SELECT strftime('%Y-%m-%dT%H:%M:%fZ', bucket_epoch, 'unixepoch') AS bucket FROM series_epoch
  ),
  series_aggregates AS (
    SELECT
      strftime('%Y-%m-%dT%H:%M:%fZ', CAST(strftime('%s', occurred_at) AS INTEGER) / CAST(?2 AS INTEGER) * CAST(?2 AS INTEGER), 'unixepoch') AS bucket,
      count(*) AS page_views,
      count(DISTINCT visitor_hash) AS visitors,
      count(DISTINCT session_hash) AS sessions
    FROM events
    GROUP BY bucket
  ),
  series_rows AS (
    SELECT
      bucket.bucket,
      COALESCE(aggregate.page_views, 0) AS page_views,
      COALESCE(aggregate.visitors, 0) AS visitors,
      COALESCE(aggregate.sessions, 0) AS sessions
    FROM series_buckets AS bucket
    LEFT JOIN series_aggregates AS aggregate USING (bucket)
    ORDER BY bucket.bucket
  ),
  realtime_epoch(bucket_epoch) AS (
    SELECT CAST(strftime('%s', ?3) AS INTEGER) / 60 * 60 - 29 * 60
    UNION ALL SELECT bucket_epoch + 60 FROM realtime_epoch
    WHERE bucket_epoch + 60 <= CAST(strftime('%s', ?3) AS INTEGER) / 60 * 60
  ),
  realtime_buckets AS (
    SELECT strftime('%Y-%m-%dT%H:%M:%fZ', bucket_epoch, 'unixepoch') AS bucket FROM realtime_epoch
  ),
  realtime_aggregates AS (
    SELECT
      strftime('%Y-%m-%dT%H:%M:00.000Z', occurred_at) AS bucket,
      count(*) AS page_views,
      count(DISTINCT visitor_hash) AS visitors
    FROM events
    WHERE occurred_at >= strftime('%Y-%m-%dT%H:%M:%fZ', ?3, '-30 minutes')
    GROUP BY bucket
  ),
  realtime_rows AS (
    SELECT
      bucket.bucket,
      COALESCE(aggregate.page_views, 0) AS page_views,
      COALESCE(aggregate.visitors, 0) AS visitors
    FROM realtime_buckets AS bucket
    LEFT JOIN realtime_aggregates AS aggregate USING (bucket)
    ORDER BY bucket.bucket
  ),
  top_page_rows AS (
    SELECT
      path,
      max(title) AS title,
      count(*) AS page_views,
      count(DISTINCT visitor_hash) AS visitors,
      count(DISTINCT session_hash) AS sessions,
      round(avg(load_time_ms)) AS average_load_time_ms
    FROM events
    GROUP BY path
    ORDER BY page_views DESC, visitors DESC, path
    LIMIT 12
  ),
  source_rows AS (
    SELECT
      source,
      medium,
      count(*) AS page_views,
      count(DISTINCT visitor_hash) AS visitors
    FROM events
    GROUP BY source, medium
    ORDER BY page_views DESC, visitors DESC, source
    LIMIT 10
  ),
  device_rows AS (
    SELECT
      device_type AS label,
      count(*) AS page_views,
      count(DISTINCT visitor_hash) AS visitors
    FROM events
    GROUP BY device_type
    ORDER BY page_views DESC, label
  ),
  browser_rows AS (
    SELECT
      browser AS label,
      count(*) AS page_views,
      count(DISTINCT visitor_hash) AS visitors
    FROM events
    GROUP BY browser
    ORDER BY page_views DESC, label
    LIMIT 8
  ),
  country_rows AS (
    SELECT
      COALESCE(country_code, 'Unknown') AS label,
      count(*) AS page_views,
      count(DISTINCT visitor_hash) AS visitors
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
      count(DISTINCT session_hash) AS session_count
    FROM events
    GROUP BY visitor_hash
  ),
  share_channel_rows AS (
    SELECT
      channel,
      count(*) AS attempts,
      count(*) FILTER (WHERE outcome = 'opened') AS opened,
      count(*) FILTER (WHERE outcome = 'completed') AS completed,
      count(*) FILTER (WHERE outcome IN ('opened', 'completed')) AS handoffs,
      count(*) FILTER (WHERE outcome = 'failed') AS failed,
      count(*) FILTER (WHERE outcome = 'cancelled') AS cancelled
    FROM share_events
    GROUP BY channel
    ORDER BY attempts DESC, channel
  ),
  share_content_rows AS (
    SELECT
      path,
      count(*) AS attempts,
      count(*) FILTER (WHERE outcome = 'opened') AS opened,
      count(*) FILTER (WHERE outcome = 'completed') AS completed,
      count(*) FILTER (WHERE outcome IN ('opened', 'completed')) AS handoffs
    FROM share_events
    GROUP BY path
    ORDER BY attempts DESC, handoffs DESC, path
    LIMIT 12
  ),
  share_totals AS (
    SELECT
      count(*) AS attempts,
      count(*) FILTER (WHERE outcome = 'opened') AS opened,
      count(*) FILTER (WHERE outcome = 'completed') AS completed,
      count(*) FILTER (WHERE outcome = 'failed') AS failed,
      count(*) FILTER (WHERE outcome = 'cancelled') AS cancelled,
      count(DISTINCT visitor_hash) AS unique_sharers
    FROM share_events
  ),
  share_attribution AS (
    SELECT
      count(*) AS page_views,
      count(DISTINCT visitor_hash) AS visitors,
      count(DISTINCT session_hash) AS sessions
    FROM events
    WHERE campaign = 'content_share'
  ),
  totals AS (
    SELECT
      count(*) AS page_views,
      count(*) FILTER (WHERE occurred_at >= strftime('%Y-%m-%dT%H:%M:%fZ', ?3, '-5 minutes')) AS page_views_5m,
      count(*) FILTER (WHERE occurred_at >= strftime('%Y-%m-%dT%H:%M:%fZ', ?3, '-30 minutes')) AS page_views_30m,
      count(DISTINCT visitor_hash) AS visitors,
      count(DISTINCT session_hash) AS sessions,
      min(occurred_at) AS coverage_start_at,
      max(occurred_at) AS latest_at,
      round(avg(load_time_ms)) AS average_load_time_ms
    FROM events
  ),
  engagement AS (
    SELECT
      count(*) FILTER (
        WHERE page_views > 1 OR engaged_seconds >= 10
      ) AS engaged_sessions,
      count(*) FILTER (
        WHERE page_views <= 1 AND engaged_seconds < 10
      ) AS bounced_sessions,
      round(avg(engaged_seconds)) AS average_engaged_seconds,
      round(avg(page_views), 2) AS page_views_per_session
    FROM sessions
    WHERE page_views > 0
  )
  SELECT json_object(
    'generatedAt', ?3,
    'rangeDays', ?4,
    'bucketSeconds', ?2,
    'status',
      CASE
        WHEN (SELECT page_views FROM totals) > 0
          OR COALESCE((SELECT attempts FROM share_totals), 0) > 0
        THEN 'live'
        ELSE 'empty'
      END,
    'storageMode', 'first-party-cloudflare-d1-v1',
    'retentionDays', ?5,
    'privacy', json_object(
      'storesRawIp', json('false'),
      'storesQueryString', json('false'),
      'honorsBrowserPrivacySignals', json('true'),
      'adminPathsExcluded', json('true')
    ),
    'realtime', json_object(
      'windowMinutes', 5,
      'activeVisitors',
        COALESCE((SELECT visitors FROM active_totals), 0),
      'activeSessions', COALESCE((SELECT sessions FROM active_totals), 0),
      'pageViews5m', COALESCE((SELECT page_views_5m FROM totals), 0),
      'pageViews30m', COALESCE((SELECT page_views_30m FROM totals), 0),
      'latestAt', (SELECT latest_at FROM totals)
    ),
    'totals', json_object(
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
    'engagement', json_object(
      'engagedSessions', COALESCE((SELECT engaged_sessions FROM engagement), 0),
      'bounceRate', CASE
        WHEN (
          COALESCE((SELECT engaged_sessions FROM engagement), 0)
          + COALESCE((SELECT bounced_sessions FROM engagement), 0)
        ) = 0 THEN 0
        ELSE round(
          COALESCE((SELECT bounced_sessions FROM engagement), 0) * 1.0
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
    'sharing', json_object(
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
        SELECT json_group_array(json_object(
          'channel', channel,
          'attempts', attempts,
          'opened', opened,
          'completed', completed,
          'failed', failed,
          'cancelled', cancelled
        ) ORDER BY attempts DESC, channel)
        FROM share_channel_rows
      ), json('[]')),
      'topContent', COALESCE((
        SELECT json_group_array(json_object(
          'path', path,
          'attempts', attempts,
          'opened', opened,
          'completed', completed
        ) ORDER BY attempts DESC, handoffs DESC, path)
        FROM share_content_rows
      ), json('[]'))
    ),
    'series', COALESCE((
      SELECT json_group_array(json_object(
        'bucket', bucket,
        'pageViews', page_views,
        'visitors', visitors,
        'sessions', sessions
      ) ORDER BY bucket)
      FROM series_rows
    ), json('[]')),
    'realtimeSeries', COALESCE((
      SELECT json_group_array(json_object(
        'bucket', bucket,
        'pageViews', page_views,
        'visitors', visitors
      ) ORDER BY bucket)
      FROM realtime_rows
    ), json('[]')),
    'topPages', COALESCE((
      SELECT json_group_array(json_object(
        'path', path,
        'title', title,
        'pageViews', page_views,
        'visitors', visitors,
        'sessions', sessions,
        'averageLoadTimeMs', average_load_time_ms
      ) ORDER BY page_views DESC, visitors DESC, path)
      FROM top_page_rows
    ), json('[]')),
    'sources', COALESCE((
      SELECT json_group_array(json_object(
        'source', source,
        'medium', medium,
        'pageViews', page_views,
        'visitors', visitors
      ) ORDER BY page_views DESC, visitors DESC, source)
      FROM source_rows
    ), json('[]')),
    'devices', COALESCE((
      SELECT json_group_array(json_object(
        'label', label,
        'pageViews', page_views,
        'visitors', visitors
      ) ORDER BY page_views DESC, label)
      FROM device_rows
    ), json('[]')),
    'browsers', COALESCE((
      SELECT json_group_array(json_object(
        'label', label,
        'pageViews', page_views,
        'visitors', visitors
      ) ORDER BY page_views DESC, label)
      FROM browser_rows
    ), json('[]')),
    'countries', COALESCE((
      SELECT json_group_array(json_object(
        'label', label,
        'pageViews', page_views,
        'visitors', visitors
      ) ORDER BY page_views DESC, label)
      FROM country_rows
    ), json('[]')),
    'recent', COALESCE((
      SELECT json_group_array(json_object(
        'occurredAt', occurred_at,
        'path', path,
        'source', source,
        'medium', medium,
        'countryCode', country_code,
        'deviceType', device_type,
        'browser', browser
      ) ORDER BY occurred_at DESC)
      FROM recent_rows
    ), json('[]'))
  ) AS analytics
`;

// 원본 이벤트는 한 번 집계한다. 5분 경계는 각 행에서 판단하고 합계를 재사용한다.
export const D1_TRAFFIC_PULSE_QUERY = `
  WITH RECURSIVE active_totals AS (
    SELECT count(DISTINCT visitor_hash) AS visitors, count(*) AS sessions
    FROM traffic_session
    WHERE last_seen_at >= ?1
      AND NOT is_bot
  ),
  recent_page_views AS (
    SELECT occurred_at, visitor_hash
    FROM traffic_page_view
    WHERE occurred_at >= ?2
      AND occurred_at <= ?3
      AND NOT is_bot
  ),
  realtime_epoch(bucket_epoch) AS (
    SELECT CAST(strftime('%s', ?3) AS INTEGER) / 60 * 60 - 29 * 60
    UNION ALL SELECT bucket_epoch + 60 FROM realtime_epoch
    WHERE bucket_epoch + 60 <= CAST(strftime('%s', ?3) AS INTEGER) / 60 * 60
  ),
  realtime_buckets AS (
    SELECT strftime('%Y-%m-%dT%H:%M:%fZ', bucket_epoch, 'unixepoch') AS bucket FROM realtime_epoch
  ),
  realtime_aggregates AS (
    SELECT
      strftime('%Y-%m-%dT%H:%M:00.000Z', occurred_at) AS bucket,
      count(*) AS page_views,
      count(DISTINCT visitor_hash) AS visitors,
      count(*) FILTER (WHERE occurred_at >= ?1) AS page_views_5m,
      max(occurred_at) AS latest_at
    FROM recent_page_views
    GROUP BY bucket
  ),
  recent_totals AS (
    SELECT COALESCE(sum(page_views), 0) AS page_views_30m,
      COALESCE(sum(page_views_5m), 0) AS page_views_5m,
      max(latest_at) AS latest_at
    FROM realtime_aggregates
  ),
  realtime_rows AS (
    SELECT
      bucket.bucket,
      COALESCE(aggregate.page_views, 0) AS page_views,
      COALESCE(aggregate.visitors, 0) AS visitors
    FROM realtime_buckets AS bucket
    LEFT JOIN realtime_aggregates AS aggregate USING (bucket)
    ORDER BY bucket.bucket
  )
  SELECT json_object(
    'generatedAt', ?3,
    'windowMinutes', 5,
    'activeVisitors', active_totals.visitors,
    'activeSessions', active_totals.sessions,
    'pageViews5m', recent_totals.page_views_5m,
    'pageViews30m', recent_totals.page_views_30m,
    'latestAt', recent_totals.latest_at,
    'series', COALESCE((
      SELECT json_group_array(json_object(
        'bucket', bucket,
        'pageViews', page_views,
        'visitors', visitors
      ) ORDER BY bucket)
      FROM realtime_rows
    ), json('[]'))
  ) AS pulse
  FROM active_totals CROSS JOIN recent_totals
`;
