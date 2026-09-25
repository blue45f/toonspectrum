import { dbPool } from "../../db";

import type {
  TrafficShareChannel,
  TrafficShareOutcome,
} from "./traffic-analytics-model";

const RETENTION_ADVISORY_LOCK = "toonspectrum:traffic-analytics:retention:v2";

export type TrafficSessionRecord = Readonly<{
  sessionHash: string;
  visitorHash: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  entryPath: string;
  lastPath: string;
  referrerHost: string | null;
  source: string;
  medium: string;
  campaign: string | null;
  countryCode: string | null;
  deviceType: string;
  browser: string;
  os: string;
  screenClass: string;
  pageViews: number;
  engagedSeconds: number;
  isBot: boolean;
}>;

export type TrafficPageViewRecord = Readonly<{
  id: string;
  occurredAt: Date;
  visitorHash: string;
  sessionHash: string;
  path: string;
  title: string | null;
  referrerHost: string | null;
  source: string;
  medium: string;
  campaign: string | null;
  countryCode: string | null;
  deviceType: string;
  browser: string;
  os: string;
  screenClass: string;
  loadTimeMs: number | null;
  isBot: boolean;
}>;

export type TrafficShareEventRecord = Readonly<{
  id: string;
  occurredAt: Date;
  visitorHash: string;
  sessionHash: string;
  path: string;
  channel: TrafficShareChannel;
  outcome: TrafficShareOutcome;
  countryCode: string | null;
  deviceType: string;
  browser: string;
  os: string;
}>;

