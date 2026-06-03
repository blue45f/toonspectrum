import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { FeedbackService } from "./feedback.service";

interface ListQuery {
  category?: string | null;
  status?: string | null;
  q?: string | null;
  tag?: string | null;
  sort?: string | null;
  cursor?: string | null;
  limit?: number | null;
}

const RateLimitStore: Record<string, number[]> = {};

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

function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (RateLimitStore[key] ?? []).filter((ts) => now - ts < windowMs);
  if (recent.length >= limit) {
    RateLimitStore[key] = recent;
    throw new HttpException(
      { error: "요청이 너무 잦습니다.", status: HttpStatus.TOO_MANY_REQUESTS },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
  recent.push(now);
  RateLimitStore[key] = recent;
  if (Object.keys(RateLimitStore).length > 10000) {
    const keys = Object.keys(RateLimitStore);
    for (let i = 0; i < 100; i++) delete RateLimitStore[keys[i]];
  }
}

@Controller()
export class FeedbackController {
  private readonly feedbackService = new FeedbackService();

  @Get("/feedback/posts")
  @Header("Cache-Control", "no-store, max-age=0")
  async listPosts(@Query() query: ListQuery) {
    return this.feedbackService.listPosts(query);
  }

  @Post("/feedback/posts")
  async createPost(@Body() body: unknown, @Headers("x-user-id") userId?: string, @Req() req?: Request) {
    const uid = enforceUserOrError(userId);
    rateLimit(`feedback-post:${uid}:${parseIp(req ?? ({} as Request))}`, 8, 10 * 60_000);
    return this.feedbackService.createPost(uid, body);
  }

  @Get("/feedback/posts/:id/replies")
  @Header("Cache-Control", "no-store, max-age=0")
  async listReplies(@Param("id") postId: string) {
    return this.feedbackService.listReplies(postId);
  }

  @Post("/feedback/posts/:id/replies")
  async createReply(
    @Param("id") postId: string,
    @Body() body: unknown,
    @Headers("x-user-id") userId?: string,
    @Req() req?: Request
  ) {
    const uid = enforceUserOrError(userId);
    rateLimit(`feedback-reply:${uid}:${parseIp(req ?? ({} as Request))}`, 30, 10 * 60_000);
    return this.feedbackService.createReply(postId, uid, body);
  }
}
