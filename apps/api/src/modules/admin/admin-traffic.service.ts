import { Injectable } from "@nestjs/common";

import { dbPool } from "../../db";

import { requireAdminUser } from "./admin-types";

const PAGE_VIEW_PREFIX = "traffic:pv:";
const SESSION_PREFIX = "traffic:ss:";
const SESSION_UPPER_BOUND = "traffic:st:";
const SUPPORTED_RANGES = [1, 7, 30, 90] as const;

function sortableTimestamp(date: Date): string {
  return date.toISOString().replace(/\D/gu, "").slice(0, 17);
}

function pageViewRangeKey(date: Date): string {
  return `${PAGE_VIEW_PREFIX}${sortableTimestamp(date)}`;
}

function normalizeRangeDays(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 7;
  const closest = SUPPORTED_RANGES.reduce((selected, candidate) =>
    Math.abs(candidate - parsed) < Math.abs(selected - parsed)
      ? candidate
      : selected,
  );
  return closest;
}

function bucketSeconds(days: number): number {
  if (days <= 1) return 60 * 60;
  if (days <= 7) return 6 * 60 * 60;
  return 24 * 60 * 60;
}

function retentionDays(): number {
  const parsed = Number(process.env.TRAFFIC_ANALYTICS_RETENTION_DAYS);
  if (!Number.isFinite(parsed)) return 90;
  return Math.min(365, Math.max(7, Math.round(parsed)));
}

type AnalyticsRow = {
  analytics: Record<string, unknown> | null;
};

