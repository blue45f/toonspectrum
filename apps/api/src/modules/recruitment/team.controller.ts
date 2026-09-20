import { Body, Controller, Delete, Get, Header, Headers, Optional, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";

import { collaborationWriteGate } from "../collaboration/collaboration.controller";
import { requireCollaborationUser } from "../collaboration/collaboration.service";
import { hiringId, parseHiring, revision, unique } from "../collaboration/hiring.validation";

import { CreatorTeamRepository } from "./team.repository";

const nameSchema = z.string().trim().min(1).max(100);
const accountId = z.string().min(1).max(128);
const groupSchema = z.strictObject({ name: nameSchema.max(80), memberIds: unique(accountId, 200) });
@Controller("/collaborations/teams")
export class CreatorTeamController {
  constructor(@Optional() private readonly teams = new CreatorTeamRepository()) {}
  @Get() @Header("Cache-Control", "private, no-store, max-age=0")
  list(@Headers("x-user-id") actor?: string) { return this.teams.list(requireCollaborationUser(actor)); }
  @Post() @Header("Cache-Control", "private, no-store, max-age=0")
  create(@Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.teams.create(collaborationWriteGate(actor, "team-create", 10), parseHiring(z.strictObject({ name: nameSchema }), body).name); }
  @Get("/invitations") @Header("Cache-Control", "private, no-store, max-age=0")
  invitations(@Headers("x-user-id") actor?: string) { return this.teams.invitations(requireCollaborationUser(actor)); }
  @Patch("/:id") @Header("Cache-Control", "private, no-store, max-age=0")
  rename(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { const v = parseHiring(z.strictObject({ name: nameSchema, expectedRevision: revision }), body); return this.teams.rename(collaborationWriteGate(actor, "team"), parseHiring(hiringId, id), v.name, v.expectedRevision); }
  @Get("/:id/members") @Header("Cache-Control", "private, no-store, max-age=0")
  members(@Param("id") id: string, @Headers("x-user-id") actor?: string) { return this.teams.members(requireCollaborationUser(actor), parseHiring(hiringId, id)); }
  @Post("/:id/invitations") @Header("Cache-Control", "private, no-store, max-age=0")
  invite(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.teams.invite(collaborationWriteGate(actor, "team-invite", 30), parseHiring(hiringId, id), parseHiring(z.strictObject({ targetAccountId: accountId }), body).targetAccountId); }
  @Post("/:id/respond") @Header("Cache-Control", "private, no-store, max-age=0")
  respond(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { const v = parseHiring(z.strictObject({ accept: z.boolean(), inviteRevision: revision }), body); return this.teams.respond(collaborationWriteGate(actor, "team-respond"), parseHiring(hiringId, id), v.accept, v.inviteRevision); }
  @Delete("/:id/members/:userId") @Header("Cache-Control", "private, no-store, max-age=0")
  remove(@Param("id") id: string, @Param("userId") target: string, @Headers("x-user-id") actor?: string) { return this.teams.removeMember(collaborationWriteGate(actor, "team-remove"), parseHiring(hiringId, id), parseHiring(accountId, target)); }
  @Get("/:id/groups") @Header("Cache-Control", "private, no-store, max-age=0")
  groups(@Param("id") id: string, @Headers("x-user-id") actor?: string) { return this.teams.groups(requireCollaborationUser(actor), parseHiring(hiringId, id)); }
  @Post("/:id/groups") @Header("Cache-Control", "private, no-store, max-age=0")
  createGroup(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { const v = parseHiring(groupSchema, body); return this.teams.saveGroup(collaborationWriteGate(actor, "team-group"), parseHiring(hiringId, id), null, v.name, v.memberIds); }
  @Patch("/:id/groups/:groupId") @Header("Cache-Control", "private, no-store, max-age=0")
  updateGroup(@Param("id") id: string, @Param("groupId") groupId: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { const v = parseHiring(groupSchema, body); return this.teams.saveGroup(collaborationWriteGate(actor, "team-group"), parseHiring(hiringId, id), parseHiring(hiringId, groupId), v.name, v.memberIds); }
  @Delete("/:id/groups/:groupId") @Header("Cache-Control", "private, no-store, max-age=0")
  deleteGroup(@Param("id") id: string, @Param("groupId") groupId: string, @Headers("x-user-id") actor?: string) { return this.teams.deleteGroup(collaborationWriteGate(actor, "team-group"), parseHiring(hiringId, id), parseHiring(hiringId, groupId)); }
}
