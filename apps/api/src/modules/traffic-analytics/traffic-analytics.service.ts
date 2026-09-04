import { createHmac, randomUUID } from "node:crypto";

import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  TooManyRequestsException,
} from "@nestjs/common";

import { dbPool } from "../../db";

const PAGE_VIEW_PREFIX = "traffic:pv:";
const SESSION_PREFIX = "traffic:ss:";
const SESSION_UPPER_BOUND = "traffic:st:";
const DEFAULT_RETENTION_DAYS = 90;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const MAX_PATH_LENGTH = 320;
const MAX_TITLE_LENGTH = 160;
const MAX_REFERRER_LENGTH = 256;
const MAX_CAMPAIGN_TOKEN_LENGTH = 96;
const MAX_ENGAGED_SECONDS = 12 * 60 * 60;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const RATE_WINDOW_MS = 60_000;
const MAX_PAGE_VIEWS_PER_SESSION_WINDOW = 120;
const MAX_HEARTBEATS_PER_SESSION_WINDOW = 4;
const MAX_RATE_LIMIT_ENTRIES = 10_000;
const BOT_PATTERN =
  /\b(bot|crawler|spider|slurp|headlesschrome|lighthouse|pagespeed|facebookexternalhit|twitterbot|bingpreview|preview)\b/iu;

type TrafficPageViewPayload = {
  visitorId?: unknown;
  sessionId?: unknown;
  path?: unknown;
  title?: unknown;
  referrer?: unknown;
  language?: unknown;
  timezone?: unknown;
  screenWidth?: unknown;
  screenHeight?: unknown;
  connectionType?: unknown;
  navigationType?: unknown;
  loadTimeMs?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
};

type TrafficHeartbeatPayload = {
  visitorId?: unknown;
  sessionId?: unknown;
  path?: unknown;
  engagedSeconds?: unknown;
};

export type TrafficRequestContext = {
  userId?: string;
  userAgent?: string;
  host?: string;
  referer?: string;
  countryCode?: string;
};

type DeviceContext = {
  browser: string;
  os: string;
  deviceType: "desktop" | "mobile" | "tablet" | "other";
  isBot: boolean;
};

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

function optionalToken(value: unknown, maximum = MAX_CAMPAIGN_TOKEN_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maximum);
}

function requiredOpaqueIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new BadRequestException(`${label}가 올바르지 않습니다.`);
  }
  const normalized = value.trim();
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new BadRequestException(`${label}가 올바르지 않습니다.`);
  }
  return normalized;
}

export function normalizeTrafficPath(value: unknown): string {
  if (typeof value !== "string") {
    throw new BadRequestException("페이지 경로가 필요합니다.");
  }
  let pathname: string;
  try {
    pathname = new URL(value, "https://traffic.invalid").pathname;
  } catch {
    throw new BadRequestException("페이지 경로가 올바르지 않습니다.");
  }
  const normalized = pathname.replace(/\/{2,}/gu, "/").slice(0, MAX_PATH_LENGTH);
  if (!normalized.startsWith("/") || normalized.startsWith("/api")) {
    throw new BadRequestException("수집할 수 없는 페이지 경로입니다.");
  }
  return normalized || "/";
}

export function isExcludedTrafficPath(path: string): boolean {
  return (
    path === "/admin"
    || path.startsWith("/admin/")
    || path === "/auth/callback"
    || path.startsWith("/auth/callback/")
  );
}

function normalizeHost(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase().replace(/:\d+$/u, "") ?? "";
  return normalized || null;
}

function normalizeReferrerHost(
  value: unknown,
  fallback: string | undefined,
  requestHost: string | undefined,
): string | null {
  const candidate =
    typeof value === "string" && value.trim() ? value.trim() : fallback?.trim();
  if (!candidate) return null;
  try {
    const hostname = new URL(candidate).hostname.toLowerCase();
    if (!hostname || hostname.length > MAX_REFERRER_LENGTH) return null;
    if (hostname === normalizeHost(requestHost)) return null;
    return hostname;
  } catch {
    return null;
  }
}

function normalizeCountryCode(value: string | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/u.test(normalized) ? normalized : null;
}

function normalizeLanguage(value: unknown): string | null {
  const normalized = optionalToken(value, 35);
  return normalized?.replace(/[^A-Za-z0-9_-]/gu, "").slice(0, 35) || null;
}

function normalizeTimezone(value: unknown): string | null {
  const normalized = optionalToken(value, 64);
  return normalized && /^[A-Za-z0-9_+\-/]+$/u.test(normalized)
    ? normalized
    : null;
}

function normalizeNavigationType(value: unknown): string | null {
  const normalized = optionalToken(value, 24)?.toLowerCase();
  return normalized && ["navigate", "reload", "back_forward", "prerender"].includes(normalized)
    ? normalized
    : null;
}

