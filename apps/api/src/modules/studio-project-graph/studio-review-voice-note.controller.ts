import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  STUDIO_REVIEW_VOICE_NOTE_MAX_BYTES,
  studioReviewVoiceNoteCreateSchema,
  studioReviewVoiceNoteDeleteSchema,
  studioReviewVoiceNoteSubjectSchema,
} from "@toonspectrum/studio-project-model/review-voice-note";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import type { StudioWorkAssetUploadFile } from "../creator/studio-work-asset.service";
import { authenticatedStudioUserId } from "./studio-project-graph.controller";
import { StudioReviewVoiceNoteService } from "./studio-review-voice-note.service";

const id = z.string().trim().min(1).max(160);
class WorkParams extends createZodDto(z.object({ workId: id }).strict()) {}
class NoteParams extends createZodDto(z.object({ workId: id, noteId: id }).strict()) {}
class VoiceNoteQueryDto extends createZodDto(z.object({ subject: studioReviewVoiceNoteSubjectSchema }).strict()) {}
class VoiceNoteDeleteDto extends createZodDto(studioReviewVoiceNoteDeleteSchema) {}
class VoiceNoteUploadBodyDto extends createZodDto(z.object({
  metadata: z.string().max(16_384).transform((text, context) => {
    try { return studioReviewVoiceNoteCreateSchema.parse(JSON.parse(text)); }
    catch { context.addIssue({ code: "custom", message: "Invalid review voice-note metadata" }); return z.NEVER; }
  }),
}).strict()) {}

export const STUDIO_REVIEW_VOICE_NOTE_UPLOAD_LIMITS = {
  fileSize: STUDIO_REVIEW_VOICE_NOTE_MAX_BYTES,
  files: 1,
  fields: 1,
  fieldSize: 16_384,
  fieldNameSize: 64,
  parts: 3,
} as const;

@Controller("/studio-project-graph/works/:workId/review-voice-notes")
export class StudioReviewVoiceNoteController {
  constructor(@Inject(StudioReviewVoiceNoteService) private readonly service: StudioReviewVoiceNoteService) {}

  @Post()
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  @UseInterceptors(FileInterceptor("file", { limits: STUDIO_REVIEW_VOICE_NOTE_UPLOAD_LIMITS }))
  create(
    @Param(new ZodValidationPipe(WorkParams)) params: WorkParams,
    @Body(new ZodValidationPipe(VoiceNoteUploadBodyDto)) body: VoiceNoteUploadBodyDto,
    @UploadedFile() file: StudioWorkAssetUploadFile | undefined,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.create(authenticatedStudioUserId(userId), params.workId, body.metadata, file);
  }

  @Post("/query")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  list(
    @Param(new ZodValidationPipe(WorkParams)) params: WorkParams,
    @Body(new ZodValidationPipe(VoiceNoteQueryDto)) body: VoiceNoteQueryDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.list(authenticatedStudioUserId(userId), params.workId, body.subject);
  }

  @Post(":noteId/read")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  signedRead(
    @Param(new ZodValidationPipe(NoteParams)) params: NoteParams,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.signedRead(authenticatedStudioUserId(userId), params.workId, params.noteId);
  }

  @Post(":noteId/delete")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  delete(
    @Param(new ZodValidationPipe(NoteParams)) params: NoteParams,
    @Body(new ZodValidationPipe(VoiceNoteDeleteDto)) body: VoiceNoteDeleteDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.delete(authenticatedStudioUserId(userId), params.workId, params.noteId, body);
  }
}
