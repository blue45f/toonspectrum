import { Body, Controller, Get, Header, Headers, Optional, Param, Patch, Post, Put } from "@nestjs/common";

import { collaborationWriteGate } from "./collaboration.controller";
import { requireCollaborationUser } from "./collaboration.service";
import { HiringAvailabilityRepository } from "./hiring-availability.repository";
import { HiringOfferRepository } from "./hiring-offer.repository";
import { availabilitySchema, hiringId, mutationSchema, offerActionSchema, offerInputSchema, parseHiring } from "./hiring.validation";

@Controller("/collaborations/hiring")
export class HiringMatchingController {
  constructor(@Optional() private readonly availability = new HiringAvailabilityRepository(), @Optional() private readonly offers = new HiringOfferRepository()) {}
  @Get("/availability/me") @Header("Cache-Control", "private, no-store, max-age=0")
  own(@Headers("x-user-id") actor?: string) { return this.availability.own(requireCollaborationUser(actor)); }
  @Put("/availability/me") @Header("Cache-Control", "private, no-store, max-age=0")
  confirm(@Body() input: unknown, @Headers("x-user-id") actor?: string) { return this.availability.save(collaborationWriteGate(actor, "availability", 30), parseHiring(availabilitySchema, input)); }
  @Get("/posts/:postId/slots/:slotId/candidates") @Header("Cache-Control", "private, no-store, max-age=0")
  discover(@Param("postId") postId: string, @Param("slotId") slotId: string, @Headers("x-user-id") actor?: string) { return this.availability.discover(requireCollaborationUser(actor), parseHiring(hiringId, postId), parseHiring(hiringId, slotId)); }
  @Post("/posts/:postId/slots/:slotId/offers") @Header("Cache-Control", "private, no-store, max-age=0")
  send(@Param("postId") postId: string, @Param("slotId") slotId: string, @Body() input: unknown, @Headers("x-user-id") actor?: string) { return this.offers.send(collaborationWriteGate(actor, "offer", 30), parseHiring(hiringId, postId), parseHiring(hiringId, slotId), parseHiring(offerInputSchema, input)); }
  @Get("/offers") @Header("Cache-Control", "private, no-store, max-age=0")
  list(@Headers("x-user-id") actor?: string) { return this.offers.list(requireCollaborationUser(actor)); }
  @Post("/offers/:id/accept") @Header("Cache-Control", "private, no-store, max-age=0")
  accept(@Param("id") id: string, @Body() input: unknown, @Headers("x-user-id") actor?: string) { return this.offers.accept(collaborationWriteGate(actor, "accept", 30), parseHiring(hiringId, id), parseHiring(mutationSchema, input).mutationId); }
  @Patch("/offers/:id") @Header("Cache-Control", "private, no-store, max-age=0")
  change(@Param("id") id: string, @Body() input: unknown, @Headers("x-user-id") actor?: string) { const value = parseHiring(offerActionSchema, input); return this.offers.change(collaborationWriteGate(actor, "offer-change"), parseHiring(hiringId, id), value.action, value.mutationId); }
}