type PulseRow = {
  activeVisitors: number | string | null;
  activeSessions: number | string | null;
  pageViews5m: number | string | null;
  pageViews30m: number | string | null;
  latestAt: Date | string | null;
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

@Injectable()
export class AdminTrafficService {
  async getOverview(userId: string, daysValue: unknown) {
    await requireAdminUser(userId);

    const days = normalizeRangeDays(daysValue);
    const now = new Date();
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);
    const end = new Date(now.getTime() + 1_000);
    const seconds = bucketSeconds(days);

    const result = await dbPool.query<AnalyticsRow>(
      `
        WITH raw_events AS (
          SELECT
            NULLIF(value->>'occurredAt', '')::timestamptz AS occurred_at,
            value->>'visitorHash' AS visitor_hash,
            value->>'sessionHash' AS session_hash,
            COALESCE(NULLIF(value->>'path', ''), '/') AS path,
            NULLIF(value->>'title', '') AS title,
            COALESCE(NULLIF(value->>'source', ''), 'direct') AS source,
            COALESCE(NULLIF(value->>'medium', ''), 'none') AS medium,
            NULLIF(value->>'countryCode', '') AS country_code,
            COALESCE(NULLIF(value->>'deviceType', ''), 'other') AS device_type,
            COALESCE(NULLIF(value->>'browser', ''), 'Other') AS browser,
            COALESCE(NULLIF(value->>'os', ''), 'Other') AS os,
            COALESCE(NULLIF(value->>'screenClass', ''), 'unknown') AS screen_class,
            NULLIF(value->>'loadTimeMs', '')::integer AS load_time_ms,
            COALESCE(NULLIF(value->>'isBot', '')::boolean, false) AS is_bot
          FROM app_setting
          WHERE key >= $2
            AND key < $3
        ),
        events AS (
          SELECT *
          FROM raw_events
          WHERE occurred_at >= $1
            AND occurred_at <= $5
            AND visitor_hash IS NOT NULL
            AND session_hash IS NOT NULL
            AND NOT is_bot
        ),
        raw_sessions AS (
          SELECT
            value->>'visitorHash' AS visitor_hash,
            substring(key from char_length($6) + 1) AS session_hash,
            NULLIF(value->>'firstSeenAt', '')::timestamptz AS first_seen_at,
            NULLIF(value->>'lastSeenAt', '')::timestamptz AS last_seen_at,
            COALESCE(NULLIF(value->>'entryPath', ''), '/') AS entry_path,
            COALESCE(NULLIF(value->>'lastPath', ''), '/') AS last_path,
            COALESCE(NULLIF(value->>'source', ''), 'direct') AS source,
            COALESCE(NULLIF(value->>'medium', ''), 'none') AS medium,
            COALESCE(NULLIF(value->>'deviceType', ''), 'other') AS device_type,
            COALESCE(NULLIF(value->>'browser', ''), 'Other') AS browser,
            COALESCE(NULLIF(value->>'countryCode', ''), 'Unknown') AS country_code,
            COALESCE(NULLIF(value->>'pageViews', '')::integer, 0) AS page_views,
            COALESCE(NULLIF(value->>'engagedSeconds', '')::integer, 0) AS engaged_seconds,
            COALESCE(NULLIF(value->>'isBot', '')::boolean, false) AS is_bot,
            "updatedAt" AS updated_at
          FROM app_setting
          WHERE key >= $7
            AND key < $10
            AND "updatedAt" >= $1
        ),
        sessions AS (
          SELECT *
          FROM raw_sessions
          WHERE first_seen_at >= $1
            AND first_seen_at <= $5
            AND visitor_hash IS NOT NULL
            AND NOT is_bot
        ),
        active_sessions AS (
          SELECT *
          FROM raw_sessions
          WHERE updated_at >= $5 - interval '5 minutes'
            AND visitor_hash IS NOT NULL
            AND NOT is_bot
        ),
        series_rows AS (
          SELECT
            to_timestamp(
              floor(extract(epoch from occurred_at) / $4) * $4
            ) AS bucket,
            count(*)::integer AS page_views,
            count(DISTINCT visitor_hash)::integer AS visitors,
            count(DISTINCT session_hash)::integer AS sessions
          FROM events
          GROUP BY bucket
          ORDER BY bucket
        ),
        realtime_rows AS (
          SELECT
            date_trunc('minute', occurred_at) AS bucket,
            count(*)::integer AS page_views,
            count(DISTINCT visitor_hash)::integer AS visitors
          FROM events
          WHERE occurred_at >= $5 - interval '30 minutes'
          GROUP BY bucket
          ORDER BY bucket
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
          'generatedAt', $5,
          'rangeDays', $8::integer,
          'bucketSeconds', $4::integer,
          'status',
            CASE WHEN (SELECT page_views FROM totals) > 0 THEN 'live' ELSE 'empty' END,
          'storageMode', 'first-party-kv-v1',
          'retentionDays', $9::integer,
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
            'activeSessions',
              COALESCE((SELECT count(*) FROM active_sessions), 0),
            'pageViews5m',
              COALESCE((
                SELECT count(*) FROM events
                WHERE occurred_at >= $5 - interval '5 minutes'
              ), 0),
            'pageViews30m',
              COALESCE((
                SELECT count(*) FROM events
                WHERE occurred_at >= $5 - interval '30 minutes'
              ), 0),
            'latestAt', (SELECT latest_at FROM totals)
          ),
          'totals', jsonb_build_object(
            'pageViews', COALESCE((SELECT page_views FROM totals), 0),
            'uniqueVisitors', COALESCE((SELECT visitors FROM totals), 0),
            'sessions', COALESCE((SELECT sessions FROM totals), 0),
            'returningVisitors',
              COALESCE((
                SELECT count(*) FROM visitor_frequency WHERE session_count > 1
              ), 0),
            'coverageStartAt', (SELECT coverage_start_at FROM totals),
            'latestAt', (SELECT latest_at FROM totals),
            'averageLoadTimeMs', (SELECT average_load_time_ms FROM totals)
          ),
          'engagement', jsonb_build_object(
            'engagedSessions', COALESCE((SELECT engaged_sessions FROM engagement), 0),
            'bounceRate',
              CASE
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
          'series',
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'bucket', bucket,
                  'pageViews', page_views,
                  'visitors', visitors,
                  'sessions', sessions
                )
                ORDER BY bucket
              )
              FROM series_rows
            ), '[]'::jsonb),
          'realtimeSeries',
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'bucket', bucket,
                  'pageViews', page_views,
                  'visitors', visitors
                )
                ORDER BY bucket
              )
              FROM realtime_rows
            ), '[]'::jsonb),
          'topPages',
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'path', path,
                  'title', title,
                  'pageViews', page_views,
                  'visitors', visitors,
                  'sessions', sessions,
                  'averageLoadTimeMs', average_load_time_ms
                )
                ORDER BY page_views DESC, visitors DESC, path
              )
              FROM top_page_rows
            ), '[]'::jsonb),
          'sources',
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'source', source,
                  'medium', medium,
                  'pageViews', page_views,
                  'visitors', visitors
                )
                ORDER BY page_views DESC, visitors DESC, source
              )
              FROM source_rows
            ), '[]'::jsonb),
          'devices',
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'label', label,
                  'pageViews', page_views,
                  'visitors', visitors
                )
                ORDER BY page_views DESC, label
              )
              FROM device_rows
            ), '[]'::jsonb),
          'browsers',
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'label', label,
                  'pageViews', page_views,
                  'visitors', visitors
                )
                ORDER BY page_views DESC, label
              )
              FROM browser_rows
            ), '[]'::jsonb),
          'countries',
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'label', label,
                  'pageViews', page_views,
                  'visitors', visitors
                )
                ORDER BY page_views DESC, label
              )
              FROM country_rows
            ), '[]'::jsonb),
          'recent',
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'occurredAt', occurred_at,
                  'path', path,
                  'source', source,
                  'medium', medium,
                  'countryCode', country_code,
                  'deviceType', device_type,
                  'browser', browser
                )
                ORDER BY occurred_at DESC
              )
              FROM recent_rows
            ), '[]'::jsonb)
        ) AS analytics
      `,
      [
        start,
        pageViewRangeKey(start),
        pageViewRangeKey(end),
        seconds,
        now,
        SESSION_PREFIX,
        SESSION_PREFIX,
        days,
        retentionDays(),
        SESSION_UPPER_BOUND,
      ],
    );

    return (
      result.rows[0]?.analytics ?? {
        generatedAt: now.toISOString(),
        rangeDays: days,
        status: "empty",
      }
    );
  }

  async getPulse(userId: string) {
    await requireAdminUser(userId);

    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1_000);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1_000);
    const result = await dbPool.query<PulseRow>(
      `
        WITH active_sessions AS (
          SELECT
            value->>'visitorHash' AS visitor_hash
          FROM app_setting
          WHERE key >= $1
            AND key < $2
            AND "updatedAt" >= $3
            AND NOT COALESCE(NULLIF(value->>'isBot', '')::boolean, false)
        ),
        recent_page_views AS (
          SELECT
            NULLIF(value->>'occurredAt', '')::timestamptz AS occurred_at
          FROM app_setting
          WHERE key >= $4
            AND key < $5
            AND NOT COALESCE(NULLIF(value->>'isBot', '')::boolean, false)
        )
        SELECT
          (SELECT count(DISTINCT visitor_hash) FROM active_sessions)
            AS "activeVisitors",
          (SELECT count(*) FROM active_sessions)
            AS "activeSessions",
          (
            SELECT count(*) FROM recent_page_views
            WHERE occurred_at >= $3
          ) AS "pageViews5m",
          (SELECT count(*) FROM recent_page_views)
            AS "pageViews30m",
          (SELECT max(occurred_at) FROM recent_page_views)
            AS "latestAt"
      `,
      [
        SESSION_PREFIX,
        SESSION_UPPER_BOUND,
        fiveMinutesAgo,
        pageViewRangeKey(thirtyMinutesAgo),
        pageViewRangeKey(new Date(now.getTime() + 1_000)),
      ],
    );
    const row = result.rows[0];
    return {
      generatedAt: now.toISOString(),
      windowMinutes: 5,
      activeVisitors: toNumber(row?.activeVisitors),
      activeSessions: toNumber(row?.activeSessions),
      pageViews5m: toNumber(row?.pageViews5m),
      pageViews30m: toNumber(row?.pageViews30m),
      latestAt:
        row?.latestAt instanceof Date
          ? row.latestAt.toISOString()
          : row?.latestAt ?? null,
    };
  }
}
