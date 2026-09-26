import { PinnedShareError } from "./pinned-share-storage";
import { applyDecorators, Body, Controller, Get, Header, Headers, HttpCode, Inject, Param, Post, Query, Req, StreamableFile } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import type { Request } from "express";
import { z } from "zod";
import { studioWorkSessionId } from "@toonspectrum/studio-project-model/work-session";
import { pinnedShareId, pinnedShareSubject, pinnedShareCreateSchema, pinnedShareAccessSchema, pinnedShareFeedbackInputSchema } from "@toonspectrum/studio-project-model/pinned-review-share";

import { ZodValidationPipe } from "../../../platform/http/zod-validation.pipe";
import { authenticatedStudioUserId } from "../studio-project-graph.controller";
import { PinnedReviewShareService } from "./pinned-share.service";
import { limitPinnedShareRequest, requirePinnedShareBrowserOrigin } from "./pinned-share-request";

const privateResponse = () => applyDecorators(Header("Cache-Control", "private, no-store, max-age=0"), Header("Referrer-Policy", "no-referrer"), Header("X-Content-Type-Options", "nosniff"), Header("X-Robots-Tag", "noindex, nofollow"));
class WorkParams extends createZodDto(z.object({ workId: studioWorkSessionId }).strict()) {}
class ShareParams extends createZodDto(z.object({ workId: studioWorkSessionId, shareId: pinnedShareId }).strict()) {}
class SourceBody extends createZodDto(z.object({ subject: pinnedShareSubject, offset: z.number().int().min(0).max(99_999) }).strict()) {}
class CreateBody extends createZodDto(pinnedShareCreateSchema) {}
class Cursor extends createZodDto(z.object({ cursor: pinnedShareId.optional() }).strict()) {}
class AccessBody extends createZodDto(z.object({ access: pinnedShareAccessSchema }).strict()) {}
class PageBody extends createZodDto(z.object({ access: pinnedShareAccessSchema, ordinal: z.number().int().min(0).max(99_999) }).strict()) {}
class CommentBody extends createZodDto(z.object({ access: pinnedShareAccessSchema, feedback: pinnedShareFeedbackInputSchema }).strict()) {}
@Controller("/creator")
export class PinnedReviewShareController {
  constructor(@Inject(PinnedReviewShareService) private readonly service: PinnedReviewShareService) {}
  @Post("works/:workId/pinned-review-shares/sources") @HttpCode(200) @privateResponse()
  sources(@Param(new ZodValidationPipe(WorkParams)) p: WorkParams, @Body(new ZodValidationPipe(SourceBody)) body: SourceBody, @Headers("x-user-id") actor?: string) {
    const user = authenticatedStudioUserId(actor);
    if (body.subject.workId !== p.workId) return this.service.run(async () => { throw new PinnedShareError("invalid-source"); });
    return this.service.run(() => this.service.sources(user, body.subject, body.offset));
  }
  @Post("works/:workId/pinned-review-shares") @HttpCode(200) @privateResponse()
  create(@Param(new ZodValidationPipe(WorkParams)) p: WorkParams, @Body(new ZodValidationPipe(CreateBody)) body: CreateBody, @Headers("x-user-id") actor?: string) {
    return this.service.run(() => this.service.create(authenticatedStudioUserId(actor), p.workId, body));
  }
  @Get("works/:workId/pinned-review-shares") @privateResponse()
  list(@Param(new ZodValidationPipe(WorkParams)) p: WorkParams, @Query(new ZodValidationPipe(Cursor)) query: Cursor, @Headers("x-user-id") actor?: string) {
    return this.service.run(() => this.service.repository.list(authenticatedStudioUserId(actor), p.workId, query.cursor ?? null));
  }
  @Get("works/:workId/pinned-review-shares/:shareId") @privateResponse()
  current(@Param(new ZodValidationPipe(ShareParams)) p: ShareParams, @Headers("x-user-id") actor?: string) {
    return this.service.run(() => this.service.repository.current(authenticatedStudioUserId(actor), p.workId, p.shareId));
  }
  @Post("works/:workId/pinned-review-shares/:shareId/revoke") @HttpCode(200) @privateResponse()
  revoke(@Param(new ZodValidationPipe(ShareParams)) p: ShareParams, @Headers("x-user-id") actor?: string) {
    return this.service.run(() => this.service.repository.revoke(authenticatedStudioUserId(actor), p.workId, p.shareId));
  }
  @Post("pinned-review-shares/view") @HttpCode(200) @privateResponse()
  view(@Body(new ZodValidationPipe(AccessBody)) body: AccessBody, @Req() req: Request) {
    requirePinnedShareBrowserOrigin(req); limitPinnedShareRequest(req, "read", JSON.stringify(body.access));
    return this.service.run(() => this.service.repository.view(body.access));
  }
  @Post("pinned-review-shares/page") @HttpCode(200) @privateResponse()
  async image(@Body(new ZodValidationPipe(PageBody)) body: PageBody, @Req() req: Request) {
    requirePinnedShareBrowserOrigin(req); limitPinnedShareRequest(req, "image", JSON.stringify(body.access));
    const abort = new AbortController(), stop = () => abort.abort(); req.once("aborted", stop);
    try {
      const result = await this.service.run(() => this.service.image(body.access, body.ordinal, abort.signal));
      return new StreamableFile(result.bytes, { type: result.page.mediaType, length: result.bytes.length,
        disposition: `inline; filename="review-page-${body.ordinal + 1}.${result.page.mediaType === "image/png" ? "png" : result.page.mediaType === "image/jpeg" ? "jpg" : "webp"}"` });
    } finally { req.off("aborted", stop); }
  }
  @Post("pinned-review-shares/feedback") @HttpCode(200) @privateResponse()
  comment(@Body(new ZodValidationPipe(CommentBody)) body: CommentBody, @Req() req: Request) {
    requirePinnedShareBrowserOrigin(req); limitPinnedShareRequest(req, "comment", JSON.stringify(body.access));
    return this.service.run(() => this.service.repository.comment(body.access, body.feedback));
  }
  @Get("pinned-review-shares/showcase") @privateResponse()
  publicList(@Query(new ZodValidationPipe(Cursor)) query: Cursor, @Req() req: Request) {
    limitPinnedShareRequest(req, "read");
    return this.service.run(() => this.service.repository.publicList(query.cursor ?? null));
  }
}
