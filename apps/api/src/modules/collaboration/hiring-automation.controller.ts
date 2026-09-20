import { Body, Controller, Get, Header, Headers, Inject, Param, Post } from "@nestjs/common";
import { z } from "zod";

import { collaborationWriteGate } from "./collaboration.controller";
import { requireCollaborationUser } from "./collaboration.service";
import { HiringAutomationRepository } from "./hiring-automation.repository";
import { hiringId, parseHiring, revision } from "./hiring.validation";

export const autoStartSchema = z.strictObject({ mutationId: hiringId, expectedRevision: revision, expectedPostVersion: revision, mode: z.literal("automatic") });
@Controller("/collaborations/hiring/posts/:postId/slots/:slotId/campaign/automation")
export class HiringAutomationController {
  constructor(@Inject(HiringAutomationRepository) private readonly jobs: HiringAutomationRepository) {}
  @Get() @Header("Cache-Control", "private, no-store, max-age=0")
  state(@Param("postId") post: string, @Param("slotId") slot: string, @Headers("x-user-id") actor?: string) { return this.jobs.state(requireCollaborationUser(actor), parseHiring(hiringId, post), parseHiring(hiringId, slot)); }
  @Post("/start") @Header("Cache-Control", "private, no-store, max-age=0")
  start(@Param("postId") post: string, @Param("slotId") slot: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.jobs.start(collaborationWriteGate(actor, "auto-campaign", 20), parseHiring(hiringId, post), parseHiring(hiringId, slot), parseHiring(autoStartSchema, body)); }
  @Post("/stop") @Header("Cache-Control", "private, no-store, max-age=0")
  stop(@Param("postId") post: string, @Param("slotId") slot: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { parseHiring(z.strictObject({}), body); return this.jobs.stop(collaborationWriteGate(actor, "auto-campaign", 20), parseHiring(hiringId, post), parseHiring(hiringId, slot)); }
}
