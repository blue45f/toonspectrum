import { dbPool } from "../../db";

const RETENTION_ADVISORY_LOCK = "toonspectrum:traffic-analytics:retention:v2";

type TrafficSessionRecord = Readonly<{
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

export async function persistTrafficPageView(input: {
  event: TrafficPageViewRecord;
  session: TrafficSessionRecord;
}): Promise<void> {
  const { event, session } = input;
  await dbPool.query(
    `
      WITH admitted AS (
        SELECT NOT EXISTS (
          SELECT 1
          FROM public.traffic_session
          WHERE session_hash = $4
            AND visitor_hash <> $3
        ) AS accepted
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
        FROM admitted
        WHERE accepted
        ON CONFLICT (id) DO NOTHING
        RETURNING 1
      )
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
      SELECT
        $4,
        $3,
        $18,
        $19,
        $20,
        $21,
        $22,
        $23,
        $24,
        $25,
        $26,
        $27,
        $28,
        $29,
        $30,
        1,
        $31,
        $32,
        $19
      FROM inserted_event
      ON CONFLICT (session_hash) DO UPDATE SET
        last_seen_at = GREATEST(
          public.traffic_session.last_seen_at,
          EXCLUDED.last_seen_at
        ),
        last_path = EXCLUDED.last_path,
        country_code = COALESCE(
          public.traffic_session.country_code,
          EXCLUDED.country_code
        ),
        device_type = EXCLUDED.device_type,
        browser = EXCLUDED.browser,
        os = EXCLUDED.os,
        screen_class = EXCLUDED.screen_class,
        page_views = public.traffic_session.page_views + 1,
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
      event.id,
      event.occurredAt,
      event.visitorHash,
      event.sessionHash,
      event.path,
      event.title,
      event.referrerHost,
      event.source,
      event.medium,
      event.campaign,
      event.countryCode,
      event.deviceType,
      event.browser,
      event.os,
      event.screenClass,
      event.loadTimeMs,
      event.isBot,
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
      session.engagedSeconds,
      session.isBot,
    ],
  );
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
        last_path = EXCLUDED.last_path,
        country_code = COALESCE(
          public.traffic_session.country_code,
          EXCLUDED.country_code
        ),
        device_type = EXCLUDED.device_type,
        browser = EXCLUDED.browser,
        os = EXCLUDED.os,
        screen_class = EXCLUDED.screen_class,
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
      deleted_sessions AS (
        DELETE FROM public.traffic_session
        WHERE last_seen_at < $2
          AND (SELECT acquired FROM maintenance_lock)
        RETURNING 1
      )
      SELECT
        (SELECT count(*) FROM deleted_events)::integer AS deleted_events,
        (SELECT count(*) FROM deleted_sessions)::integer AS deleted_sessions
    `,
    [RETENTION_ADVISORY_LOCK, retentionCutoff],
  );
}
