import { createHmac, randomUUID } from "node:crypto";

import {
  Injectable,
  ServiceUnavailableException,
  TooManyRequestsException,
} from "@nestjs/common";

import {
  boundedTrafficInteger,
  classifyTrafficDevice,
  classifyTrafficSource,
  isExcludedTrafficPath,
  normalizeTrafficCampaignToken,
  normalizeTrafficCountryCode,
  normalizeTrafficPath,
  normalizeTrafficReferrerHost,
  normalizeTrafficScreenClass,
  requireTrafficIdentifier,
  TRAFFIC_DEFAULT_RETENTION_DAYS,
  TRAFFIC_MAX_ENGAGED_SECONDS,
  type TrafficHeartbeatPayload,
  type TrafficPageViewPayload,
  type TrafficRequestContext,
} from "./traffic-analytics-model";
import {
  cleanupExpiredTrafficData,
  persistTrafficHeartbeat,
  persistTrafficPageView,
} from "./traffic-analytics-store";

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
    const screenClass = normalizeTrafficScreenClass(payload.screenClass);
    const countryCode = normalizeTrafficCountryCode(context.countryCode);
    const loadTimeMs =
      boundedTrafficInteger(payload.loadTimeMs, 0, 0, 120_000) || null;

    await persistTrafficPageView({
      event: {
        id: randomUUID(),
        occurredAt,
        visitorHash,
        sessionHash,
        path,
        title: null,
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
      },
      session: {
        sessionHash,
        visitorHash,
        firstSeenAt: occurredAt,
        lastSeenAt: occurredAt,
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
      },
    });

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

    await persistTrafficHeartbeat({
      session: {
        sessionHash,
        visitorHash,
        firstSeenAt: occurredAt,
        lastSeenAt: occurredAt,
        entryPath: path,
        lastPath: path,
        referrerHost: null,
        source: "direct",
        medium: "none",
        campaign: null,
        countryCode: normalizeTrafficCountryCode(context.countryCode),
        deviceType: device.deviceType,
        browser: device.browser,
        os: device.os,
        screenClass: "unknown",
        pageViews: 0,
        engagedSeconds,
        isBot: false,
      },
    });

    this.scheduleCleanup();
    return { accepted: true };
  }

  private scheduleCleanup(): void {
    const now = Date.now();
    if (this.cleanupPromise || now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) {
      return;
    }
    this.lastCleanupAt = now;
    this.cleanupPromise = cleanupExpiredTrafficData(retentionDays())
      .catch(() => {
        // Retention is best-effort and must never fail a user request.
      })
      .finally(() => {
        this.cleanupPromise = null;
      });
  }
}
