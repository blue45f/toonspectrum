import {
  Body, Controller, Get, Header, Headers, HttpException, HttpStatus, Param, Post, Query, UnauthorizedException,
} from "@nestjs/common";

import { FeedbackService } from "./feedback.service";

import type { FeedbackListQuery } from "./feedback.service";

// Per authenticated user, not spoofable proxy headers. This is a bounded per-instance guard;
// global abuse controls remain the deployment gateway's responsibility.
const rateLimitStore = new Map<string, number[]>();
function enforceUserOrError(userId: string | undefined): string {
  // sessionAuth has already verified the HttpOnly cookie/token and rewritten this internal header.
  if (!userId) throw new UnauthorizedException("로그인이 필요해요.");
  return userId;
}
function rateLimit(key: string, limit: number, windowMs = 10 * 60_000): void {
  const now = Date.now();
  const recent = (rateLimitStore.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) throw new HttpException("요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.", HttpStatus.TOO_MANY_REQUESTS);
  recent.push(now);
  rateLimitStore.delete(key);
  rateLimitStore.set(key, recent);
  if (rateLimitStore.size > 10_000) {
    const oldest = rateLimitStore.keys().next().value;
    if (oldest !== undefined) rateLimitStore.delete(oldest);
  }
}
@Controller()
export class FeedbackController {
  private readonly feedbackService = new FeedbackService();

  @Get("/feedback/posts")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async listPosts(@Query() query: FeedbackListQuery, @Headers("x-user-id") userId?: string) {
    return this.feedbackService.listPosts(query, userId);
  }

  @Get("/feedback/posts/:id")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async getPost(@Param("id") postId: string, @Headers("x-user-id") userId?: string) {
    return this.feedbackService.getPost(postId, userId);
  }

  @Post("/feedback/posts")
  async createPost(@Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    rateLimit(`post:${uid}`, 8);
    return this.feedbackService.createPost(uid, body);
  }

  @Get("/feedback/posts/:id/replies")
  @Header("Cache-Control", "no-store, max-age=0")
  async listReplies(@Param("id") postId: string) { return this.feedbackService.listReplies(postId); }

  @Post("/feedback/posts/:id/replies")
  async createReply(@Param("id") postId: string, @Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    rateLimit(`reply:${uid}`, 30);
    return this.feedbackService.createReply(postId, uid, body);
  }

  @Post("/feedback/posts/:id/vote")
  async vote(@Param("id") postId: string, @Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    rateLimit(`vote:${uid}`, 100);
    return this.feedbackService.vote(postId, uid, body);
  }

  @Post("/feedback/posts/:id/progress")
  async changeProgress(@Param("id") postId: string, @Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const uid = enforceUserOrError(userId);
    rateLimit(`progress:${uid}`, 60);
    return this.feedbackService.changeProgress(postId, uid, body);
  }
}
