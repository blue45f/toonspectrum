import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  createFanPost,
  deleteFanPost,
  createFanPostReply,
  listCommunityBoards,
  listFanPostReplies,
  listFanPosts,
  parseCommunityScopeFilter,
  parsePostKindOrNull,
  parsePostSort,
  validatePostInput,
  validateReplyPayload,
  createReviewReply,
  listReviewReplies,
} from "../../../../../lib/server/community";
import { getReviewsData } from "../../../../../lib/server/reviews";
import { parseCommunitySort } from "../../../../../lib/community-ui";
import type { FanCafeReply, ReviewReply } from "../../../../../lib/types";

interface PostQuery {
  scope?: string | null;
  targetId?: string | null;
  kind?: string | null;
  sort?: string | null;
  query?: string | null;
  tag?: string | null;
  cursor?: string | null;
  limit?: number | string | null;
  mineOnly?: boolean;
  requesterId?: string | null;
}

interface PostPayload {
  scope?: unknown;
  targetId?: unknown;
  targetLabel?: unknown;
  kind?: unknown;
  title?: unknown;
  text?: unknown;
  tags?: unknown;
}

interface ReviewPayload {
  sort?: string | null;
  spoiler?: string | null;
  rating?: string | null;
  userId?: string | null;
}

interface ReplyPayload {
  text?: unknown;
  parentId?: unknown;
  spoiler?: unknown;
}

function parseBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "on", "yes"].includes(normalized);
  }
  return false;
}

function parseLimit(value: number | string | null | undefined): number {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw)) return 20;
  return Math.max(1, Math.min(Math.floor(raw), 100));
}

@Injectable()
export class CommunityService {
  async boards(scopeValue: string | null, query: string | null, sortValue: string | null, limitValue: number | null) {
    const scope = parseCommunityScopeFilter(scopeValue) ?? "all";
    const sort = parseCommunitySort(sortValue);
    const safeLimit = parseLimit(limitValue);
    // DB(Neon) 불가 시 빈 목록으로 우아하게 폴백 — 팬카페가 500 대신 빈 디렉토리로 뜬다.
    let boards: Awaited<ReturnType<typeof listCommunityBoards>> = [];
    try {
      boards = await listCommunityBoards(scope, String(query ?? "").trim(), sort, safeLimit);
    } catch {
      boards = [];
    }
    return {
      items: boards,
      meta: { scope, sort, limit: safeLimit, total: boards.length, generatedAt: new Date().toISOString() },
    };
  }

  async listPosts(query: PostQuery) {
    const scope = parseCommunityScopeFilter(query.scope ?? null) ?? "all";
    const targetId = String(query.targetId ?? "").trim() || null;
    const kind = parsePostKindOrNull(query.kind);
    const sort = parsePostSort(query.sort);
    const safeLimit = parseLimit(query.limit ?? 20);
    const search = String(query.query ?? "").trim();
    const tag = String(query.tag ?? "").trim();
    const cursor = query.cursor ? String(query.cursor) : null;
    const requesterId = parseBool(query.mineOnly) && query.requesterId ? query.requesterId : null;
    if (query.mineOnly && !requesterId) {
      throw new UnauthorizedException("로그인이 필요해요.");
    }
    if (scope !== "all" && !targetId) {
      throw new BadRequestException("scope가 all이 아니면 targetId가 필요합니다.");
    }

    // DB(Neon) 불가 시 빈 피드로 폴백 — 검증 오류(위 throw)는 그대로 두고 DB 호출만 보호.
    try {
      return await listFanPosts(scope, targetId, kind, search, tag, sort, cursor, safeLimit, requesterId);
    } catch {
      return { items: [], hasMore: false, nextCursor: null };
    }
  }

  async createPost(body: PostPayload, userId: string) {
    const parsed = validatePostInput(body);
    if (parsed.error || !parsed.value) {
      throw new BadRequestException(parsed.error ?? "잘못된 요청");
    }
    return createFanPost(userId, parsed.value);
  }

  async deletePost(postId: string, userId: string) {
    if (!postId) throw new BadRequestException("postId 필요");
    try {
      return await deleteFanPost(userId, postId, false);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "글을 삭제하지 못했습니다.");
    }
  }

  async listPostReplies(postId: string): Promise<FanCafeReply[]> {
    if (!postId) throw new BadRequestException("postId 필요");
    try {
      return await listFanPostReplies(postId);
    } catch {
      return [];
    }
  }

  async createPostReply(postId: string, userId: string, body: ReplyPayload) {
    const parsed = validateReplyPayload(body);
    if (parsed.error || !parsed.text) throw new BadRequestException(parsed.error ?? "답글의 상위 항목이 유효하지 않습니다.");
    try {
      return await createFanPostReply({
        postId,
        userId,
        parentId: parsed.parentId,
        text: parsed.text,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw new BadRequestException("답글을 저장하지 못했습니다.");
    }
  }

  async listReviewReplies(reviewId: string): Promise<ReviewReply[]> {
    if (!reviewId) throw new BadRequestException("reviewId 필요");
    try {
      return await listReviewReplies(reviewId);
    } catch {
      return [];
    }
  }

  async createReviewReply(reviewId: string, userId: string, body: ReplyPayload) {
    const parsed = validateReplyPayload(body);
    if (parsed.error || !parsed.text) throw new BadRequestException(parsed.error ?? "답글의 상위 항목이 유효하지 않습니다.");
    try {
      return await createReviewReply({
        reviewId,
        parentId: parsed.parentId,
        userId,
        text: parsed.text,
        spoiler: !!body.spoiler,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw new BadRequestException("답글을 저장하지 못했습니다.");
    }
  }

  async getReviewsData(query: ReviewPayload) {
    return getReviewsData({
      sort: query.sort ?? undefined,
      spoiler: query.spoiler ?? undefined,
      rating: query.rating ?? undefined,
      userId: query.userId ?? undefined,
    });
  }
}
