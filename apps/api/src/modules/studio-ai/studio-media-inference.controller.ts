import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Param, Post, Res, StreamableFile, UnauthorizedException } from "@nestjs/common";
import type { Response } from "express";
import { StudioMediaInferenceService } from "./studio-media-inference.service";

function owner(value: string | undefined): string {
  if (!value?.trim()) throw new UnauthorizedException("생성형 변환은 로그인이 필요해요.");
  return value.trim();
}
/** x-user-id is supplied by the application's existing verified identity middleware, not a public key. */
@Controller("studio-ai/media")
export class StudioMediaInferenceController {
  constructor(@Inject(StudioMediaInferenceService) private readonly service: StudioMediaInferenceService) {}
  @Get("status") @Header("Cache-Control", "no-store") status() { return this.service.status(); }
  @Get("jobs") @Header("Cache-Control", "private, no-store") list(@Headers("x-user-id") user: string | undefined) { return this.service.list(owner(user)); }
  @Get("jobs/:id") @Header("Cache-Control", "private, no-store") get(@Headers("x-user-id") user: string | undefined, @Param("id") id: string) { return this.service.get(owner(user), id); }
  @Post("jobs") @HttpCode(202) create(@Headers("x-user-id") user: string | undefined, @Headers("idempotency-key") key: string | undefined, @Body() input: unknown) { return this.service.create(owner(user), key ?? "", input); }
  @Post("jobs/:id/cancel") @HttpCode(200) cancel(@Headers("x-user-id") user: string | undefined, @Param("id") id: string) { return this.service.cancel(owner(user),id); }
  @Get("jobs/:id/artifacts/:index") @Header("Cache-Control", "private, no-store")
  async artifact(@Headers("x-user-id") user: string | undefined, @Param("id") id: string, @Param("index") index: string, @Res({ passthrough: true }) response: Response) {
    const result = await this.service.artifact(owner(user),id, /^\d+$/u.test(index) ? Number(index) : -1);
    response.setHeader("Content-Type",result.mime); response.setHeader("X-Content-Type-Options","nosniff");
    response.setHeader("Content-Disposition",`attachment; filename="${result.name}"`); response.setHeader("X-Content-SHA256",result.sha256);
    return new StreamableFile(Buffer.from(result.bytes));
  }
}
