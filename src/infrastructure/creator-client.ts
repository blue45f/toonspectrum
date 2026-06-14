// 창작 게시판(/api/creator) 전용 타입 + ky 헬퍼.
// 인증은 기존 세션 스킴(localStorage "toonspectrum-auth-session" → x-user-id 헤더)을 그대로 재사용한다.
// 공유 ky 클라이언트(api)의 beforeRequest 훅이 x-user-id 를 자동 주입하므로 호출부는 헤더를 안 넘긴다.
// 새 저장 키를 만들지 않고 auth-session의 getAuthUserId()로 현재 사용자 id를 읽는다.
import { ensureArray } from "@/lib/http-safe";
import { getAuthUserId } from "@/src/compat/auth-session-store";
import { api, toApiError } from "@/src/infrastructure/api";

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
  // 연재 시리즈/챌린지 연결 — 구버전 서버 응답엔 없을 수 있어 optional(하위호환).
  seriesId?: string | null;
  episodeNo?: number | null;
  seriesTitle?: string | null;
  challengeId?: string | null;
  challengeTitle?: string | null;
}

// 작품 상세의 이전화/다음화 내비게이션 항목.
export interface EpisodeRef {
  id: string;
  title: string;
  episodeNo: number | null;
}

export interface WorkDetail extends WorkSummary {
  pages: string[];
  doc: Record<string, unknown>;
  isOwner: boolean;
  series?: { id: string; title: string; status: SeriesStatus } | null;
  prevEpisode?: EpisodeRef | null;
  nextEpisode?: EpisodeRef | null;
  challenge?: { id: string; slug: string; title: string; endsAt: string | null } | null;
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
  seriesId?: string;
  challengeId?: string;
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
  // 선택: 연재 시리즈 회차로 게시(서버가 episodeNo 자동 부여) / 챌린지 참여작으로 게시.
  seriesId?: string | null;
  challengeId?: string | null;
}

export type UpdateWorkInput = Partial<CreateWorkInput>;

// api 래퍼는 "/api" 이후 경로를 받는다(내부에서 apiPath 가 "/api" 를 붙임).
const BASE = "/creator";

// 현재 로그인 사용자 id(없으면 null). 세션 훅/유틸을 재사용한다 — 새 storage key 금지.
export function getCurrentUserId(): string | null {
  return getAuthUserId();
}

// ky HTTPError 를 fallback 메시지로 감싸 throw 한다(기존 readOrThrow 의 에러 텍스트 유지).
// data == null(빈 본문)이면 fallback 으로 throw — 기존 동작과 동일.
async function callOrThrow<T>(run: () => Promise<T>, fallback: string): Promise<T> {
  let data: T;
  try {
    data = await run();
  } catch (err) {
    throw await toApiError(err, fallback);
  }
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
  // x-user-id 전송(공유 클라이언트 훅) → 본인 목록일 때 초안·비공개도 표시.
  const data = await callOrThrow(
    () => api.get<unknown>(`${BASE}/works`, { params: { ...params }, signal }),
    "창작물 목록을 불러오지 못했습니다."
  );
  return unwrapWorks(data);
}

export async function getWork(id: string, signal?: AbortSignal): Promise<WorkDetail> {
  return callOrThrow(
    () => api.get<WorkDetail>(`${BASE}/works/${encodeURIComponent(id)}`, { signal }),
    "창작물을 불러오지 못했습니다."
  );
}

export async function createWork(input: CreateWorkInput): Promise<WorkSummary> {
  return callOrThrow(
    () => api.post<WorkSummary>(`${BASE}/works`, input),
    "창작물을 등록하지 못했습니다."
  );
}

export async function updateWork(id: string, input: UpdateWorkInput): Promise<WorkSummary> {
  return callOrThrow(
    () => api.patch<WorkSummary>(`${BASE}/works/${encodeURIComponent(id)}`, input),
    "창작물을 수정하지 못했습니다."
  );
}

export async function deleteWork(id: string): Promise<void> {
  try {
    await api.delete(`${BASE}/works/${encodeURIComponent(id)}`);
  } catch (err) {
    throw await toApiError(err, "창작물을 삭제하지 못했습니다.");
  }
}

export async function toggleWorkLike(id: string): Promise<{ liked: boolean; likes: number }> {
  return callOrThrow(
    () => api.post<{ liked: boolean; likes: number }>(`${BASE}/works/${encodeURIComponent(id)}/like`),
    "좋아요를 처리하지 못했습니다."
  );
}

export async function listComments(id: string, signal?: AbortSignal): Promise<WorkComment[]> {
  const data = await callOrThrow(
    () => api.get<unknown>(`${BASE}/works/${encodeURIComponent(id)}/comments`, { signal }),
    "댓글을 불러오지 못했습니다."
  );
  return ensureArray<WorkComment>(data);
}

export async function postComment(id: string, text: string): Promise<WorkComment> {
  return callOrThrow(
    () => api.post<WorkComment>(`${BASE}/works/${encodeURIComponent(id)}/comments`, { text }),
    "댓글을 등록하지 못했습니다."
  );
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
  // x-user-id 전송(공유 클라이언트 훅) → isOwner 판정/내 공유 필터. mine 은 서버 호환을 위해 "1" 로 보낸다.
  const data = await callOrThrow(
    () =>
      api.get<unknown>(`${BASE}/assets`, {
        params: { mine: params.mine ? "1" : undefined, limit: params.limit, offset: params.offset },
        signal,
      }),
    "공유 에셋을 불러오지 못했습니다."
  );
  return ensureArray<SharedAsset>(data);
}

export async function publishAsset(input: PublishAssetInput): Promise<SharedAsset> {
  return callOrThrow(() => api.post<SharedAsset>(`${BASE}/assets`, input), "에셋을 공유하지 못했습니다.");
}