export async function persistTrafficPageView(input: {
  event: TrafficPageViewRecord;
  session: TrafficSessionRecord;
}): Promise<void> {
  const { event, session } = input;
  if (event.sessionHash !== session.sessionHash || event.visitorHash !== session.visitorHash) {
    throw new Error("트래픽 세션과 이벤트 소유자가 일치하지 않습니다.");
  }
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    // PostgreSQL은 한 명령의 CTE에서 같은 row를 두 번 수정할 수 없어 별도 명령으로 나눈다.
    await client.query(
      `
        INSERT INTO public.traffic_session (
          session_hash,
          visitor_hash,
          first_seen_at,
          last_seen_at,
          entry_path,
          last_path,
          referrer_host,
          source,
          medium,
          campaign,
          country_code,
          device_type,
          browser,
          os,
          screen_class,
          page_views,
          engaged_seconds,
          is_bot,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          0,
          $16,
          $17,
          $4
        )
        ON CONFLICT (session_hash) DO UPDATE SET
          entry_path = CASE
            WHEN public.traffic_session.page_views = 0
              THEN EXCLUDED.entry_path
            ELSE public.traffic_session.entry_path
          END,
          referrer_host = CASE
            WHEN public.traffic_session.page_views = 0
              THEN EXCLUDED.referrer_host
            ELSE public.traffic_session.referrer_host
          END,
          source = CASE
            WHEN public.traffic_session.page_views = 0
              THEN EXCLUDED.source
            ELSE public.traffic_session.source
          END,
          medium = CASE
            WHEN public.traffic_session.page_views = 0
              THEN EXCLUDED.medium
            ELSE public.traffic_session.medium
          END,
          campaign = CASE
            WHEN public.traffic_session.page_views = 0
              THEN EXCLUDED.campaign
            ELSE public.traffic_session.campaign
          END,
          last_seen_at = GREATEST(
            public.traffic_session.last_seen_at,
            EXCLUDED.last_seen_at
          ),
          last_path = CASE
            WHEN EXCLUDED.last_seen_at >= public.traffic_session.last_seen_at
              THEN EXCLUDED.last_path
            ELSE public.traffic_session.last_path
          END,
          country_code = COALESCE(
            public.traffic_session.country_code,
            EXCLUDED.country_code
          ),
          device_type = CASE
            WHEN EXCLUDED.last_seen_at >= public.traffic_session.last_seen_at
              THEN EXCLUDED.device_type
            ELSE public.traffic_session.device_type
          END,
          browser = CASE
            WHEN EXCLUDED.last_seen_at >= public.traffic_session.last_seen_at
              THEN EXCLUDED.browser
            ELSE public.traffic_session.browser
          END,
          os = CASE
            WHEN EXCLUDED.last_seen_at >= public.traffic_session.last_seen_at
              THEN EXCLUDED.os
            ELSE public.traffic_session.os
          END,
          screen_class = CASE
            WHEN EXCLUDED.last_seen_at >= public.traffic_session.last_seen_at
              THEN COALESCE(
                NULLIF(EXCLUDED.screen_class, 'unknown'),
                public.traffic_session.screen_class
              )
            ELSE public.traffic_session.screen_class
          END,
          engaged_seconds = GREATEST(
            public.traffic_session.engaged_seconds,
            EXCLUDED.engaged_seconds
          ),
          updated_at = GREATEST(
            public.traffic_session.updated_at,
            EXCLUDED.updated_at
          )
        WHERE public.traffic_session.visitor_hash = EXCLUDED.visitor_hash
      `,
      [session.sessionHash, session.visitorHash, session.firstSeenAt, session.lastSeenAt,
        session.entryPath, session.lastPath, session.referrerHost, session.source,
        session.medium, session.campaign, session.countryCode, session.deviceType,
        session.browser, session.os, session.screenClass, session.engagedSeconds, session.isBot],
    );
    await client.query(
      `
      WITH admitted_session AS (
        SELECT session_hash, visitor_hash FROM public.traffic_session
        WHERE session_hash = $4 AND visitor_hash = $3
      ),
      inserted_event AS (
        INSERT INTO public.traffic_page_view (
          id,
          occurred_at,
          visitor_hash,
          session_hash,
          path,
          title,
          referrer_host,
          source,
          medium,
          campaign,
          country_code,
          device_type,
          browser,
          os,
          screen_class,
          load_time_ms,
          is_bot
        )
        SELECT
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17
        FROM admitted_session
        ON CONFLICT (id) DO NOTHING
        RETURNING session_hash, visitor_hash
      )
      UPDATE public.traffic_session AS target
      SET page_views = target.page_views + 1
      FROM inserted_event
      WHERE target.session_hash = inserted_event.session_hash
        AND target.visitor_hash = inserted_event.visitor_hash
      `,
      [event.id, event.occurredAt, event.visitorHash, event.sessionHash, event.path,
        event.title, event.referrerHost, event.source, event.medium, event.campaign,
        event.countryCode, event.deviceType, event.browser, event.os, event.screenClass,
        event.loadTimeMs, event.isBot],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function persistTrafficHeartbeat(input: {
  session: TrafficSessionRecord;
}): Promise<void> {
  const { session } = input;
  await dbPool.query(
    `
      INSERT INTO public.traffic_session (
        session_hash,
        visitor_hash,
        first_seen_at,
        last_seen_at,
        entry_path,
        last_path,
        referrer_host,
        source,
        medium,
        campaign,
        country_code,
        device_type,
        browser,
        os,
        screen_class,
        page_views,
        engaged_seconds,
        is_bot,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $4
      )
      ON CONFLICT (session_hash) DO UPDATE SET
        last_seen_at = GREATEST(
          public.traffic_session.last_seen_at,
          EXCLUDED.last_seen_at
        ),
        last_path = CASE
          WHEN EXCLUDED.last_seen_at >= public.traffic_session.last_seen_at
            THEN EXCLUDED.last_path
          ELSE public.traffic_session.last_path
        END,
        country_code = COALESCE(
          public.traffic_session.country_code,
          EXCLUDED.country_code
        ),
        device_type = CASE
          WHEN EXCLUDED.last_seen_at >= public.traffic_session.last_seen_at
            THEN EXCLUDED.device_type
          ELSE public.traffic_session.device_type
        END,
        browser = CASE
          WHEN EXCLUDED.last_seen_at >= public.traffic_session.last_seen_at
            THEN EXCLUDED.browser
          ELSE public.traffic_session.browser
        END,
        os = CASE
          WHEN EXCLUDED.last_seen_at >= public.traffic_session.last_seen_at
            THEN EXCLUDED.os
          ELSE public.traffic_session.os
        END,
        screen_class = CASE
          WHEN EXCLUDED.last_seen_at >= public.traffic_session.last_seen_at
            THEN COALESCE(
              NULLIF(EXCLUDED.screen_class, 'unknown'),
              public.traffic_session.screen_class
            )
          ELSE public.traffic_session.screen_class
        END,
        engaged_seconds = GREATEST(
          public.traffic_session.engaged_seconds,
          EXCLUDED.engaged_seconds
        ),
        updated_at = GREATEST(
          public.traffic_session.updated_at,
          EXCLUDED.updated_at
        )
      WHERE public.traffic_session.visitor_hash = EXCLUDED.visitor_hash
    `,
    [
      session.sessionHash,
      session.visitorHash,
      session.firstSeenAt,
      session.lastSeenAt,
      session.entryPath,
      session.lastPath,
      session.referrerHost,
      session.source,
      session.medium,
      session.campaign,
      session.countryCode,
      session.deviceType,
      session.browser,
      session.os,
      session.screenClass,
      session.pageViews,
      session.engagedSeconds,
      session.isBot,
    ],
  );
}

export async function persistTrafficShareEvent(
  event: TrafficShareEventRecord,
): Promise<void> {
  await dbPool.query(
    `
      INSERT INTO public.traffic_share_event (
        id,
        occurred_at,
        visitor_hash,
        session_hash,
        path,
        channel,
        outcome,
        country_code,
        device_type,
        browser,
        os
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      event.id,
      event.occurredAt,
      event.visitorHash,
      event.sessionHash,
      event.path,
      event.channel,
      event.outcome,
      event.countryCode,
      event.deviceType,
      event.browser,
      event.os,
    ],
  );
}

export async function cleanupExpiredTrafficData(
  retentionDays: number,
  now = new Date(),
): Promise<void> {
  const retentionCutoff = new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1_000,
  );
  await dbPool.query(
    `
      WITH maintenance_lock AS (
        SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired
      ),
      deleted_events AS (
        DELETE FROM public.traffic_page_view
        WHERE occurred_at < $2
          AND (SELECT acquired FROM maintenance_lock)
        RETURNING 1
      ),
      deleted_shares AS (
        DELETE FROM public.traffic_share_event
        WHERE occurred_at < $2
          AND (SELECT acquired FROM maintenance_lock)
        RETURNING 1
      ),
      deleted_sessions AS (
        DELETE FROM public.traffic_session
        WHERE last_seen_at < $2
          AND (SELECT acquired FROM maintenance_lock)
        RETURNING 1
      )
      SELECT
        (SELECT count(*) FROM deleted_events)::integer AS deleted_events,
        (SELECT count(*) FROM deleted_shares)::integer AS deleted_shares,
        (SELECT count(*) FROM deleted_sessions)::integer AS deleted_sessions
    `,
    [RETENTION_ADVISORY_LOCK, retentionCutoff],
  );
}
