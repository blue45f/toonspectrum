import { Body, Controller, Get, Header, Headers, Inject, Optional, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";

import { collaborationWriteGate } from "../collaboration/collaboration.controller";
import { requireCollaborationUser } from "../collaboration/collaboration.service";
import { hiringId, parseHiring, revision } from "../collaboration/hiring.validation";

import { CreatorMeetingRepository } from "./meeting.repository";
import { roomEpochSchema, roomHostSchema, roomInputSchema, roomMessageSchema } from "./meeting.validation";

@Controller("/collaborations/rooms")
export class CreatorMeetingController {
  constructor(@Optional() @Inject(CreatorMeetingRepository) private readonly rooms = new CreatorMeetingRepository()) {}
  @Get() @Header("Cache-Control", "private, no-store, max-age=0")
  list(@Headers("x-user-id") actor?: string) { return this.rooms.list(requireCollaborationUser(actor)); }
  @Post() @Header("Cache-Control", "private, no-store, max-age=0")
  create(@Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.rooms.create(collaborationWriteGate(actor, "room-create", 20), parseHiring(roomInputSchema, body)); }
  @Get("/:id") @Header("Cache-Control", "private, no-store, max-age=0")
  get(@Param("id") id: string, @Headers("x-user-id") actor?: string) { return this.rooms.get(requireCollaborationUser(actor), parseHiring(hiringId, id)); }
  @Post("/:id/enter") @Header("Cache-Control", "private, no-store, max-age=0")
  enter(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.rooms.enter(collaborationWriteGate(actor, "room-enter", 100), parseHiring(hiringId, id), parseHiring(roomEpochSchema, body).expectedEpoch); }
  @Post("/:id/leave") @Header("Cache-Control", "private, no-store, max-age=0")
  leave(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.rooms.enter(collaborationWriteGate(actor, "room-enter", 100), parseHiring(hiringId, id), parseHiring(roomEpochSchema, body).expectedEpoch, true); }
  @Post("/:id/host") @Header("Cache-Control", "private, no-store, max-age=0")
  host(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.rooms.host(collaborationWriteGate(actor, "room-host", 100), parseHiring(hiringId, id), parseHiring(roomHostSchema, body)); }
  @Get("/:id/messages") @Header("Cache-Control", "private, no-store, max-age=0")
  messages(@Param("id") id: string, @Query("epoch") epoch: string, @Headers("x-user-id") actor?: string) { const v = parseHiring(z.string().regex(/^[1-9]\d{0,9}$/u).transform(Number).pipe(revision), epoch); return this.rooms.messages(requireCollaborationUser(actor), parseHiring(hiringId, id), v); }
  @Post("/:id/messages") @Header("Cache-Control", "private, no-store, max-age=0")
  message(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.rooms.message(collaborationWriteGate(actor, "room-message", 100), parseHiring(hiringId, id), parseHiring(roomMessageSchema, body)); }
  @Post("/:id/media") @Header("Cache-Control", "private, no-store, max-age=0")
  media(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.rooms.media(requireCollaborationUser(actor), parseHiring(hiringId, id), parseHiring(roomEpochSchema, body).expectedEpoch); }
}