function normalizeConnectionType(value: unknown): string | null {
  const normalized = optionalToken(value, 24)?.toLowerCase();
  return normalized && /^[a-z0-9_-]+$/u.test(normalized) ? normalized : null;
}

function screenClass(width: number, height: number): string {
  const longest = Math.max(width, height);
  const shortest = Math.min(width, height);
  if (shortest <= 0 || longest <= 0) return "unknown";
  if (shortest < 600) return "small";
  if (shortest < 900) return "medium";
  if (longest >= 1_920) return "large";
  return "desktop";
}

export function classifyTrafficDevice(userAgentValue: string | undefined): DeviceContext {
  const userAgent = userAgentValue ?? "";
  const lower = userAgent.toLowerCase();
  const isBot = BOT_PATTERN.test(userAgent);
  const isTablet = /ipad|tablet|kindle|silk|playbook/iu.test(userAgent);
  const isMobile =
    !isTablet && /mobi|iphone|ipod|android.*mobile|windows phone/iu.test(userAgent);

  let browser = "Other";
  if (lower.includes("edg/")) browser = "Edge";
  else if (lower.includes("opr/") || lower.includes("opera")) browser = "Opera";
  else if (lower.includes("samsungbrowser/")) browser = "Samsung Internet";
  else if (lower.includes("firefox/") || lower.includes("fxios/")) browser = "Firefox";
  else if (lower.includes("crios/") || lower.includes("chrome/")) browser = "Chrome";
  else if (lower.includes("safari/")) browser = "Safari";

  let os = "Other";
  if (/iphone|ipad|ipod/iu.test(userAgent)) os = "iOS";
  else if (/android/iu.test(userAgent)) os = "Android";
  else if (/windows/iu.test(userAgent)) os = "Windows";
  else if (/mac os x|macintosh/iu.test(userAgent)) os = "macOS";
  else if (/linux/iu.test(userAgent)) os = "Linux";

  return {
    browser,
    os,
    deviceType: isTablet ? "tablet" : isMobile ? "mobile" : "desktop",
    isBot,
  };
}

function isSearchReferrer(host: string): boolean {
  return /(google\.|bing\.com$|search\.naver\.com$|daum\.net$|yahoo\.|duckduckgo\.com$)/iu.test(
    host,
  );
}

function isSocialReferrer(host: string): boolean {
  return /(instagram\.com$|facebook\.com$|t\.co$|twitter\.com$|x\.com$|youtube\.com$|youtu\.be$|tiktok\.com$|threads\.net$|linkedin\.com$)/iu.test(
    host,
  );
}

export function classifyTrafficSource(input: {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrerHost: string | null;
}): {
  source: string;
  medium: string;
  campaign: string | null;
} {
  if (input.utmSource) {
    return {
      source: input.utmSource.toLowerCase(),
      medium: input.utmMedium?.toLowerCase() || "campaign",
      campaign: input.utmCampaign,
    };
  }
  if (!input.referrerHost) {
    return { source: "direct", medium: "none", campaign: null };
  }
  if (isSearchReferrer(input.referrerHost)) {
    return {
      source: input.referrerHost,
      medium: "organic",
      campaign: null,
    };
  }
  if (isSocialReferrer(input.referrerHost)) {
    return {
      source: input.referrerHost,
      medium: "social",
      campaign: null,
    };
  }
  return {
    source: input.referrerHost,
    medium: "referral",
    campaign: null,
  };
}

function sortableTimestamp(date: Date): string {
  return date.toISOString().replace(/\D/gu, "").slice(0, 17);
}

function pageViewRangeKey(date: Date): string {
  return `${PAGE_VIEW_PREFIX}${sortableTimestamp(date)}`;
}

function retentionDays(): number {
  return boundedInteger(
    process.env.TRAFFIC_ANALYTICS_RETENTION_DAYS,
    DEFAULT_RETENTION_DAYS,
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
    throw new ServiceUnavailableException("트래픽 분석 수집 키가 설정되지 않았습니다.");
  }
  return "traffic-v1:toonspectrum-local-development";
}

