// 창작 게시판(/api/creator) 전용 타입 + fetch 헬퍼.
// 인증은 기존 세션 스킴(localStorage "toonspectrum-auth-session" → x-user-id 헤더)을 그대로 재사용한다.
// 새 저장 키를 만들지 않고 auth-session의 getAuthUserId()로 현재 사용자 id를 읽는다.
import { getAuthUserId, getAuthToken } from "@/src/compat/auth-session";
import { ensureArray, resolveApiError, safeParseJson } from "@/lib/http-safe";

export type WorkFormat = "cuttoon" | "upload";

export interface WorkAuthor {
  id: string;
  name: string;
  avatar: string;
}

export interface WorkSummary {
  id: string;
  title: string;
  description: string;
  cover: string;
  tags: string[];
  format: WorkFormat;
  titleId: string | null;
  status: string;
  author: WorkAuthor;
  likes: number;
  comments: number;
  views: number;
  liked: boolean;
  createdAt: string;
}

export interface WorkDetail extends WorkSummary {
  pages: string[];
  doc: Record<string, unknown>;
  isOwner: boolean;
}

export interface WorkComment {
  id: string;
  author: WorkAuthor;
  text: string;
  createdAt: string;
}

export type WorkSort = "recent" | "likes" | "views";

export interface WorkListParams {
  titleId?: string;
  userId?: string;
  sort?: WorkSort;
  tag?: string;
}

export interface CreateWorkInput {
  title: string;
  description: string;
  tags: string[];
  format: WorkFormat;
  titleId?: string | null;
  cover: string;
  pages: string[];
  doc: Record<string, unknown>;
  status: string;
}

export type UpdateWorkInput = Partial<CreateWorkInput>;

const BASE = "/api/creator";

// 현재 로그인 사용자 id(없으면 null). 세션 훅/유틸을 재사용한다 — 새 storage key 금지.
export function getCurrentUserId(): string | null {
  return getAuthUserId();
}

function authHeaders(json: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  const token = getAuthToken();
  if (token) headers["x-user-id"] = token; // 서명 세션 토큰(서버 검증)
  return headers;
}

async function readOrThrow<T>(res: Response, fallback: string): Promise<T> {
  const data = await safeParseJson<T>(res);
  if (!res.ok) throw new Error(resolveApiError(data, `${fallback} (${res.status})`));
  if (data == null) throw new Error(fallback);
  return data;
}

// 목록 응답은 { works } 또는 배열 둘 다 방어적으로 처리한다.
function unwrapWorks(payload: unknown): WorkSummary[] {
  if (Array.isArray(payload)) return payload as WorkSummary[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { works?: unknown }).works)) {
    return (payload as { works: WorkSummary[] }).works;
  }
  return ensureArray<WorkSummary>(payload);
}

export async function listWorks(
  params: WorkListParams = {},
  signal?: AbortSignal
): Promise<WorkSummary[]> {
  const search = new URLSearchParams();
  if (params.titleId) search.set("titleId", params.titleId);
  if (params.userId) search.set("userId", params.userId);
  if (params.sort) search.set("sort", params.sort);
  if (params.tag) search.set("tag", params.tag);
  const qs = search.toString();
  const res = await fetch(`${BASE}/works${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    headers: authHeaders(false), // x-user-id 전송 → 본인 목록일 때 초안·비공개도 표시
    signal,
  });
  const data = await readOrThrow<unknown>(res, "창작물 목록을 불러오지 못했습니다.");
  return unwrapWorks(data);
}

export async function getWork(id: string, signal?: AbortSignal): Promise<WorkDetail> {
  const res = await fetch(`${BASE}/works/${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: authHeaders(false),
    signal,
  });
  return readOrThrow<WorkDetail>(res, "창작물을 불러오지 못했습니다.");
}

