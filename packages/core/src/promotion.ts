/** Creator-owned discovery posts. Shared validation; no remote scraping or paid API. */
export const PROMOTION_KINDS = { series: "작품·신작 소개", trailer: "홍보 영상", process: "작업 과정", feedback: "피드백 요청" } as const;
export const PROMOTION_STAGES = { amateur: "아마추어", debut: "첫 작품·신작", serializing: "연재 작가" } as const;
export const PROMOTION_GENRES = ["판타지", "로맨스", "드라마", "액션", "일상", "코미디", "스릴러", "SF", "무협", "기타"] as const;
export const PROMOTION_COVER_MAX_BYTES = 128 * 1024;
export interface PromotionInput {
  kind: keyof typeof PROMOTION_KINDS;
  stage: keyof typeof PROMOTION_STAGES;
  genre: typeof PROMOTION_GENRES[number];
  title: string;
  seriesTitle: string;
  description: string;
  readingUrl: string;
  videoUrl: string;
  cover: string;
  tags: string[];
  contentWarning: string;
  rightsConfirmed: true;
}
export interface PromotionPost extends PromotionInput {
  id: string;
  author: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  version: number;
  hidden: boolean;
  archived: boolean;
  saved: boolean;
}
export interface PromotionComment { id: string; text: string; author: { id: string; name: string }; createdAt: string }
export interface PromotionPage { items: PromotionPost[]; nextCursor: string | null; hasMore: boolean; canModerate: boolean }
export interface PromotionDetail { post: PromotionPost; comments: PromotionComment[]; canManage: boolean; canModerate: boolean }
export interface PromotionReport { postId: string; title: string; reason: string; createdAt: string; hidden: boolean }
export type PromotionResult<T> = { value: T; error?: never } | { error: string; value?: never };
export function promotionRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function promotionText(value: unknown): string { return typeof value === "string" ? value.replace(/\r\n?/gu, "\n").trim() : ""; }
export function promotionKey<T extends object>(map: T, value: unknown): value is Extract<keyof T, string> {
  return typeof value === "string" && Object.hasOwn(map, value);
}
/** External navigation only. Never fetched by the server. Reject local hosts and credentials. */
export function safePromotionUrl(value: unknown): string | null {
  const raw = promotionText(value);
  if (!raw) return "";
  if (raw.length > 1000 || [...raw].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || !host.includes(".") || /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(host)
      || host.endsWith(".localhost") || host.endsWith(".local") || host.startsWith("[")) return null;
    return url.href;
  } catch { return null; }
}
export function promotionVideo(value: unknown): { provider: "YouTube" | "Vimeo"; embedUrl: string; url: string } | null {
  const href = safePromotionUrl(value);
  if (!href) return null;
  const url = new URL(href);
  const host = url.hostname;
  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "youtu.be" && parts.length === 1) id = parts[0];
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    if (parts.length === 2 && ["shorts", "embed"].includes(parts[0])) id = parts[1];
  }
  if (id && /^[A-Za-z0-9_-]{11}$/u.test(id)) return { provider: "YouTube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}`, url: `https://www.youtube.com/watch?v=${id}` };
  if (["vimeo.com", "www.vimeo.com"].includes(host) && parts.length === 1 && /^\d{6,12}$/u.test(parts[0])) {
    return { provider: "Vimeo", embedUrl: `https://player.vimeo.com/video/${parts[0]}?dnt=1`, url: `https://vimeo.com/${parts[0]}` };
  }
  return null;
}
/** Browser-generated JPEG only. No SVG/HTML or external thumbnail requests. */
export function validPromotionCover(value: unknown): value is string {
  if (value === "") return true;
  if (typeof value !== "string" || value.length > Math.ceil(PROMOTION_COVER_MAX_BYTES / 3) * 4 + 23) return false;
  const match = /^data:image\/jpeg;base64,(\/9j\/[A-Za-z0-9+/]*={0,2})$/u.exec(value);
  if (!match || match[1].length % 4 !== 0) return false;
  const padding = match[1].endsWith("==") ? 2 : match[1].endsWith("=") ? 1 : 0;
  return match[1].length / 4 * 3 - padding <= PROMOTION_COVER_MAX_BYTES;
}
export function validatePromotion(input: unknown): PromotionResult<PromotionInput> {
  const body = promotionRecord(input);
  if (!promotionKey(PROMOTION_KINDS, body.kind) || !promotionKey(PROMOTION_STAGES, body.stage)
    || !PROMOTION_GENRES.includes(body.genre as PromotionInput["genre"])) return { error: "게시물 유형·활동 단계·장르를 선택해 주세요." };
  const title = promotionText(body.title), seriesTitle = promotionText(body.seriesTitle), description = promotionText(body.description);
  if (title.length < 3 || title.length > 100) return { error: "제목은 3~100자로 입력해 주세요." };
  if (seriesTitle.length < 2 || seriesTitle.length > 100) return { error: "작품명은 2~100자로 입력해 주세요." };
  if (description.length < 20 || description.length > 4000) return { error: "소개는 20~4000자로 입력해 주세요." };
  const readingUrl = safePromotionUrl(body.readingUrl);
  if (readingUrl === null) return { error: "작품 링크는 공개된 https 주소로 입력해 주세요." };
  const rawVideo = promotionText(body.videoUrl);
  const video = promotionVideo(rawVideo);
  if ((rawVideo || body.kind === "trailer") && !video) return { error: "YouTube 영상·Shorts 또는 공개 Vimeo 영상 주소를 입력해 주세요." };
  if (!validPromotionCover(body.cover)) return { error: "표지는 128KB 이하의 변환된 JPEG 이미지여야 해요." };
  if (!Array.isArray(body.tags) || body.tags.length > 8 || body.tags.some((tag) => typeof tag !== "string" || tag.trim().length > 24 || !tag.trim())) return { error: "태그는 24자 이내로 최대 8개까지 입력해 주세요." };
  const contentWarning = promotionText(body.contentWarning);
  if (contentWarning.length > 150) return { error: "콘텐츠 안내는 150자 이내로 입력해 주세요." };
  if (body.rightsConfirmed !== true) return { error: "작품·이미지·영상·음원의 게시 권한을 확인해 주세요." };
  return { value: { kind: body.kind, stage: body.stage, genre: body.genre as PromotionInput["genre"], title, seriesTitle, description, readingUrl,
    videoUrl: video?.url ?? "", cover: body.cover, tags: [...new Set(body.tags.map((tag: string) => tag.trim().replace(/^#/u, "")))].filter(Boolean), contentWarning, rightsConfirmed: true } };
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
export function promotionCursor(value: unknown): { date: Date; id: string } | null {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 90) throw new Error("잘못된 페이지 커서입니다.");
  const [stamp, id, extra] = value.split("|");
  const date = new Date(stamp);
  if (extra !== undefined || !id || !UUID.test(id) || !Number.isFinite(date.getTime()) || date.toISOString() !== stamp) throw new Error("잘못된 페이지 커서입니다.");
  return { date, id };
}
export function isPromotionPost(value: unknown): value is PromotionPost {
  const post = promotionRecord(value), author = promotionRecord(post.author);
  return typeof post.id === "string" && UUID.test(post.id) && typeof post.version === "number" && Number.isSafeInteger(post.version) && post.version > 0
    && typeof author.id === "string" && !!author.id && typeof author.name === "string"
    && typeof post.createdAt === "string" && Number.isFinite(Date.parse(post.createdAt))
    && typeof post.updatedAt === "string" && Number.isFinite(Date.parse(post.updatedAt))
    && typeof post.hidden === "boolean" && typeof post.archived === "boolean" && typeof post.saved === "boolean" && !validatePromotion(post).error;
}
export function assertPromotionPage(value: unknown): asserts value is PromotionPage {
  const page = promotionRecord(value);
  if (!Array.isArray(page.items) || typeof page.hasMore !== "boolean" || typeof page.canModerate !== "boolean"
    || (page.nextCursor !== null && typeof page.nextCursor !== "string") || (page.hasMore && !page.nextCursor)
    || page.items.some((item) => !isPromotionPost(item))) throw new Error("홍보 목록 응답을 확인하지 못했어요. 다시 불러와 주세요.");
  if (page.nextCursor) promotionCursor(page.nextCursor);
}
