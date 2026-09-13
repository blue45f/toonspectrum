import { Body, Controller, Delete, Get, Header, Headers, HttpException, Param, Patch, Post, Query } from "@nestjs/common";

import { CollaborationService, requireCollaborationUser } from "./collaboration.service";

// Bounded, per-instance abuse guard. Authentication and CSRF run in shared HTTP infrastructure.
const buckets = new Map<string, number[]>();
export function collaborationWriteGate(userId: string | undefined, action: string, limit = 40): string {
  const uid = requireCollaborationUser(userId);
  const key = `${action}:${uid}`; const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((time) => now - time < 600_000);
  if (recent.length >= limit) throw new HttpException("요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.", 429);
  buckets.delete(key); buckets.set(key, [...recent, now]);
  if (buckets.size > 10_000) { const oldest = buckets.keys().next().value; if (oldest) buckets.delete(oldest); }
  return uid;
}
@Controller("/collaborations")
export class CollaborationController {
  private readonly service = new CollaborationService();
  @Get("/posts")
  @Header("Cache-Control", "private, no-store, max-age=0")
  list(@Query() query: Record<string, unknown>, @Headers("x-user-id") userId?: string) { return this.service.list(query, userId); }
  @Get("/posts/:id")
  @Header("Cache-Control", "private, no-store, max-age=0")
  detail(@Param("id") id: string, @Headers("x-user-id") userId?: string) { return this.service.detail(id, userId); }
  @Post("/posts")
  create(@Body() input: unknown, @Headers("x-user-id") userId?: string) { return this.service.create(collaborationWriteGate(userId, "create", 8), input); }
  @Patch("/posts/:id")
  update(@Param("id") id: string, @Body() input: unknown, @Headers("x-user-id") userId?: string) { return this.service.update(id, collaborationWriteGate(userId, "update"), input); }
  @Patch("/posts/:id/status")
  status(@Param("id") id: string, @Body() input: unknown, @Headers("x-user-id") userId?: string) { return this.service.setStatus(id, collaborationWriteGate(userId, "status"), input); }
  @Delete("/posts/:id")
  remove(@Param("id") id: string, @Headers("x-user-id") userId?: string) { return this.service.remove(id, collaborationWriteGate(userId, "delete")); }
  @Post("/posts/:id/applications")
  apply(@Param("id") id: string, @Body() input: unknown, @Headers("x-user-id") userId?: string) { return this.service.apply(id, collaborationWriteGate(userId, "apply", 15), input); }
  @Get("/posts/:id/applications")
  @Header("Cache-Control", "private, no-store, max-age=0")
  applications(@Param("id") id: string, @Headers("x-user-id") userId?: string) { return this.service.applications(id, userId); }
  @Delete("/posts/:id/applications/me")
  withdraw(@Param("id") id: string, @Headers("x-user-id") userId?: string) { return this.service.withdraw(id, collaborationWriteGate(userId, "withdraw")); }
  @Patch("/posts/:id/applications/:applicationId")
  applicationStatus(@Param("id") id: string, @Param("applicationId") applicationId: string, @Body() input: unknown, @Headers("x-user-id") userId?: string) {
    return this.service.applicationStatus(id, applicationId, collaborationWriteGate(userId, "review"), input);
  }
  @Post("/posts/:id/bookmark")
  bookmark(@Param("id") id: string, @Body() input: unknown, @Headers("x-user-id") userId?: string) { return this.service.bookmark(id, collaborationWriteGate(userId, "bookmark", 100), input); }
  @Post("/posts/:id/reports")
  report(@Param("id") id: string, @Body() input: unknown, @Headers("x-user-id") userId?: string) { return this.service.report(id, collaborationWriteGate(userId, "report", 10), input); }
  @Get("/reports")
  @Header("Cache-Control", "private, no-store, max-age=0")
  reports(@Headers("x-user-id") userId?: string) { return this.service.reports(userId); }
  @Patch("/posts/:id/visibility")
  moderate(@Param("id") id: string, @Body() input: unknown, @Headers("x-user-id") userId?: string) { return this.service.moderate(id, collaborationWriteGate(userId, "moderate"), input); }
}
