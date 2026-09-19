import { Body, Controller, Get, Header, Headers, Optional, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";

import { collaborationWriteGate } from "./collaboration.controller";
import { requireCollaborationUser } from "./collaboration.service";
import { HiringCampaignRepository } from "./hiring-campaign.repository";
import { hiringId, mutationSchema, parseHiring } from "./hiring.validation";

@Controller("/collaborations/hiring")
export class HiringCampaignController {
  constructor(@Optional() private readonly campaigns = new HiringCampaignRepository()) {}
  @Get("/posts/:postId/slots/:slotId/campaign") @Header("Cache-Control", "private, no-store, max-age=0")
  state(@Param("postId") postId: string, @Param("slotId") slotId: string, @Headers("x-user-id") actor?: string) { return this.campaigns.state(requireCollaborationUser(actor), parseHiring(hiringId, postId), parseHiring(hiringId, slotId)); }
  @Post("/posts/:postId/slots/:slotId/campaign/dispatch") @Header("Cache-Control", "private, no-store, max-age=0")
  dispatch(@Param("postId") postId: string, @Param("slotId") slotId: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.campaigns.dispatch(collaborationWriteGate(actor, "campaign", 20), parseHiring(hiringId, postId), parseHiring(hiringId, slotId), parseHiring(mutationSchema, body).mutationId); }
  @Post("/posts/:postId/slots/:slotId/campaign/stop") @Header("Cache-Control", "private, no-store, max-age=0")
  stop(@Param("postId") postId: string, @Param("slotId") slotId: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { parseHiring(z.strictObject({}), body); return this.campaigns.stop(collaborationWriteGate(actor, "campaign"), parseHiring(hiringId, postId), parseHiring(hiringId, slotId)); }
  @Get("/invitations") @Header("Cache-Control", "private, no-store, max-age=0")
  inbox(@Headers("x-user-id") actor?: string) { return this.campaigns.inbox(requireCollaborationUser(actor)); }
  @Patch("/invitations/:id") @Header("Cache-Control", "private, no-store, max-age=0")
  respond(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { const input = parseHiring(z.strictObject({ action: z.enum(["read", "interested", "declined", "stop"]) }), body); return this.campaigns.respond(collaborationWriteGate(actor, "invitation", 100), parseHiring(hiringId, id), input.action); }
}