export async function generateAsset(input: GenerateAssetInput): Promise<GeneratedAsset> {
  return callOrThrow(
    () => api.post<GeneratedAsset>(`${BASE}/assets/generate`, input),
    "이미지를 생성하지 못했습니다."
  );
}

export async function deleteSharedAsset(id: string): Promise<void> {
  try {
    await api.delete(`${BASE}/assets/${encodeURIComponent(id)}`);
  } catch (err) {
    throw await toApiError(err, "에셋을 삭제하지 못했습니다.");
  }
}

// 사용(삽입) 시 다운로드 카운트 증가 — best-effort, 실패해도 무시.
export async function markSharedAssetUsed(id: string): Promise<void> {
  try {
    await api.post(`${BASE}/assets/${encodeURIComponent(id)}/use`);
  } catch {
    // ignore
  }
}

// ── 연재 시리즈(코미코 베스트도전 스타일) ──────────────────────────────
export type SeriesStatus = "ongoing" | "completed";
export type SeriesSort = "recent" | "likes" | "views";

export interface SeriesSummary {
  id: string;
  title: string;
  description: string;
  cover: string;
  tags: string[];
  status: SeriesStatus;
  author: WorkAuthor;
  episodes: number;
  views: number;
  likes: number;
  latestEpisodeAt: string | null;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SeriesDetail extends SeriesSummary {
  episodeList: WorkSummary[];
}

export interface SeriesInput {
  title: string;
  description?: string;
  cover?: string;
  tags?: string[];
  status?: SeriesStatus;
}

export async function listSeries(
  params: { userId?: string; sort?: SeriesSort } = {},
  signal?: AbortSignal
): Promise<SeriesSummary[]> {
  const data = await callOrThrow(
    () => api.get<unknown>(`${BASE}/series`, { params: { ...params }, signal }),
    "시리즈 목록을 불러오지 못했습니다."
  );
  return ensureArray<SeriesSummary>(data);
}

export async function getSeries(id: string, signal?: AbortSignal): Promise<SeriesDetail> {
  return callOrThrow(
    () => api.get<SeriesDetail>(`${BASE}/series/${encodeURIComponent(id)}`, { signal }),
    "시리즈를 불러오지 못했습니다."
  );
}

export async function createSeries(input: SeriesInput): Promise<SeriesSummary> {
  return callOrThrow(() => api.post<SeriesSummary>(`${BASE}/series`, input), "시리즈를 만들지 못했습니다.");
}

export async function updateSeries(id: string, input: Partial<SeriesInput>): Promise<SeriesSummary> {
  return callOrThrow(
    () => api.patch<SeriesSummary>(`${BASE}/series/${encodeURIComponent(id)}`, input),
    "시리즈를 수정하지 못했습니다."
  );
}

export async function deleteSeries(id: string): Promise<void> {
  try {
    await api.delete(`${BASE}/series/${encodeURIComponent(id)}`);
  } catch (err) {
    throw await toApiError(err, "시리즈를 삭제하지 못했습니다.");
  }
}

// ── 창작 챌린지(주간 주제 이벤트) ──────────────────────────────────────
export type ChallengeState = "upcoming" | "ongoing" | "ended";

export interface ChallengeSummary {
  id: string;
  slug: string;
  title: string;
  theme: string;
  startsAt: string | null;
  endsAt: string | null;
  state: ChallengeState;
  entries: number;
  createdAt: string;
}

export interface ChallengeDetail extends ChallengeSummary {
  works: WorkSummary[];
}

export async function listChallenges(signal?: AbortSignal): Promise<ChallengeSummary[]> {
  const data = await callOrThrow(
    () => api.get<unknown>(`${BASE}/challenges`, { signal }),
    "챌린지 목록을 불러오지 못했습니다."
  );
  return ensureArray<ChallengeSummary>(data);
}

export async function getChallenge(key: string, signal?: AbortSignal): Promise<ChallengeDetail> {
  return callOrThrow(
    () => api.get<ChallengeDetail>(`${BASE}/challenges/${encodeURIComponent(key)}`, { signal }),
    "챌린지를 불러오지 못했습니다."
  );
}

// 마감 D-day — 음수면 마감 지남, null이면 상시. (UI 표기용 순수 헬퍼)
export function challengeDday(endsAt: string | null, now: Date = new Date()): number | null {
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.ceil((end - now.getTime()) / 86_400_000);
}

// ── 창작자 팔로우/공개 프로필 ──────────────────────────────────────────
export interface CreatorProfile {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  createdAt: string | null;
  followers: number;
  following: number;
  isFollowing: boolean;
  works: number;
  series: number;
}

export async function getCreatorProfile(userId: string, signal?: AbortSignal): Promise<CreatorProfile> {
  return callOrThrow(
    () => api.get<CreatorProfile>(`${BASE}/users/${encodeURIComponent(userId)}/profile`, { signal }),
    "프로필을 불러오지 못했습니다."
  );
}

export async function toggleFollow(creatorId: string): Promise<{ following: boolean; followers: number }> {
  return callOrThrow(
    () =>
      api.post<{ following: boolean; followers: number }>(
        `${BASE}/users/${encodeURIComponent(creatorId)}/follow`
      ),
    "팔로우를 처리하지 못했습니다."
  );
}

// 팔로잉 피드 — 팔로우한 창작자의 최신 작품(로그인 필요).
export async function listFollowingFeed(signal?: AbortSignal): Promise<WorkSummary[]> {
  const data = await callOrThrow(
    () => api.get<unknown>(`${BASE}/feed/following`, { signal }),
    "팔로잉 피드를 불러오지 못했습니다."
  );
  return unwrapWorks(data);
}
