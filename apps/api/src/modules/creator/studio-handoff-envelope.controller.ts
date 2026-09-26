import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, HttpCode, Inject, Injectable, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { studioHandoffEnvelopeCreateSchema, studioHandoffEnvelopeActionSchema, studioHandoffEnvelopeAcceptSchema, studioReviewCompletionTaskIdSchema, studioReviewTaskReferenceSchema } from "@toonspectrum/studio-project-model";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { StudioHandoffEnvelopeRepository, StudioHandoffEnvelopeError } from "./studio-handoff-envelope.repository";
import { StudioReviewTaskCompletionError } from "./studio-review-task-completion.repository";

const id = studioReviewTaskReferenceSchema.shape.commentId;
class WorkParams extends createZodDto(z.object({ id }).strict()) {}
class TaskParams extends createZodDto(z.object({ id, taskId: studioReviewCompletionTaskIdSchema }).strict()) {}
class EnvelopeParams extends createZodDto(z.object({ id, envelopeId: id }).strict()) {}
class ListQuery extends createZodDto(z.object({ cursor: id.optional() }).strict()) {}
class CreateDto extends createZodDto(studioHandoffEnvelopeCreateSchema) {}
class ActionDto extends createZodDto(studioHandoffEnvelopeActionSchema) {}
class AcceptDto extends createZodDto(studioHandoffEnvelopeAcceptSchema) {}
@Injectable()
export class StudioHandoffEnvelopeService {
  constructor(@Inject(StudioHandoffEnvelopeRepository) readonly repository: StudioHandoffEnvelopeRepository) {}
  async run<T>(actor: string | undefined, operation: (actorId: string, repository: StudioHandoffEnvelopeRepository) => Promise<T>): Promise<T> {
    if (!actor) throw new ForbiddenException("로그인이 필요해요.");
    try { return await operation(actor, this.repository); } catch (error) {
      if (!(error instanceof StudioHandoffEnvelopeError) && !(error instanceof StudioReviewTaskCompletionError)) throw error;
      const body = { code: `studio_handoff_envelope_${error.code}`, message: "현재 권한과 인수인계 근거를 다시 확인해 주세요." };
      if (error.code === "forbidden") throw new ForbiddenException(body);
      if (error.code === "unavailable" || error.code === "not-found") throw new NotFoundException(body);
      if (error.code === "conflict" || error.code === "idempotency" || error.code === "changed") throw new ConflictException(body);
      throw new BadRequestException(body);
    }
  }
}
@Controller()
export class StudioHandoffEnvelopeController {
  constructor(@Inject(StudioHandoffEnvelopeService) private readonly service: StudioHandoffEnvelopeService) {}
  @Get("/creator/works/:id/production-tasks/:taskId/handoff-envelope")
  @Header("Cache-Control", "private, no-store, max-age=0")
  prepare(@Param(new ZodValidationPipe(TaskParams)) p: TaskParams, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (user, repository) => repository.prepare(user, p.id, p.taskId));
  }
  @Get("/creator/works/:id/handoff-envelopes")
  @Header("Cache-Control", "private, no-store, max-age=0")
  list(@Param(new ZodValidationPipe(WorkParams)) p: WorkParams, @Query(new ZodValidationPipe(ListQuery)) query: ListQuery, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (user, repository) => repository.list(user, p.id, query.cursor ?? null));
  }
  @Post("/creator/works/:id/handoff-envelopes")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(200)
  create(@Param(new ZodValidationPipe(WorkParams)) p: WorkParams, @Body(new ZodValidationPipe(CreateDto)) input: CreateDto, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (user, repository) => repository.create(user, p.id, input));
  }
  @Get("/creator/works/:id/handoff-envelopes/:envelopeId")
  @Header("Cache-Control", "private, no-store, max-age=0")
  read(@Param(new ZodValidationPipe(EnvelopeParams)) p: EnvelopeParams, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (user, repository) => repository.read(user, p.id, p.envelopeId));
  }
  @Post("/creator/works/:id/handoff-envelopes/:envelopeId/open")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(200)
  open(@Param(new ZodValidationPipe(EnvelopeParams)) p: EnvelopeParams, @Body(new ZodValidationPipe(ActionDto)) input: ActionDto, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (user, repository) => repository.act(user, p.id, p.envelopeId, "open", input));
  }
  @Post("/creator/works/:id/handoff-envelopes/:envelopeId/accept")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(200)
  accept(@Param(new ZodValidationPipe(EnvelopeParams)) p: EnvelopeParams, @Body(new ZodValidationPipe(AcceptDto)) input: AcceptDto, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (user, repository) => repository.act(user, p.id, p.envelopeId, "accept", input));
  }
  @Post("/creator/works/:id/handoff-envelopes/:envelopeId/cancel")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(200)
  cancel(@Param(new ZodValidationPipe(EnvelopeParams)) p: EnvelopeParams, @Body(new ZodValidationPipe(ActionDto)) input: ActionDto, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (user, repository) => repository.act(user, p.id, p.envelopeId, "cancel", input));
  }
}
