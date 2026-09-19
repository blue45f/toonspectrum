import { Body, Controller, Delete, Get, Header, Headers, Optional, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";

import { collaborationWriteGate } from "../collaboration/collaboration.controller";
import { requireCollaborationUser } from "../collaboration/collaboration.service";
import { hiringId, hiringRole, parseHiring, portfolioUrl, revision } from "../collaboration/hiring.validation";

import { CreatorCareerRepository } from "./career.repository";

const month = z.string().regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/u);
export const careerSchema = z.strictObject({ title: z.string().trim().min(1).max(100), role: hiringRole, startMonth: month, endMonth: month.nullable(), episodeFrom: z.number().int().min(0).max(100000).nullable(), episodeTo: z.number().int().min(0).max(100000).nullable(),
  scope: z.string().trim().min(1).max(800), contribution: z.string().trim().min(1).max(800), portfolioUrl, rights: z.enum(["pending", "owned", "authorized"]), visibility: z.enum(["private", "public"]), expectedRevision: revision,
}).refine((v) => (v.visibility !== "public" || v.rights !== "pending") && (!v.endMonth || v.endMonth >= v.startMonth)
  && ((v.episodeFrom === null && v.episodeTo === null) || (v.episodeFrom !== null && v.episodeTo !== null && v.episodeFrom <= v.episodeTo)));
@Controller("/collaborations/career")
export class CreatorCareerController {
  constructor(@Optional() private readonly career = new CreatorCareerRepository()) {}
  @Get("/me") @Header("Cache-Control", "private, no-store, max-age=0")
  own(@Headers("x-user-id") actor?: string) { return this.career.list(requireCollaborationUser(actor)); }
  @Get("/gallery") @Header("Cache-Control", "no-store, max-age=0")
  gallery() { return this.career.gallery(); }
  @Get("/activity/me") @Header("Cache-Control", "private, no-store, max-age=0")
  activity(@Headers("x-user-id") actor?: string) { return this.career.activity(requireCollaborationUser(actor)); }
  @Post() @Header("Cache-Control", "private, no-store, max-age=0")
  create(@Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.career.save(collaborationWriteGate(actor, "career", 30), null, parseHiring(careerSchema, body)); }
  @Patch("/:id") @Header("Cache-Control", "private, no-store, max-age=0")
  update(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.career.save(collaborationWriteGate(actor, "career", 30), parseHiring(hiringId, id), parseHiring(careerSchema, body)); }
  @Post("/:id/revoke") @Header("Cache-Control", "private, no-store, max-age=0")
  revoke(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { parseHiring(z.strictObject({}), body); return this.career.revoke(collaborationWriteGate(actor, "career-revoke"), parseHiring(hiringId, id)); }
  @Post("/:id/versions/:versionId/resume") @Header("Cache-Control", "private, no-store, max-age=0")
  importResume(@Param("id") id: string, @Param("versionId") versionId: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { const input = parseHiring(z.strictObject({ penName: z.string().trim().min(1).max(60), mutationId: hiringId }), body); return this.career.importResume(collaborationWriteGate(actor, "career-import", 20), parseHiring(hiringId, id), parseHiring(hiringId, versionId), input.penName, input.mutationId); }
  @Get("/:id/versions") @Header("Cache-Control", "private, no-store, max-age=0")
  versions(@Param("id") id: string, @Headers("x-user-id") actor?: string) { return this.career.versions(requireCollaborationUser(actor), parseHiring(hiringId, id)); }
  @Delete("/:id") @Header("Cache-Control", "private, no-store, max-age=0")
  remove(@Param("id") id: string, @Query("revision") raw: string, @Headers("x-user-id") actor?: string) { return this.career.remove(collaborationWriteGate(actor, "career"), parseHiring(hiringId, id), parseHiring(z.string().regex(/^[1-9]\d{0,9}$/u).transform(Number).pipe(revision), raw)); }
}
