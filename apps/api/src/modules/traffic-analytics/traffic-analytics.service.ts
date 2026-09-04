import { createHmac, randomUUID } from "node:crypto";

import {
  Injectable,
  ServiceUnavailableException,
  TooManyRequestsException,
} from "@nestjs/common";

import { dbPool } from "../../db";

import {
  boundedTrafficInteger,
  classifyTrafficDevice,
  classifyTrafficSource,
  isExcludedTrafficPath,
  normalizeTrafficCampaignToken,
  normalizeTrafficCountryCode,
  normalizeTrafficPath,
  normalizeTrafficReferrerHost,
  requireTrafficIdentifier,
  TRAFFIC_DEFAULT_RETENTION_DAYS,
  TRAFFIC_MAX_ENGAGED_SECONDS,
  TRAFFIC_PAGE_VIEW_PREFIX,
  trafficPageViewRangeKey,
  TRAFFIC_SESSION_PREFIX,
  TRAFFIC_SESSION_UPPER_BOUND,
  trafficScreenClass,
  type TrafficHeartbeatPayload,
  type TrafficPageViewPayload,
  type TrafficRequestContext,
} from "./traffic-analytics-model";

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const RATE_WINDOW_MS = 60_000;
const MAX_PAGE_VIEWS_PER_SESSION_WINDOW = 120;
const MAX_HEARTBEATS_PER_SESSION_WINDOW = 4;
const MAX_RATE_LIMIT_ENTRIES = 10_000;
const MAX_GLOBAL_EVENTS_PER_WINDOW = 5_000;

type RateLimitState = {
  windowStartedAt: number;
  pageViews: number;
  heartbeats: number;
};

function retentionDays(): number {
  return boundedTrafficInteger(
    process.env.TRAFFIC_ANALYTICS_RETENTION_DAYS,
    TRAFFIC_DEFAULT_RETENTION_DAYS,
    7,
    365,
  );
}

function analyticsSecret(): string {
  const configured =
    process.env.TRAFFIC_ANALYTICS_HASH_SECRET
    || process.env.AUTH_SESSION_SECRET
    || process.env.AUTH_STATE_SECRET;
  if (configured?.trim()) return `traffic-v1:${configured.trim()}`;
  if (process.env.NODE_ENV === "production") {
    throw new ServiceUnavailableException(
      "트래픽 분석 수집 키가 설정되지 않았습니다.",
    );
  }
  return "traffic-v1:toonspectrum-local-development";
}

