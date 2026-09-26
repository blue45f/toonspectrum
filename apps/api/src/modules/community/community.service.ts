import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";

import { parseCommunitySort } from "../../../../web/src/shared/lib/community-ui";
import { rethrowDatabaseCapabilityError, withDatabaseCapability } from "../../common/service-availability";
import { GENRES } from "../../../../web/src/shared/lib/taxonomy";
import {
  createFanPost,
  createFanPostReply,
  createReviewReply,
  deleteReviewReply,
  getFanPost,
  listCommunityBoards,
  listFanPostReplies,
  listFanPosts,
  listReviewReplies,
  parseCommunityScopeFilter,
  parsePostKindOrNull,
  parsePostSort,
  validatePostInput,
  validateReplyPayload,
} from "../../server/community";
import {
  archiveGovernedCafe,
  assertCafePostAccess,
  assertCommunityPostingAccess,
  banGovernedCafeMember,
  CommunityGovernanceError,
  createGovernedCafe,
  createGovernedCafeInvite,
  deleteGovernedCommunityPost,
  deleteGovernedCommunityReply,
  filterAccessibleCafeBoards,
  filterAccessibleCafePosts,
  getGovernedCafeBySlug,
  joinGovernedCafe,
  leaveOrCancelGovernedCafe,
  listGovernedCafeBans,
  listGovernedCafeInvites,
  listGovernedCafeJoinRequests,
  listGovernedCafeMembers,
  listGovernedCafeModerationLogs,
  listGovernedCafes,
  reviewGovernedCafeJoinRequest,
  revokeGovernedCafeInvite,
  transferGovernedCafeOwnership,
  unbanGovernedCafeMember,
  updateGovernedCafe,
  updateGovernedCafeMemberRole,
  validateCommunityCafeCreateInput,
  validateCommunityCafeUpdateInput,
} from "../../server/community-governance";
import { getReviewsData } from "../../server/reviews";
import {
  MEMBERSHIP_REWARD_SERVICE,
  type MembershipRewardService,
} from "../membership-wallet/membership-wallet.tokens";
import { MembershipRewardReversalService } from "../membership-operations/membership-reward-reversal.service";

import type {
  CommunityCafe,
  CommunityCafeRole,
  FanCafePost,
  FanCafeReply,
  ReviewReply,
} from "../../../../web/src/shared/lib/types";

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
  viewerId?: string | null;
}

interface PostPayload {
  scope?: unknown;
  targetId?: unknown;
  targetLabel?: unknown;
  kind?: unknown;
  title?: unknown;
  text?: unknown;
  tags?: unknown;
  images?: unknown;
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

function rethrowGovernance(error: unknown): never {
  if (!(error instanceof CommunityGovernanceError)) throw error;
  switch (error.code) {
    case "unauthorized":
      throw new UnauthorizedException(error.message);
    case "forbidden":
      throw new ForbiddenException(error.message);
    case "not-found":
      throw new NotFoundException(error.message);
    case "conflict":
      throw new ConflictException(error.message);
    default:
      throw new BadRequestException(error.message);
  }
}

async function governed<T>(
  action: () => Promise<T>,
  capability = "community.write",
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof CommunityGovernanceError) rethrowGovernance(error);
    rethrowDatabaseCapabilityError(error, capability);
  }
}

@Injectable()
export class CommunityService {
  constructor(
    @Optional()
    @Inject(MEMBERSHIP_REWARD_SERVICE)
    private readonly membershipWallet?: MembershipRewardService,
    @Optional()
    @Inject(MembershipRewardReversalService)
    private readonly rewardReversal?: MembershipRewardReversalService,
  ) {}

