import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Headers,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request } from "express";
import { CommunityService } from "./community.service";

interface ReviewQuery {
  sort?: string | null;
  spoiler?: string | null;
  rating?: string | null;
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
}

interface ReplyPayload {
  text?: unknown;
  parentId?: unknown;
  spoiler?: unknown;
}

function parseIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim();
  }
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim()) {
    return real.trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

function enforceUserOrError(userId: string | null | undefined) {
  if (!userId) throw new UnauthorizedException("로그인이 필요해요.");
  return userId;
}

function parseRateLimit(limit: number, windowMs: number, key: string): void {
  const now = Date.now();
  const bucket = (CommunityRateLimitStore[key] ?? []);
  const recent = bucket.filter((ts) => now - ts < windowMs);
  if (recent.length >= limit) {
    CommunityRateLimitStore[key] = recent;
    throw new HttpException(
      { error: "요청이 너무 잦습니다.", status: HttpStatus.TOO_MANY_REQUESTS },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
  recent.push(now);
  CommunityRateLimitStore[key] = recent;
}

function parseMine(value: string | null | undefined): boolean {
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
    if (Object.keys(CommunityRateLimitStore).length > 10000) {
      const keys = Object.keys(CommunityRateLimitStore);
      for (let i = 0; i < 100; i++) delete CommunityRateLimitStore[keys[i]];
    }
  }

  @Get("/community/boards")
  @Header("Cache-Control", "no-store, max-age=0")
  async listBoards(@Query() query: BoardQuery) {
    return this.communityService.boards(query.scope ?? null, query.q ?? null, query.sort ?? null, query.limit ?? null);
  }

  @Get("/community/posts")
  @Header("Cache-Control", "no-store, max-age=0")
  async listPosts(@Query() query: PostQuery, @Headers("x-user-id") userId?: string) {
    const mineOnly = parseMine(query.mine);
    return this.communityService.listPosts({
      mineOnly,
      scope: query.scope ?? null,
      targetId: query.targetId ?? null,
      kind: query.kind ?? null,
      sort: query.sort ?? null,
      query: query.q ?? null,
      tag: query.tag ?? null,
      cursor: query.cursor ?? null,
      limit: query.limit ?? null,
      requesterId: mineOnly ? userId ?? null : null,
    });
  }

  @Post("/community/posts")
  async createPost(@Body() body: PostPayload, @Headers("x-user-id") userId?: string, @Req() req?: Request) {
    const uid = enforceUserOrError(userId);
    try {
      this.checkRateLimit(`fan-post:${uid}:${parseIp(req ?? ({} as Request))}`, 12, 10 * 60_000);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException("게시글 작성이 너무 잦아요. 잠시 후 다시 시도해 주세요.");
    }
    return this.communityService.createPost(body, uid);
  }

  @Get("/community/posts/:id/replies")
  @Header("Cache-Control", "no-store, max-age=0")
  async listPostReplies(@Param("id") postId: string) {
    return this.communityService.listPostReplies(postId);
  }

  @Post("/community/posts/:id/replies")
  async createPostReply(
    @Param("id") postId: string,
    @Body() body: ReplyPayload,
    @Headers("x-user-id") userId?: string,
    @Req() req?: Request
  ) {
    const uid = enforceUserOrError(userId);
    this.checkRateLimit(`fan-reply:${uid}:${parseIp(req ?? ({} as Request))}`, 30, 10 * 60_000);
    return this.communityService.createPostReply(postId, uid, body);
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
    @Req() req?: Request
  ) {
    const uid = enforceUserOrError(userId);
    this.checkRateLimit(`review-reply:${uid}:${parseIp(req ?? ({} as Request))}`, 20, 10 * 60_000);
    return this.communityService.createReviewReply(reviewId, uid, body);
  }
}