function hashIdentifier(kind: "visitor" | "session", value: string): string {
  return createHmac("sha256", analyticsSecret())
    .update(`${kind}:${value}`)
    .digest("hex");
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

@Injectable()
export class TrafficAnalyticsService {
  private lastCleanupAt = 0;
  private globalWindowStartedAt = 0;
  private globalEvents = 0;
  private cleanupPromise: Promise<void> | null = null;
  private readonly rateLimits = new Map<string, RateLimitState>();

  private enforceRateLimit(
    sessionHash: string,
    kind: "page-view" | "heartbeat",
  ): void {
    const now = Date.now();
    if (now - this.globalWindowStartedAt >= RATE_WINDOW_MS) {
      this.globalWindowStartedAt = now;
      this.globalEvents = 0;
    }
    this.globalEvents += 1;
    if (this.globalEvents > MAX_GLOBAL_EVENTS_PER_WINDOW) {
      throw new TooManyRequestsException("트래픽 수집 요청이 너무 많습니다.");
    }

    const current = this.rateLimits.get(sessionHash);
    if (!current && this.rateLimits.size >= MAX_RATE_LIMIT_ENTRIES) {
      for (const [key, entry] of this.rateLimits) {
        if (now - entry.windowStartedAt >= RATE_WINDOW_MS) {
          this.rateLimits.delete(key);
        }
      }
      if (this.rateLimits.size >= MAX_RATE_LIMIT_ENTRIES) {
        throw new TooManyRequestsException("트래픽 수집 요청이 너무 많습니다.");
      }
    }

    const state =
      !current || now - current.windowStartedAt >= RATE_WINDOW_MS
        ? { windowStartedAt: now, pageViews: 0, heartbeats: 0 }
        : current;
    if (kind === "page-view") {
      state.pageViews += 1;
      if (state.pageViews > MAX_PAGE_VIEWS_PER_SESSION_WINDOW) {
        throw new TooManyRequestsException("트래픽 수집 요청이 너무 많습니다.");
      }
    } else {
      state.heartbeats += 1;
      if (state.heartbeats > MAX_HEARTBEATS_PER_SESSION_WINDOW) {
        throw new TooManyRequestsException("트래픽 수집 요청이 너무 많습니다.");
      }
    }
    this.rateLimits.set(sessionHash, state);
  }

  async recordPageView(
    payload: TrafficPageViewPayload,
    context: TrafficRequestContext,
  ): Promise<{ accepted: boolean; excluded?: boolean }> {
    if (context.privacyOptOut) return { accepted: false, excluded: true };

    const path = normalizeTrafficPath(payload.path);
    if (isExcludedTrafficPath(path)) return { accepted: false, excluded: true };

    const device = classifyTrafficDevice(context.userAgent);
    if (device.isBot) return { accepted: false, excluded: true };

    const visitorId = requireTrafficIdentifier(
      payload.visitorId,
      "방문자 식별자",
    );
    const sessionId = requireTrafficIdentifier(
      payload.sessionId,
      "세션 식별자",
    );
    const occurredAt = new Date();
    const visitorHash = hashIdentifier("visitor", visitorId);
    const sessionHash = hashIdentifier("session", sessionId);
    this.enforceRateLimit(sessionHash, "page-view");

    const referrerHost = normalizeTrafficReferrerHost(
      payload.referrer,
      context.referer,
      context.host,
    );
    const source = classifyTrafficSource({
      utmSource: normalizeTrafficCampaignToken(payload.utmSource),
      utmMedium: normalizeTrafficCampaignToken(payload.utmMedium),
      utmCampaign: normalizeTrafficCampaignToken(payload.utmCampaign),
      referrerHost,
    });
    const screenWidth = boundedTrafficInteger(
      payload.screenWidth,
      0,
      0,
      20_000,
    );
    const screenHeight = boundedTrafficInteger(
      payload.screenHeight,
      0,
      0,
      20_000,
    );
    const loadTimeMs =
      boundedTrafficInteger(payload.loadTimeMs, 0, 0, 120_000) || null;
    const countryCode = normalizeTrafficCountryCode(context.countryCode);
    const eventKey = `${trafficPageViewRangeKey(occurredAt)}:${randomUUID()}`;
    const sessionKey = `${TRAFFIC_SESSION_PREFIX}${sessionHash}`;
    const screenClass = trafficScreenClass(screenWidth, screenHeight);

    const eventValue = {
      version: 1,
      occurredAt: occurredAt.toISOString(),
      visitorHash,
      sessionHash,
      path,
      referrerHost,
      source: source.source,
      medium: source.medium,
      campaign: source.campaign,
      countryCode,
      deviceType: device.deviceType,
      browser: device.browser,
      os: device.os,
      screenClass,
      loadTimeMs,
      isBot: false,
    };
    const sessionValue = {
      version: 1,
      visitorHash,
      firstSeenAt: occurredAt.toISOString(),
      lastSeenAt: occurredAt.toISOString(),
      entryPath: path,
      lastPath: path,
      referrerHost,
      source: source.source,
      medium: source.medium,
      campaign: source.campaign,
      countryCode,
      deviceType: device.deviceType,
      browser: device.browser,
      os: device.os,
      screenClass,
      pageViews: 1,
      engagedSeconds: 0,
      isBot: false,
    };

    await dbPool.query(
      `
        WITH inserted_event AS (
          INSERT INTO app_setting (key, value, "updatedAt")
          VALUES ($1, $2::jsonb, $3)
          RETURNING 1
        )
        INSERT INTO app_setting (key, value, "updatedAt")
        SELECT $4, $5::jsonb, $3
        FROM inserted_event
        ON CONFLICT (key) DO UPDATE SET
          value =
            app_setting.value
            || jsonb_strip_nulls(EXCLUDED.value)
            || jsonb_build_object(
              'firstSeenAt',
                COALESCE(app_setting.value->'firstSeenAt', EXCLUDED.value->'firstSeenAt'),
              'entryPath',
                COALESCE(app_setting.value->'entryPath', EXCLUDED.value->'entryPath'),
              'referrerHost',
                COALESCE(app_setting.value->'referrerHost', EXCLUDED.value->'referrerHost'),
              'source',
                COALESCE(app_setting.value->'source', EXCLUDED.value->'source'),
              'medium',
                COALESCE(app_setting.value->'medium', EXCLUDED.value->'medium'),
              'campaign',
                COALESCE(app_setting.value->'campaign', EXCLUDED.value->'campaign'),
              'pageViews',
                COALESCE((app_setting.value->>'pageViews')::integer, 0) + 1,
              'engagedSeconds',
                GREATEST(
                  COALESCE((app_setting.value->>'engagedSeconds')::integer, 0),
                  COALESCE((EXCLUDED.value->>'engagedSeconds')::integer, 0)
                )
            ),
          "updatedAt" = GREATEST(app_setting."updatedAt", EXCLUDED."updatedAt")
      `,
      [
        eventKey,
        json(eventValue),
        occurredAt,
        sessionKey,
        json(sessionValue),
      ],
    );

    this.scheduleCleanup();
    return { accepted: true };
  }

  async recordHeartbeat(
    payload: TrafficHeartbeatPayload,
    context: TrafficRequestContext,
  ): Promise<{ accepted: boolean; excluded?: boolean }> {
    if (context.privacyOptOut) return { accepted: false, excluded: true };

    const path = normalizeTrafficPath(payload.path);
    if (isExcludedTrafficPath(path)) return { accepted: false, excluded: true };

    const device = classifyTrafficDevice(context.userAgent);
    if (device.isBot) return { accepted: false, excluded: true };

    const visitorId = requireTrafficIdentifier(
      payload.visitorId,
      "방문자 식별자",
    );
    const sessionId = requireTrafficIdentifier(
      payload.sessionId,
      "세션 식별자",
    );
    const occurredAt = new Date();
    const visitorHash = hashIdentifier("visitor", visitorId);
    const sessionHash = hashIdentifier("session", sessionId);
    this.enforceRateLimit(sessionHash, "heartbeat");
    const engagedSeconds = boundedTrafficInteger(
      payload.engagedSeconds,
      0,
      0,
      TRAFFIC_MAX_ENGAGED_SECONDS,
    );
    const sessionKey = `${TRAFFIC_SESSION_PREFIX}${sessionHash}`;
    const sessionValue = {
      version: 1,
      visitorHash,
      firstSeenAt: occurredAt.toISOString(),
      lastSeenAt: occurredAt.toISOString(),
      entryPath: path,
      lastPath: path,
      countryCode: normalizeTrafficCountryCode(context.countryCode),
      deviceType: device.deviceType,
      browser: device.browser,
      os: device.os,
      pageViews: 0,
      engagedSeconds,
      isBot: false,
    };

    await dbPool.query(
      `
        INSERT INTO app_setting (key, value, "updatedAt")
        VALUES ($1, $2::jsonb, $3)
        ON CONFLICT (key) DO UPDATE SET
          value =
            app_setting.value
            || jsonb_strip_nulls(EXCLUDED.value)
            || jsonb_build_object(
              'firstSeenAt',
                COALESCE(app_setting.value->'firstSeenAt', EXCLUDED.value->'firstSeenAt'),
              'entryPath',
                COALESCE(app_setting.value->'entryPath', EXCLUDED.value->'entryPath'),
              'pageViews',
                COALESCE((app_setting.value->>'pageViews')::integer, 0),
              'engagedSeconds',
                GREATEST(
                  COALESCE((app_setting.value->>'engagedSeconds')::integer, 0),
                  COALESCE((EXCLUDED.value->>'engagedSeconds')::integer, 0)
                )
            ),
          "updatedAt" = GREATEST(app_setting."updatedAt", EXCLUDED."updatedAt")
      `,
      [sessionKey, json(sessionValue), occurredAt],
    );

    this.scheduleCleanup();
    return { accepted: true };
  }

  private scheduleCleanup(): void {
    const now = Date.now();
    if (this.cleanupPromise || now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) {
      return;
    }
    this.lastCleanupAt = now;
    this.cleanupPromise = this.cleanup()
      .catch(() => {
        // Retention is best-effort and must never fail a user request.
      })
      .finally(() => {
        this.cleanupPromise = null;
      });
  }

  private async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - retentionDays() * 24 * 60 * 60 * 1_000);
    await dbPool.query(
      `
        DELETE FROM app_setting
        WHERE (
          key >= $1
          AND key < $2
        ) OR (
          key >= $3
          AND key < $4
          AND "updatedAt" < $5
        )
      `,
      [
        TRAFFIC_PAGE_VIEW_PREFIX,
        trafficPageViewRangeKey(cutoff),
        TRAFFIC_SESSION_PREFIX,
        TRAFFIC_SESSION_UPPER_BOUND,
        cutoff,
      ],
    );
  }
}
