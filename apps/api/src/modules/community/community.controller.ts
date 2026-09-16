import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";

import { CommunityService } from "./community.service";

import type { Request } from "express";

interface ReviewQuery {
  sort?: string | null;
  spoiler?: string | null;
  rating?: string | null;
  userId?: string | null;
}

interface PostQuery {
  mine?: string | null;
  scope?: string | null;
  targetId?: string | null;
  kind?: string | null;
  sort?: string | null;
  q?: string | null;
  tag?: string | null;
  cursor?: string | null;
  limit?: number | null;
}

interface BoardQuery {
  scope?: string | null;
  sort?: string | null;
  q?: string | null;
  limit?: number | null;
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

interface ReplyPayload {
  text?: unknown;
  parentId?: unknown;
  spoiler?: unknown;
}

function parseIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim()) return real.trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function enforceUserOrError(userId: string | null | undefined) {
  if (!userId) throw new UnauthorizedException("로그인이 필요해요.");
  return userId;
}

function parseRateLimit(limit: number, windowMs: number, key: string): void {
  const now = Date.now();
  const bucket = CommunityRateLimitStore[key] ?? [];
  const recent = bucket.filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) {
    CommunityRateLimitStore[key] = recent;
    throw new HttpException(
      { error: "요청이 너무 잦습니다.", status: HttpStatus.TOO_MANY_REQUESTS },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  recent.push(now);
  CommunityRateLimitStore[key] = recent;
}

function parseBoolean(value: string | null | undefined): boolean {
  return value === "1" || value === "true" || value?.toLowerCase() === "true";
}

const CommunityRateLimitStore: Record<string, number[]> = {};

@Controller()
export class CommunityController {
  private readonly communityService: CommunityService;

  constructor() {
    this.communityService = new CommunityService();
  }

  private checkRateLimit(key: string, limit: number, windowMs: number) {
    parseRateLimit(limit, windowMs, key);
    if (Object.keys(CommunityRateLimitStore).length > 10_000) {
      for (const keyToDelete of Object.keys(CommunityRateLimitStore).slice(0, 100)) {
        delete CommunityRateLimitStore[keyToDelete];
      }
    }
  }

  @Get("/community/boards")
  @Header("Cache-Control", "no-store, max-age=0")
  async listBoards(
    @Query() query: BoardQuery,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.communityService.boards(
      query.scope ?? null,
      query.q ?? null,
      query.sort ?? null,
      query.limit ?? null,
      userId ?? null,
    );
  }

  @Get("/community/cafes")
  @Header("Cache-Control", "no-store, max-age=0")
  async listCafes(
    @Query()
    query: {
      genre?: string | null;
      kind?: string | null;
      q?: string | null;
      sort?: string | null;
      mine?: string | null;
    },
    @Headers("x-user-id") userId?: string,
  ) {
    return this.communityService.listCafes(
      query.genre ?? null,
      query.kind ?? null,
      query.q ?? null,
      query.sort ?? null,
      parseBoolean(query.mine),
      userId ?? null,
    );
  }

  @Post("/community/cafes")
  async createCafe(
    @Body() body: unknown,
    @Headers("x-user-id") userId?: string,
    @Req() req?: Request,
  ) {
    const uid = enforceUserOrError(userId);
    this.checkRateLimit(`cafe-create:${uid}:${parseIp(req ?? ({} as Request))}`, 4, 60 * 60_000);
    return this.communityService.createCafe(body, uid);
  }

  @Get("/community/cafes/:slug")
  @Header("Cache-Control", "no-store, max-age=0")
  async getCafe(@Param("slug") slug: string, @Headers("x-user-id") userId?: string) {
    return this.communityService.getCafe(slug, userId ?? null);
  }

  @Patch("/community/cafes/:slug")
  async updateCafe(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.communityService.updateCafe(slug, body, enforceUserOrError(userId));
  }

  @Delete("/community/cafes/:slug")
  async archiveCafe(@Param("slug") slug: string, @Headers("x-user-id") userId?: string) {
    return this.communityService.archiveCafe(slug, enforceUserOrError(userId));
  }

  @Post("/community/cafes/:slug/membership")
  async joinCafe(
    @Param("slug") slug: string,
    @Body() body: { message?: unknown; inviteCode?: unknown } = {},
    @Headers("x-user-id") userId?: string,
    @Req() req?: Request,
  ) {
    const uid = enforceUserOrError(userId);
    this.checkRateLimit(`cafe-join:${uid}:${parseIp(req ?? ({} as Request))}`, 30, 10 * 60_000);
    return this.communityService.joinCafe(slug, uid, body);
  }

  @Delete("/community/cafes/:slug/membership")
  async leaveCafe(@Param("slug") slug: string, @Headers("x-user-id") userId?: string) {
    return this.communityService.leaveCafe(slug, enforceUserOrError(userId));
  }

  @Get("/community/cafes/:slug/members")
  @Header("Cache-Control", "no-store, max-age=0")
  async listCafeMembers(@Param("slug") slug: string, @Headers("x-user-id") userId?: string) {
    return this.communityService.listCafeMembers(slug, enforceUserOrError(userId));
  }

  @Patch("/community/cafes/:slug/members/:memberUserId")
  async updateCafeMemberRole(
    @Param("slug") slug: string,
    @Param("memberUserId") memberUserId: string,
    @Body() body: { role?: unknown },
    @Headers("x-user-id") userId?: string,
  ) {
    return this.communityService.updateCafeMemberRole(
      slug,
      memberUserId,
      body.role,
      enforceUserOrError(userId),
    );
  }

  @Post("/community/cafes/:slug/ownership")
  async transferCafeOwnership(
    @Param("slug") slug: string,
    @Body() body: { userId?: unknown },
    @Headers("x-user-id") userId?: string,
  ) {
    const targetUserId = String(body.userId ?? "").trim();
    if (!targetUserId) throw new BadRequestException("소유권을 받을 회원이 필요해요.");
    return this.communityService.transferCafeOwnership(
      slug,
      targetUserId,
      enforceUserOrError(userId),
    );
  }

  @Get("/community/cafes/:slug/join-requests")
  @Header("Cache-Control", "no-store, max-age=0")
  async listCafeJoinRequests(
    @Param("slug") slug: string,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.communityService.listCafeJoinRequests(slug, enforceUserOrError(userId));
  }

  @Patch("/community/cafes/:slug/join-requests/:requestId")
  async reviewCafeJoinRequest(
    @Param("slug") slug: string,
    @Param("requestId") requestId: string,
    @Body() body: { decision?: unknown },
    @Headers("x-user-id") userId?: string,
  ) {
    return this.communityService.reviewCafeJoinRequest(
      slug,
      requestId,
      body.decision,
      enforceUserOrError(userId),
    );
  }

  @Get("/community/cafes/:slug/invites")
  @Header("Cache-Control", "no-store, max-age=0")
  async listCafeInvites(@Param("slug") slug: string, @Headers("x-user-id") userId?: string) {
    return this.communityService.listCafeInvites(slug, enforceUserOrError(userId));
  }

  @Post("/community/cafes/:slug/invites")
  async createCafeInvite(
    @Param("slug") slug: string,
    @Body() body: { maxUses?: unknown; expiresInDays?: unknown },
    @Headers("x-user-id") userId?: string,
    @Req() req?: Request,
  ) {
    const uid = enforceUserOrError(userId);
    this.checkRateLimit(`cafe-invite:${uid}:${parseIp(req ?? ({} as Request))}`, 20, 60 * 60_000);
    return this.communityService.createCafeInvite(slug, body, uid);
  }

  @Delete("/community/cafes/:slug/invites/:inviteId")
  async revokeCafeInvite(
    @Param("slug") slug: string,
    @Param("inviteId") inviteId: string,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.communityService.revokeCafeInvite(slug, inviteId, enforceUserOrError(userId));
  }

  @Get("/community/cafes/:slug/bans")
  @Header("Cache-Control", "no-store, max-age=0")
  async listCafeBans(@Param("slug") slug: string, @Headers("x-user-id") userId?: string) {
    return this.communityService.listCafeBans(slug, enforceUserOrError(userId));
  }

  @Post("/community/cafes/:slug/bans")
  async banCafeMember(
    @Param("slug") slug: string,
    @Body() body: { userId?: unknown; reason?: unknown; expiresAt?: unknown },
    @Headers("x-user-id") userId?: string,
  ) {
    const targetUserId = String(body.userId ?? "").trim();
    if (!targetUserId) throw new BadRequestException("차단할 회원이 필요해요.");
    return this.communityService.banCafeMember(
      slug,
      targetUserId,
      body,
      enforceUserOrError(userId),
    );
  }

  @Delete("/community/cafes/:slug/bans/:bannedUserId")
  async unbanCafeMember(
    @Param("slug") slug: string,
    @Param("bannedUserId") bannedUserId: string,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.communityService.unbanCafeMember(
      slug,
      bannedUserId,
      enforceUserOrError(userId),
    );
  }

  @Get("/community/cafes/:slug/moderation-logs")
  @Header("Cache-Control", "no-store, max-age=0")
  async listCafeModerationLogs(
    @Param("slug") slug: string,
    @Query("limit") limit: number | null,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.communityService.listCafeModerationLogs(
      slug,
      limit,
      enforceUserOrError(userId),
    );
  }

  @Get("/community/posts")
  @Header("Cache-Control", "no-store, max-age=0")
  async listPosts(@Query() query: PostQuery, @Headers("x-user-id") userId?: string) {
    return this.communityService.listPosts({
      mineOnly: parseBoolean(query.mine),
      scope: query.scope ?? null,
      targetId: query.targetId ?? null,
      kind: query.kind ?? null,
      sort: query.sort ?? null,
      query: query.q ?? null,
      tag: query.tag ?? null,
      cursor: query.cursor ?? null,
      limit: query.limit ?? null,
      viewerId: userId ?? null,
    });
  }

  @Post("/community/posts")
  async createPost(
    @Body() body: PostPayload,
    @Headers("x-user-id") userId?: string,
    @Req() req?: Request,
  ) {
    const uid = enforceUserOrError(userId);
    this.checkRateLimit(`fan-post:${uid}:${parseIp(req ?? ({} as Request))}`, 12, 10 * 60_000);
    return this.communityService.createPost(body, uid);
  }

  @Get("/community/posts/:id")
  @Header("Cache-Control", "no-store, max-age=0")
  async getPost(@Param("id") id: string, @Headers("x-user-id") userId?: string) {
    return this.communityService.getPost(id, userId ?? null);
  }

  @Delete("/community/posts/:id")
  async deletePost(@Param("id") id: string, @Headers("x-user-id") userId?: string) {
    return this.communityService.deletePost(id, enforceUserOrError(userId));
  }

  @Get("/community/posts/:id/replies")
  @Header("Cache-Control", "no-store, max-age=0")
  async listPostReplies(@Param("id") postId: string, @Headers("x-user-id") userId?: string) {
    return this.communityService.listPostReplies(postId, userId ?? null);
  }

  @Post("/community/posts/:id/replies")
  async createPostReply(
    @Param("id") postId: string,
    @Body() body: ReplyPayload,
    @Headers("x-user-id") userId?: string,
    @Req() req?: Request,
  ) {
    const uid = enforceUserOrError(userId);
    this.checkRateLimit(`fan-reply:${uid}:${parseIp(req ?? ({} as Request))}`, 30, 10 * 60_000);
    return this.communityService.createPostReply(postId, uid, body);
  }

  @Delete("/community/posts/:id/replies/:replyId")
  async deletePostReply(
    @Param("id") postId: string,
    @Param("replyId") replyId: string,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.communityService.deletePostReply(
      postId,
      replyId,
      enforceUserOrError(userId),
    );
  }

  @Get("/reviews")
  @Header("Cache-Control", "no-store, max-age=0")
  async getReviews(@Query() query: ReviewQuery) {
    return this.communityService.getReviewsData(query);
  }

  @Get("/reviews/:id/replies")
  @Header("Cache-Control", "no-store, max-age=0")
  async listReviewReplies(@Param("id") reviewId: string) {
    return this.communityService.listReviewReplies(reviewId);
  }

  @Post("/reviews/:id/replies")
  async createReviewReply(
    @Param("id") reviewId: string,
    @Body() body: ReplyPayload,
    @Headers("x-user-id") userId?: string,
    @Req() req?: Request,
  ) {
    const uid = enforceUserOrError(userId);
    this.checkRateLimit(`review-reply:${uid}:${parseIp(req ?? ({} as Request))}`, 20, 10 * 60_000);
    return this.communityService.createReviewReply(reviewId, uid, body);
  }

  @Delete("/reviews/:id/replies/:replyId")
  async deleteReviewReply(
    @Param("id") reviewId: string,
    @Param("replyId") replyId: string,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.communityService.deleteReviewReply(
      reviewId,
      replyId,
      enforceUserOrError(userId),
    );
  }
}
