import { Body, Controller, Get, Header, Headers, Optional, Param, Patch, Post } from "@nestjs/common";

import { collaborationWriteGate } from "./collaboration.controller";
import { requireCollaborationUser } from "./collaboration.service";
import { HiringSlotRepository } from "./hiring-slot.repository";
import { hiringId, parseHiring, slotInputSchema, slotStateSchema } from "./hiring.validation";

@Controller("/collaborations/hiring/posts/:postId/slots")
export class HiringSlotController {
  constructor(@Optional() private readonly slots = new HiringSlotRepository()) {}
  @Get() @Header("Cache-Control", "private, no-store, max-age=0")
  list(@Param("postId") postId: string, @Headers("x-user-id") actor?: string) { return this.slots.list(requireCollaborationUser(actor), parseHiring(hiringId, postId)); }
  @Post() @Header("Cache-Control", "private, no-store, max-age=0")
  create(@Param("postId") postId: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.slots.save(collaborationWriteGate(actor, "slot"), parseHiring(hiringId, postId), null, parseHiring(slotInputSchema, body)); }
  @Patch("/:slotId") @Header("Cache-Control", "private, no-store, max-age=0")
  update(@Param("postId") postId: string, @Param("slotId") slotId: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.slots.save(collaborationWriteGate(actor, "slot"), parseHiring(hiringId, postId), parseHiring(hiringId, slotId), parseHiring(slotInputSchema, body)); }
  @Patch("/:slotId/state") @Header("Cache-Control", "private, no-store, max-age=0")
  state(@Param("postId") postId: string, @Param("slotId") slotId: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.slots.state(collaborationWriteGate(actor, "slot"), parseHiring(hiringId, postId), parseHiring(hiringId, slotId), parseHiring(slotStateSchema, body)); }
}
