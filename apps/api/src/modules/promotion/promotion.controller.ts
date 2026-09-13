import { Body, Controller, Delete, Get, Header, Headers, HttpException, Param, Patch, Post, Query, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";

import { PromotionService } from "./promotion.service";

const buckets = new Map<string, number[]>();
function actor(userId: string | undefined, action: string): string {
  // The global sessionAuth middleware verifies the cookie/token and rewrites this internal header.
  if (!userId) throw new UnauthorizedException("로그인이 필요해요.");
  const key = `${action}:${userId}`, now = Date.now(), recent = (buckets.get(key) ?? []).filter((time) => now - time < 600000);
  if (recent.length >= 30) throw new HttpException("요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.", 429);
  recent.push(now); buckets.delete(key); buckets.set(key, recent);
  if (buckets.size > 10000) buckets.delete(buckets.keys().next().value!);
  return userId;
}
async function boundary<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new ServiceUnavailableException("홍보 커뮤니티 저장소에 연결하지 못했어요. 작성 내용을 유지하고 다시 시도해 주세요.");
  }
}
@Controller("/promotions")
export class PromotionController {
  private readonly service = new PromotionService();
  @Get("/posts") @Header("Cache-Control", "private, no-store")
  list(@Query() query: Record<string, unknown>, @Headers("x-user-id") userId?: string) { return boundary(() => this.service.list(query, userId)); }
  @Get("/posts/:id") @Header("Cache-Control", "private, no-store")
  detail(@Param("id") id: string, @Headers("x-user-id") userId?: string) { return boundary(() => this.service.detail(id, userId)); }
  @Post("/posts")
  create(@Body() body: unknown, @Headers("x-user-id") userId?: string) { const uid = actor(userId, "publish"); return boundary(() => this.service.create(uid, body)); }
  @Patch("/posts/:id")
  update(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") userId?: string) { const uid = actor(userId, "edit"); return boundary(() => this.service.update(id, uid, body)); }
  @Patch("/posts/:id/archive")
  archive(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") userId?: string) { const uid = actor(userId, "archive"); return boundary(() => this.service.archive(id, uid, body)); }
  @Post("/posts/:id/bookmark")
  bookmark(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") userId?: string) { const uid = actor(userId, "bookmark"); return boundary(() => this.service.bookmark(id, uid, body)); }
  @Post("/posts/:id/comments")
  comment(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") userId?: string) { const uid = actor(userId, "comment"); return boundary(() => this.service.comment(id, uid, body)); }
  @Delete("/posts/:id/comments/:commentId")
  deleteComment(@Param("id") id: string, @Param("commentId") commentId: string, @Headers("x-user-id") userId?: string) { const uid = actor(userId, "delete-comment"); return boundary(() => this.service.deleteComment(id, commentId, uid)); }
  @Post("/posts/:id/reports")
  report(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") userId?: string) { const uid = actor(userId, "report"); return boundary(() => this.service.report(id, uid, body)); }
  @Get("/reports") @Header("Cache-Control", "private, no-store")
  reports(@Headers("x-user-id") userId?: string) { const uid = actor(userId, "moderation-list"); return boundary(() => this.service.reports(uid)); }
  @Patch("/posts/:id/visibility")
  moderate(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") userId?: string) { const uid = actor(userId, "moderation"); return boundary(() => this.service.moderate(id, uid, body)); }
}
