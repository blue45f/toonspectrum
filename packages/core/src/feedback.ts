/** Shared, dependency-free contract for the first-party feedback community.
 * The legacy Q&A `status` stays separate from implementation `progress`.
 */
export const FEEDBACK_KINDS = ["bug", "idea", "request", "question"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  bug: "버그 제보", idea: "아이디어", request: "기능 요청", question: "이용 질문",
};
export const FEEDBACK_PROGRESS = ["received", "reviewing", "planned", "in_progress", "completed", "not_planned"] as const;
export type FeedbackProgress = (typeof FEEDBACK_PROGRESS)[number];
export const FEEDBACK_PROGRESS_LABELS: Record<FeedbackProgress, string> = {
  received: "접수", reviewing: "검토 중", planned: "예정", in_progress: "진행 중", completed: "반영 완료", not_planned: "보류",
};
export const FEEDBACK_AREAS = ["studio", "drawing", "3d", "assets", "ai", "account", "other"] as const;
export type FeedbackArea = (typeof FEEDBACK_AREAS)[number];
export const FEEDBACK_AREA_LABELS: Record<FeedbackArea, string> = {
  studio: "스튜디오", drawing: "브러시·필터", "3d": "3D·캐릭터", assets: "템플릿·에셋", ai: "AI 창작", account: "계정·로그인", other: "기타",
};
export interface FeedbackDetails {
  area?: FeedbackArea;
  steps?: string;
  expected?: string;
  actual?: string;
  path?: string;
}
export interface FeedbackAuthor { id?: string; name: string; avatar: string }
export interface FeedbackEntry {
  id: string;
  category: FeedbackKind;
  title: string;
  text: string;
  tags: string[];
  status: "open" | "answered";
  progress: FeedbackProgress;
  metadata: FeedbackDetails;
  answeredAt: string | null;
  createdAt: string;
  author: FeedbackAuthor;
  replyCount: number;
  voteCount: number;
  viewerVoted: boolean;
}
export interface FeedbackComment {
  id: string;
  postId: string;
  parentId: string | null;
  author: FeedbackAuthor;
  text: string;
  isOfficial: boolean;
  createdAt: string;
  children?: FeedbackComment[];
}
export interface FeedbackPageResult {
  contractVersion?: 2;
  items: FeedbackEntry[];
  nextCursor: string | null;
  hasMore: boolean;
  canManage?: boolean;
}
export interface FeedbackInput {
  category: FeedbackKind;
  title: string;
  text: string;
  tags: string[];
  metadata: FeedbackDetails;
}
export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return typeof value === "string" && FEEDBACK_KINDS.some((kind) => kind === value);
}
export function isFeedbackProgress(value: unknown): value is FeedbackProgress {
  return typeof value === "string" && FEEDBACK_PROGRESS.some((progress) => progress === value);
}
export function isFeedbackArea(value: unknown): value is FeedbackArea {
  return typeof value === "string" && FEEDBACK_AREAS.some((area) => area === value);
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function feedbackText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().replace(/\n{3,}/g, "\n\n") : "";
}
/** Do not store a full URL, query parameters, fragments, or browser identity. */
export function safeFeedbackPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 1000 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "";
  const path = value.split(/[?#]/, 1)[0];
  // Only product routes: project IDs and arbitrary user-provided URL paths stay private.
  const allowed = /^\/(?:studio(?:\/(?:brushes|assets|templates|video|music))?|brush-studio|community|feedback|marketplace|assets|templates|account|login)?\/?$/;
  return allowed.test(path) ? path : "";
}
export function cleanFeedbackTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/^#/, "").replace(/\s+/g, " ").slice(0, 20);
    const key = tag.toLocaleLowerCase("en-US");
    if (tag && !seen.has(key)) { result.push(tag); seen.add(key); }
    if (result.length === 5) break;
  }
  return result;
}
export function validateFeedbackInput(input: unknown): { value?: FeedbackInput; error?: string } {
  const body = record(input);
  if (!body) return { error: "제보 내용을 확인해 주세요." };
  // Missing category remains compatible with the original Q&A client.
  const category = body.category === undefined ? "question" : body.category;
  if (!isFeedbackKind(category)) return { error: "올바른 제보 유형을 선택해 주세요." };
  if (typeof body.title !== "string" || typeof body.text !== "string") return { error: "제목과 내용을 입력해 주세요." };
  const title = body.title.trim().replace(/\s+/g, " ");
  const text = feedbackText(body.text);
  if (body.title.trim().length > 100) return { error: "제목은 100자 이하로 입력해 주세요." };
  if (text.length > 2000) return { error: "본문은 2000자 이하로 입력해 주세요." };
  if (title.length < 2) return { error: "제목은 2자 이상 입력해 주세요." };
  if (text.length < 5) return { error: "내용은 5자 이상 입력해 주세요." };
  if (body.metadata !== undefined && !record(body.metadata)) return { error: "추가 정보를 확인해 주세요." };
  const raw = record(body.metadata) ?? {};
  const metadata: FeedbackDetails = {};
  if (raw.area !== undefined) {
    if (!isFeedbackArea(raw.area)) return { error: "관련 기능을 선택해 주세요." };
    metadata.area = raw.area;
  }
  for (const key of ["steps", "expected", "actual"] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== "string") return { error: "재현 정보를 텍스트로 입력해 주세요." };
    const value = feedbackText(raw[key]);
    if (value.length > 1200) return { error: "재현 정보는 항목당 1200자 이하로 입력해 주세요." };
    if (value) metadata[key] = value;
  }
  const path = safeFeedbackPath(raw.path);
  if (path) metadata.path = path;
  return { value: { category, title, text, tags: cleanFeedbackTags(body.tags), metadata } };
}
export function feedbackPageLimit(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return 20;
  if (typeof value === "string" && !/^\d+$/.test(value)) return 20;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(50, Math.max(1, Math.floor(number))) : 20;
}
export interface FeedbackCursor { createdAt: number; id: string }
export function parseFeedbackCursor(value: unknown): FeedbackCursor | null {
  if (typeof value !== "string" || !/^\d{1,16}:[A-Za-z0-9_-]{1,80}$/.test(value)) return null;
  const separator = value.indexOf(":");
  const createdAt = Number(value.slice(0, separator));
  if (!Number.isSafeInteger(createdAt) || createdAt <= 0 || Number.isNaN(new Date(createdAt).getTime())) return null;
  return { createdAt, id: value.slice(separator + 1) };
}
export function feedbackTimeLabel(iso: string, now = Date.now()): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "날짜 확인 중";
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return new Date(timestamp).toLocaleDateString("ko-KR");
}
