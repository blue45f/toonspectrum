import { Body, Controller, Delete, Get, Header, Headers, Optional, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";

import { collaborationWriteGate } from "./collaboration.controller";
import { requireCollaborationUser } from "./collaboration.service";
import { HiringResumeRepository } from "./hiring-resume.repository";
import { hiringId, parseHiring, resumeInputSchema, revision, submissionSchema } from "./hiring.validation";

@Controller("/collaborations/hiring")
export class HiringController {
  constructor(@Optional() private readonly resumes = new HiringResumeRepository()) {}
  @Get("/resumes") @Header("Cache-Control", "private, no-store, max-age=0")
  list(@Headers("x-user-id") actor?: string) { return this.resumes.list(requireCollaborationUser(actor)); }
  @Get("/resumes/:id/versions") @Header("Cache-Control", "private, no-store, max-age=0")
  versions(@Param("id") id: string, @Headers("x-user-id") actor?: string) { return this.resumes.versions(requireCollaborationUser(actor), parseHiring(hiringId, id)); }
  @Post("/resumes") @Header("Cache-Control", "private, no-store, max-age=0")
  create(@Body() input: unknown, @Headers("x-user-id") actor?: string) { return this.resumes.save(collaborationWriteGate(actor, "resume", 30), null, parseHiring(resumeInputSchema, input)); }
  @Patch("/resumes/:id") @Header("Cache-Control", "private, no-store, max-age=0")
  update(@Param("id") id: string, @Body() input: unknown, @Headers("x-user-id") actor?: string) { return this.resumes.save(collaborationWriteGate(actor, "resume", 30), parseHiring(hiringId, id), parseHiring(resumeInputSchema, input)); }
  @Delete("/resumes/:id") @Header("Cache-Control", "private, no-store, max-age=0")
  remove(@Param("id") id: string, @Query("revision") rawRevision: string, @Headers("x-user-id") actor?: string) {
    const expected = parseHiring(z.string().regex(/^[1-9]\d{0,9}$/u).transform(Number).pipe(revision), rawRevision);
    return this.resumes.remove(collaborationWriteGate(actor, "resume-delete"), parseHiring(hiringId, id), expected);
  }
  @Post("/posts/:postId/submit") @Header("Cache-Control", "private, no-store, max-age=0")
  submit(@Param("postId") id: string, @Body() input: unknown, @Headers("x-user-id") actor?: string) { return this.resumes.submit(collaborationWriteGate(actor, "resume-submit", 15), parseHiring(hiringId, id), parseHiring(submissionSchema, input)); }
  @Get("/posts/:postId/applications/:applicationId/snapshots") @Header("Cache-Control", "private, no-store, max-age=0")
  snapshots(@Param("postId") postId: string, @Param("applicationId") applicationId: string, @Headers("x-user-id") actor?: string) {
    return this.resumes.snapshots(requireCollaborationUser(actor), parseHiring(hiringId, postId), parseHiring(hiringId, applicationId));
  }
}