export async function createWork(input: CreateWorkInput): Promise<WorkSummary> {
  const res = await fetch(`${BASE}/works`, {
    method: "POST",
    cache: "no-store",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
  return readOrThrow<WorkSummary>(res, "창작물을 등록하지 못했습니다.");
}

export async function updateWork(id: string, input: UpdateWorkInput): Promise<WorkSummary> {
  const res = await fetch(`${BASE}/works/${encodeURIComponent(id)}`, {
    method: "PATCH",
    cache: "no-store",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
  return readOrThrow<WorkSummary>(res, "창작물을 수정하지 못했습니다.");
}

export async function deleteWork(id: string): Promise<void> {
  const res = await fetch(`${BASE}/works/${encodeURIComponent(id)}`, {
    method: "DELETE",
    cache: "no-store",
    headers: authHeaders(false),
  });
  if (!res.ok) {
    const data = await safeParseJson<unknown>(res);
    throw new Error(resolveApiError(data, `창작물을 삭제하지 못했습니다. (${res.status})`));
  }
}

export async function toggleWorkLike(id: string): Promise<{ liked: boolean; likes: number }> {
  const res = await fetch(`${BASE}/works/${encodeURIComponent(id)}/like`, {
    method: "POST",
    cache: "no-store",
    headers: authHeaders(false),
  });
  return readOrThrow<{ liked: boolean; likes: number }>(res, "좋아요를 처리하지 못했습니다.");
}

export async function listComments(id: string, signal?: AbortSignal): Promise<WorkComment[]> {
  const res = await fetch(`${BASE}/works/${encodeURIComponent(id)}/comments`, {
    cache: "no-store",
    signal,
  });
  const data = await readOrThrow<unknown>(res, "댓글을 불러오지 못했습니다.");
  return ensureArray<WorkComment>(data);
}

export async function postComment(id: string, text: string): Promise<WorkComment> {
  const res = await fetch(`${BASE}/works/${encodeURIComponent(id)}/comments`, {
    method: "POST",
    cache: "no-store",
    headers: authHeaders(true),
    body: JSON.stringify({ text }),
  });
  return readOrThrow<WorkComment>(res, "댓글을 등록하지 못했습니다.");
}

// ── 공유 에셋(회원이 올려 모두가 재사용) ──────────────────────────────
export interface SharedAsset {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  kind: string;
  downloads: number;
  author: WorkAuthor;
  isOwner: boolean;
  createdAt: string;
}

export interface PublishAssetInput {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  kind?: string;
}

export type GeneratedAssetSize = "1024x1024" | "1536x1024" | "1024x1536";
export type GeneratedAssetQuality = "low" | "medium" | "high" | "auto";

export interface GenerateAssetInput {
  prompt: string;
  name?: string;
  size?: GeneratedAssetSize;
  quality?: GeneratedAssetQuality;
}

export interface GeneratedAsset {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  model: "gpt-image-2";
  size: GeneratedAssetSize;
  quality: GeneratedAssetQuality;
}

export async function listSharedAssets(
  params: { mine?: boolean; limit?: number; offset?: number } = {},
  signal?: AbortSignal
): Promise<SharedAsset[]> {
  const search = new URLSearchParams();
  if (params.mine) search.set("mine", "1");
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  const qs = search.toString();
  const res = await fetch(`${BASE}/assets${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    headers: authHeaders(false), // x-user-id 전송 → isOwner 판정/내 공유 필터
    signal,
  });
  const data = await readOrThrow<unknown>(res, "공유 에셋을 불러오지 못했습니다.");
  return ensureArray<SharedAsset>(data);
}

export async function publishAsset(input: PublishAssetInput): Promise<SharedAsset> {
  const res = await fetch(`${BASE}/assets`, {
    method: "POST",
    cache: "no-store",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
  return readOrThrow<SharedAsset>(res, "에셋을 공유하지 못했습니다.");
}

export async function generateAsset(input: GenerateAssetInput): Promise<GeneratedAsset> {
  const res = await fetch(`${BASE}/assets/generate`, {
    method: "POST",
    cache: "no-store",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
  return readOrThrow<GeneratedAsset>(res, "이미지를 생성하지 못했습니다.");
}

export async function deleteSharedAsset(id: string): Promise<void> {
  const res = await fetch(`${BASE}/assets/${encodeURIComponent(id)}`, {
    method: "DELETE",
    cache: "no-store",
    headers: authHeaders(false),
  });
  if (!res.ok) {
    const data = await safeParseJson<unknown>(res);
    throw new Error(resolveApiError(data, `에셋을 삭제하지 못했습니다. (${res.status})`));
  }
}

// 사용(삽입) 시 다운로드 카운트 증가 — best-effort, 실패해도 무시.
export async function markSharedAssetUsed(id: string): Promise<void> {
  try {
    await fetch(`${BASE}/assets/${encodeURIComponent(id)}/use`, { method: "POST", cache: "no-store" });
  } catch {
    // ignore
  }
}