function hashIdentifier(kind: "visitor" | "session" | "user", value: string): string {
  return createHmac("sha256", analyticsSecret())
    .update(`${kind}:${value}`)
    .digest("hex");
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

type RateLimitState = {
  windowStartedAt: number;
  pageViews: number;
  heartbeats: number;
};

@Injectable()
export class TrafficAnalyticsService {
  private lastCleanupAt = 0;
  private cleanupPromise: Promise<void> | null = null;
  private readonly rateLimits = new Map<string, RateLimitState>();

  private enforceRateLimit(
    sessionHash: string,
    kind: "page-view" | "heartbeat",
  ): void {
    const now = Date.now();
    const current = this.rateLimits.get(sessionHash);
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

    if (this.rateLimits.size <= MAX_RATE_LIMIT_ENTRIES) return;
    for (const [key, entry] of this.rateLimits) {
      if (now - entry.windowStartedAt >= RATE_WINDOW_MS) {
        this.rateLimits.delete(key);
      }
      if (this.rateLimits.size <= MAX_RATE_LIMIT_ENTRIES) break;
    }
  }

  async recordPageView(
    payload: TrafficPageViewPayload,
    context: TrafficRequestContext,
  ): Promise<{ accepted: boolean; excluded?: boolean }> {
    const path = normalizeTrafficPath(payload.path);
    if (isExcludedTrafficPath(path)) {
      return { accepted: false, excluded: true };
    }

    const visitorId = requiredOpaqueIdentifier(payload.visitorId, "방문자 식별자");
    const sessionId = requiredOpaqueIdentifier(payload.sessionId, "세션 식별자");
    const occurredAt = new Date();
    const visitorHash = hashIdentifier("visitor", visitorId);
    const sessionHash = hashIdentifier("session", sessionId);
    this.enforceRateLimit(sessionHash, "page-view");
    const userHash = context.userId
      ? hashIdentifier("user", context.userId)
      : null;
    const device = classifyTrafficDevice(context.userAgent);
    const referrerHost = normalizeReferrerHost(
      payload.referrer,
      context.referer,
      context.host,
    );
    const source = classifyTrafficSource({
      utmSource: optionalToken(payload.utmSource),
      utmMedium: optionalToken(payload.utmMedium),
      utmCampaign: optionalToken(payload.utmCampaign),
      referrerHost,
    });
    const screenWidth = boundedInteger(payload.screenWidth, 0, 0, 20_000);
    const screenHeight = boundedInteger(payload.screenHeight, 0, 0, 20_000);
    const loadTimeMs = boundedInteger(payload.loadTimeMs, 0, 0, 120_000) || null;
    const language = normalizeLanguage(payload.language);
    const timezone = normalizeTimezone(payload.timezone);
    const countryCode = normalizeCountryCode(context.countryCode);
    const title = optionalToken(payload.title, MAX_TITLE_LENGTH);
    const connectionType = normalizeConnectionType(payload.connectionType);
    const navigationType = normalizeNavigationType(payload.navigationType);
    const eventKey = `${pageViewRangeKey(occurredAt)}:${randomUUID()}`;
    const sessionKey = `${SESSION_PREFIX}${sessionHash}`;

    const eventValue = {
      version: 1,
      occurredAt: occurredAt.toISOString(),
      visitorHash,
      sessionHash,
      userHash,
      path,
      title,
      referrerHost,
      source: source.source,
      medium: source.medium,
      campaign: source.campaign,
      countryCode,
      deviceType: device.deviceType,
      browser: device.browser,
      os: device.os,
      language,
      timezone,
      screenClass: screenClass(screenWidth, screenHeight),
      screenWidth,
      screenHeight,
      connectionType,
      navigationType,
      loadTimeMs,
      isBot: device.isBot,
    };
    const sessionValue = {
      version: 1,
      visitorHash,
      userHash,
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
      language,
      timezone,
      screenClass: screenClass(screenWidth, screenHeight),
      pageViews: 1,
      engagedSeconds: 0,
      isBot: device.isBot,
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
    const path = normalizeTrafficPath(payload.path);
    if (isExcludedTrafficPath(path)) {
      return { accepted: false, excluded: true };
    }

    const visitorId = requiredOpaqueIdentifier(payload.visitorId, "방문자 식별자");
    const sessionId = requiredOpaqueIdentifier(payload.sessionId, "세션 식별자");
    const occurredAt = new Date();
    const visitorHash = hashIdentifier("visitor", visitorId);
    const sessionHash = hashIdentifier("session", sessionId);
    this.enforceRateLimit(sessionHash, "heartbeat");
    const userHash = context.userId
      ? hashIdentifier("user", context.userId)
      : null;
    const device = classifyTrafficDevice(context.userAgent);
    const engagedSeconds = boundedInteger(
      payload.engagedSeconds,
      0,
      0,
      MAX_ENGAGED_SECONDS,
    );
    const sessionKey = `${SESSION_PREFIX}${sessionHash}`;
    const sessionValue = {
      version: 1,
      visitorHash,
      userHash,
      firstSeenAt: occurredAt.toISOString(),
      lastSeenAt: occurredAt.toISOString(),
      entryPath: path,
      lastPath: path,
      countryCode: normalizeCountryCode(context.countryCode),
      deviceType: device.deviceType,
      browser: device.browser,
      os: device.os,
      pageViews: 0,
      engagedSeconds,
      isBot: device.isBot,
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
    if (this.cleanupPromise || now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    this.lastCleanupAt = now;
    this.cleanupPromise = this.cleanup()
      .catch(() => {
        // Telemetry retention is best-effort and must never fail a user request.
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
        PAGE_VIEW_PREFIX,
        pageViewRangeKey(cutoff),
        SESSION_PREFIX,
        SESSION_UPPER_BOUND,
        cutoff,
      ],
    );
  }
}
