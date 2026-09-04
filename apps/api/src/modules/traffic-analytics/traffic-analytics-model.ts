import { BadRequestException } from "@nestjs/common";

export const TRAFFIC_PAGE_VIEW_PREFIX = "traffic:pv:";
export const TRAFFIC_SESSION_PREFIX = "traffic:ss:";
export const TRAFFIC_SESSION_UPPER_BOUND = "traffic:st:";
export const TRAFFIC_DEFAULT_RETENTION_DAYS = 90;
export const TRAFFIC_MAX_ENGAGED_SECONDS = 12 * 60 * 60;

const MAX_PATH_LENGTH = 320;
const MAX_REFERRER_LENGTH = 256;
const MAX_CAMPAIGN_TOKEN_LENGTH = 96;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const BOT_PATTERN =
  /\b(bot|crawler|spider|slurp|headlesschrome|lighthouse|pagespeed|facebookexternalhit|twitterbot|bingpreview|preview)\b/iu;

export type TrafficPageViewPayload = {
  visitorId?: unknown;
  sessionId?: unknown;
  path?: unknown;
  referrer?: unknown;
  screenWidth?: unknown;
  screenHeight?: unknown;
  loadTimeMs?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
};

export type TrafficHeartbeatPayload = {
  visitorId?: unknown;
  sessionId?: unknown;
  path?: unknown;
  engagedSeconds?: unknown;
};

export type TrafficRequestContext = {
  userAgent?: string;
  host?: string;
  referer?: string;
  countryCode?: string;
  privacyOptOut?: boolean;
};

export type TrafficDeviceContext = {
  browser: string;
  os: string;
  deviceType: "desktop" | "mobile" | "tablet" | "other";
  isBot: boolean;
};

export function boundedTrafficInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

function optionalToken(
  value: unknown,
  maximum = MAX_CAMPAIGN_TOKEN_LENGTH,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maximum);
}

export function normalizeTrafficCampaignToken(value: unknown): string | null {
  const token = optionalToken(value)?.replace(
    /[^A-Za-z0-9._~:-]+/gu,
    "-",
  );
  const normalized = token?.replace(/^-+|-+$/gu, "") ?? "";
  return normalized || null;
}

export function requireTrafficIdentifier(
  value: unknown,
  label: string,
): string {
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

export function normalizeTrafficReferrerHost(
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

export function normalizeTrafficCountryCode(
  value: string | undefined,
): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/u.test(normalized) ? normalized : null;
}

export function trafficScreenClass(width: number, height: number): string {
  const longest = Math.max(width, height);
  const shortest = Math.min(width, height);
  if (shortest <= 0 || longest <= 0) return "unknown";
  if (shortest < 600) return "small";
  if (shortest < 900) return "medium";
  if (longest >= 1_920) return "large";
  return "desktop";
}

export function classifyTrafficDevice(
  userAgentValue: string | undefined,
): TrafficDeviceContext {
  const userAgent = userAgentValue ?? "";
  const lower = userAgent.toLowerCase();
  const isBot = BOT_PATTERN.test(userAgent);
  const isTablet = /ipad|tablet|kindle|silk|playbook/iu.test(userAgent);
  const isMobile =
    !isTablet
    && /mobi|iphone|ipod|android.*mobile|windows phone/iu.test(userAgent);

  let browser = "Other";
  if (lower.includes("edg/")) browser = "Edge";
  else if (lower.includes("opr/") || lower.includes("opera")) browser = "Opera";
  else if (lower.includes("samsungbrowser/")) browser = "Samsung Internet";
  else if (lower.includes("firefox/") || lower.includes("fxios/")) {
    browser = "Firefox";
  } else if (lower.includes("crios/") || lower.includes("chrome/")) {
    browser = "Chrome";
  } else if (lower.includes("safari/")) browser = "Safari";

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
  return /(?:instagram|facebook|twitter|youtube|tiktok)\.com$|(?:t|x)\.co$|youtu\.be$|threads\.net$|linkedin\.com$/iu.test(
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

export function trafficPageViewRangeKey(date: Date): string {
  return `${TRAFFIC_PAGE_VIEW_PREFIX}${sortableTimestamp(date)}`;
}
