import type { ShareEventDetail } from "@/shared/lib/share";

const SHARE_CHANNELS = new Set<ShareEventDetail["channel"]>([
  "native",
  "kakao",
  "naver",
  "line",
  "x",
  "facebook",
  "telegram",
  "email",
  "copy",
  "qr",
]);

const SHARE_OUTCOMES = new Set<ShareEventDetail["outcome"]>([
  "opened",
  "completed",
  "cancelled",
  "failed",
]);

/** Keep the browser-to-collector contract bounded and free of share text, query strings, and URLs. */
export function parseShareAnalyticsDetail(value: unknown): ShareEventDetail | null {
  if (!value || typeof value !== "object") return null;
  const detail = value as Partial<ShareEventDetail>;
  if (
    typeof detail.path !== "string"
    || !detail.path.startsWith("/")
    || detail.path.includes("?")
    || detail.path.includes("#")
    || detail.path.length > 320
    || !SHARE_CHANNELS.has(detail.channel as ShareEventDetail["channel"])
    || !SHARE_OUTCOMES.has(detail.outcome as ShareEventDetail["outcome"])
  ) {
    return null;
  }
  return {
    path: detail.path,
    channel: detail.channel as ShareEventDetail["channel"],
    outcome: detail.outcome as ShareEventDetail["outcome"],
  };
}