  private async awardActivity(
    userId: string,
    activity: "community.post.created" | "community.comment.created",
    sourceRef: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.membershipWallet) return;
    try {
      await this.membershipWallet.grantActivityPoints({
        userId,
        activity,
        sourceRef,
        metadata,
      });
    } catch {
      // Community writes are authoritative; reward accounting is best-effort.
    }
  }
  private async reverseActivity(
    activity: "community.post.created" | "community.comment.created",
    sourceRef: string,
    actorUserId: string,
    reason: string,
  ): Promise<void> {
    if (!this.rewardReversal) return;
    try {
      await this.rewardReversal.reverseActivityBySource({
        activity,
        sourceRef,
        actorUserId,
        reason,
      });
    } catch {
      // Deletion/moderation remains authoritative if reward recovery is unavailable.
    }
  }

  private replyIds(replies: FanCafeReply[]): string[] {
    const result: string[] = [];
    const visit = (items: FanCafeReply[]) => {
      for (const reply of items) {
        result.push(reply.id);
        if (reply.children?.length) visit(reply.children);
      }
    };
    visit(replies);
    return result;
  }

  async boards(
    scopeValue: string | null,
    query: string | null,
    sortValue: string | null,
    limitValue: number | null,
    viewerId: string | null,
  ) {
    return withDatabaseCapability("community.boards.read", async () => {
      const scope = parseCommunityScopeFilter(scopeValue) ?? "all";
      const sort = parseCommunitySort(sortValue);
      const safeLimit = parseLimit(limitValue);
      const boards = await listCommunityBoards(
        scope,
        String(query ?? "").trim(),
        sort,
        safeLimit,
      );
      const visibleBoards = await filterAccessibleCafeBoards(boards, viewerId);
      return {
        items: visibleBoards,
        meta: {
          scope,
          sort,
          limit: safeLimit,
          total: visibleBoards.length,
          generatedAt: new Date().toISOString(),
        },
      };
    });
  }

  async listPosts(query: PostQuery) {
    return withDatabaseCapability("community.posts.read", async () => {
      const scope = parseCommunityScopeFilter(query.scope ?? null) ?? "all";
      const targetId = String(query.targetId ?? "").trim() || null;
      const kind = parsePostKindOrNull(query.kind);
      const sort = parsePostSort(query.sort);
      const safeLimit = parseLimit(query.limit ?? 20);
      const search = String(query.query ?? "").trim();
      const tag = String(query.tag ?? "").trim();
      const cursor = query.cursor ? String(query.cursor) : null;
      const mineUserId = parseBool(query.mineOnly) ? query.viewerId ?? null : null;
      if (query.mineOnly && !mineUserId) {
        throw new UnauthorizedException("로그인이 필요해요.");
      }
      if (scope !== "all" && !targetId) {
        throw new BadRequestException("scope가 all이 아니면 targetId가 필요합니다.");
      }
      if (scope === "cafe" && targetId) {
        await governed(
          () => assertCafePostAccessBySlug(targetId, query.viewerId ?? null),
          "community.posts.read",
        );
      }
      const result = await listFanPosts(
        scope,
        targetId,
        kind,
        search,
        tag,
        sort,
        cursor,
        safeLimit,
        mineUserId,
      );
      return {
        ...result,
        items: await filterAccessibleCafePosts(result.items, query.viewerId ?? null),
      };
    });
  }

  async createPost(body: PostPayload, userId: string) {
    return withDatabaseCapability("community.posts.write", async () => {
      const parsed = validatePostInput(body);
      if (parsed.error || !parsed.value) {
        throw new BadRequestException(parsed.error ?? "잘못된 요청");
      }
      if (parsed.value.scope === "cafe") {
        const cafe = await governed(
          () => assertCommunityPostingAccess(parsed.value!.targetId, userId),
          "community.posts.write",
        );
        parsed.value.targetLabel = cafe.name;
      }
      const post = await createFanPost(userId, parsed.value);
      await this.awardActivity(userId, "community.post.created", post.id, {
        scope: parsed.value.scope,
        kind: parsed.value.kind,
      });
      return post;
    });
  }

  async getPost(postId: string, viewerId: string | null): Promise<FanCafePost> {
    return withDatabaseCapability("community.posts.read", async () => {
      if (!postId) throw new BadRequestException("postId 필요");
      await governed(
        () => assertCafePostAccess(postId, viewerId),
        "community.posts.read",
      );
      const post = await getFanPost(postId);
      if (!post) throw new NotFoundException("토론 글을 찾을 수 없어요.");
      return post;
    });
  }

  async deletePost(postId: string, userId: string) {
    return withDatabaseCapability("community.posts.write", async () => {
      if (!postId) throw new BadRequestException("postId 필요");
      const replyIds = this.replyIds(await listFanPostReplies(postId));
      const result = await governed(
        () => deleteGovernedCommunityPost(postId, userId),
        "community.posts.write",
      );
      if (result.deleted) {
        await this.reverseActivity(
          "community.post.created",
          postId,
          userId,
          "게시글 삭제 또는 운영 조치에 따른 활동 포인트 회수",
        );
        await Promise.allSettled(
          replyIds.map((replyId) =>
            this.reverseActivity(
              "community.comment.created",
              replyId,
              userId,
              "게시글 삭제로 함께 제거된 댓글 활동 포인트 회수",
            ),
          ),
        );
      }
      return result;
    });
  }

  async deletePostReply(postId: string, replyId: string, userId: string) {
    return withDatabaseCapability("community.posts.write", async () => {
      if (!postId || !replyId) {
        throw new BadRequestException("postId/replyId 필요");
      }
      const result = await governed(
        () => deleteGovernedCommunityReply(postId, replyId, userId),
        "community.posts.write",
      );
      if (result.deleted) {
        await this.reverseActivity(
          "community.comment.created",
          replyId,
          userId,
          "댓글 삭제 또는 운영 조치에 따른 활동 포인트 회수",
        );
      }
      return result;
    });
  }

  async listPostReplies(postId: string, viewerId: string | null): Promise<FanCafeReply[]> {
    return withDatabaseCapability("community.posts.read", async () => {
      if (!postId) throw new BadRequestException("postId 필요");
      await governed(
        () => assertCafePostAccess(postId, viewerId),
        "community.posts.read",
      );
      return listFanPostReplies(postId);
    });
  }

  async createPostReply(postId: string, userId: string, body: ReplyPayload) {
    return withDatabaseCapability("community.posts.write", async () => {
      const parsed = validateReplyPayload(body);
      if (parsed.error || !parsed.text) {
        throw new BadRequestException(parsed.error ?? "답글의 상위 항목이 유효하지 않습니다.");
      }
      const post = await governed(
        () => assertCafePostAccess(postId, userId),
        "community.posts.write",
      );
      if (post.scope === "cafe") {
        await governed(
          () => assertCommunityPostingAccess(post.targetId, userId),
          "community.posts.write",
        );
      }
      const reply = await createFanPostReply({
        postId,
        userId,
        parentId: parsed.parentId,
        text: parsed.text,
      });
      await this.awardActivity(
        userId,
        "community.comment.created",
        reply.id,
        { postId },
      );
      return reply;
    });
  }

  async listCafes(
    genre: string | null,
    kind: string | null,
    query: string | null,
    sortValue: string | null,
    mineOnly: boolean,
    viewerId: string | null,
  ) {
    const sort = parseCommunitySort(sortValue) === "recent" ? "recent" : "popular";
    const items = await governed(
      () => listGovernedCafes({ genre, kind, query, sort, mineOnly, viewerId }),
      "community.cafes.read",
    );
    return {
      items,
      meta: { sort, total: items.length, generatedAt: new Date().toISOString() },
    };
  }

  async getCafe(slug: string, viewerId: string | null) {
    if (!slug) throw new BadRequestException("slug 필요");
    const cafe = await governed(
      () => getGovernedCafeBySlug(slug, viewerId),
      "community.cafes.read",
    );
    if (!cafe) throw new NotFoundException("커뮤니티를 찾을 수 없어요.");
    return cafe;
  }

  async createCafe(body: unknown, userId: string) {
    return governed(() => createGovernedCafe(userId, validateCommunityCafeCreateInput(body, GENRES)));
  }

  async updateCafe(slug: string, body: unknown, userId: string) {
    return governed(() => updateGovernedCafe(slug, userId, validateCommunityCafeUpdateInput(body, GENRES)));
  }

  async archiveCafe(slug: string, userId: string) {
    return governed(() => archiveGovernedCafe(slug, userId));
  }

  async joinCafe(slug: string, userId: string, body: { message?: unknown; inviteCode?: unknown }) {
    return governed(() => joinGovernedCafe(slug, userId, body));
  }

  async leaveCafe(slug: string, userId: string) {
    return governed(() => leaveOrCancelGovernedCafe(slug, userId));
  }

  async listCafeMembers(slug: string, userId: string) {
    return governed(
      () => listGovernedCafeMembers(slug, userId),
      "community.cafes.read",
    );
  }

  async updateCafeMemberRole(slug: string, targetUserId: string, role: unknown, userId: string) {
    return governed(() => updateGovernedCafeMemberRole(slug, targetUserId, userId, String(role) as CommunityCafeRole));
  }

  async transferCafeOwnership(slug: string, targetUserId: string, userId: string) {
    return governed(() => transferGovernedCafeOwnership(slug, targetUserId, userId));
  }

  async listCafeJoinRequests(slug: string, userId: string) {
    return governed(
      () => listGovernedCafeJoinRequests(slug, userId),
      "community.cafes.read",
    );
  }

  async reviewCafeJoinRequest(
    slug: string,
    requestId: string,
    decision: unknown,
    userId: string,
  ) {
    if (decision !== "approve" && decision !== "reject") {
      throw new BadRequestException("승인 또는 거절을 선택해 주세요.");
    }
    return governed(() => reviewGovernedCafeJoinRequest(slug, requestId, userId, decision));
  }

  async listCafeInvites(slug: string, userId: string) {
    return governed(
      () => listGovernedCafeInvites(slug, userId),
      "community.cafes.read",
    );
  }

  async createCafeInvite(slug: string, body: { maxUses?: unknown; expiresInDays?: unknown }, userId: string) {
    return governed(() => createGovernedCafeInvite(slug, userId, body));
  }

  async revokeCafeInvite(slug: string, inviteId: string, userId: string) {
    return governed(() => revokeGovernedCafeInvite(slug, inviteId, userId));
  }

  async listCafeBans(slug: string, userId: string) {
    return governed(
      () => listGovernedCafeBans(slug, userId),
      "community.cafes.read",
    );
  }

  async banCafeMember(
    slug: string,
    targetUserId: string,
    body: { reason?: unknown; expiresAt?: unknown },
    userId: string,
  ) {
    return governed(() => banGovernedCafeMember(slug, targetUserId, userId, body));
  }

  async unbanCafeMember(slug: string, targetUserId: string, userId: string) {
    return governed(() => unbanGovernedCafeMember(slug, targetUserId, userId));
  }

  async listCafeModerationLogs(slug: string, limit: number | null, userId: string) {
    return governed(
      () => listGovernedCafeModerationLogs(slug, userId, parseLimit(limit)),
      "community.cafes.read",
    );
  }

  async deleteReviewReply(reviewId: string, replyId: string, userId: string) {
    return withDatabaseCapability("community.reviews.write", async () => {
      if (!reviewId || !replyId) {
        throw new BadRequestException("reviewId/replyId 필요");
      }
      const result = await deleteReviewReply(userId, reviewId, replyId, false);
      if (result.deleted) {
        await this.reverseActivity(
          "community.comment.created",
          replyId,
          userId,
          "리뷰 답글 삭제에 따른 활동 포인트 회수",
        );
      }
      return result;
    });
  }

  async listReviewReplies(reviewId: string): Promise<ReviewReply[]> {
    return withDatabaseCapability("community.reviews.read", async () => {
      if (!reviewId) throw new BadRequestException("reviewId 필요");
      return listReviewReplies(reviewId);
    });
  }

  async createReviewReply(reviewId: string, userId: string, body: ReplyPayload) {
    return withDatabaseCapability("community.reviews.write", async () => {
      const parsed = validateReplyPayload(body);
      if (parsed.error || !parsed.text) {
        throw new BadRequestException(parsed.error ?? "답글의 상위 항목이 유효하지 않습니다.");
      }
      const reply = await createReviewReply({
        reviewId,
        parentId: parsed.parentId,
        userId,
        text: parsed.text,
        spoiler: Boolean(body.spoiler),
      });
      await this.awardActivity(
        userId,
        "community.comment.created",
        reply.id,
        { reviewId },
      );
      return reply;
    });
  }

  async getReviewsData(query: ReviewPayload) {
    return withDatabaseCapability("community.reviews.read", () =>
      getReviewsData({
        sort: query.sort ?? undefined,
        spoiler: query.spoiler ?? undefined,
        rating: query.rating ?? undefined,
        userId: query.userId ?? undefined,
      }),
    );
  }
}

async function assertCafePostAccessBySlug(slug: string, viewerId: string | null): Promise<CommunityCafe> {
  const cafe = await getGovernedCafeBySlug(slug, viewerId);
  if (!cafe || !cafe.viewerCanViewContent) {
    throw new CommunityGovernanceError("not-found", "커뮤니티를 찾을 수 없어요.");
  }
  return cafe;
}
