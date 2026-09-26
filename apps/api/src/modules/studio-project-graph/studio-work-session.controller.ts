import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, HttpCode, Inject, Injectable, NotFoundException, Param, Post, Query, ServiceUnavailableException } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { studioWorkSessionId as id, studioWorkSessionCreateSchema, studioWorkSessionCommandSchema, StudioWorkSessionCommandError, type StudioWorkSessionCommand } from "@toonspectrum/studio-project-model/work-session";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { StudioWorkSessionRepository, StudioWorkSessionRepositoryError } from "./studio-work-session.repository";

class WorkParams extends createZodDto(z.object({ workId: id }).strict()) {}
class SessionParams extends createZodDto(z.object({ workId: id, sessionId: id }).strict()) {}
class ReceiptParams extends createZodDto(z.object({ workId: id, sessionId: id, operationId: id }).strict()) {}
class ResourceQuery extends createZodDto(z.object({ offset: z.coerce.number().int().min(0).max(99999).optional() }).strict()) {}
class ListQuery extends createZodDto(z.object({ cursor: id.optional() }).strict()) {}
class CreateDto extends createZodDto(studioWorkSessionCreateSchema) {}
const CommandDto = createZodDto(studioWorkSessionCommandSchema);
@Injectable()
export class StudioWorkSessionService {
  constructor(@Inject(StudioWorkSessionRepository) readonly repository: StudioWorkSessionRepository) {}
  async run<T>(actor: string | undefined, operation: (actorId: string, repository: StudioWorkSessionRepository) => Promise<T>) {
    if (!actor?.trim()) throw new ForbiddenException("로그인이 필요합니다.");
    try { return await operation(actor.trim(), this.repository); } catch (error) {
      if (!(error instanceof StudioWorkSessionRepositoryError) && !(error instanceof StudioWorkSessionCommandError)) throw error;
      const body = { code: `studio_work_session_${error.code}`, message: "현재 작업 세션의 권한, 입력본과 버전을 다시 확인하세요." };
      if (error.code === "forbidden") throw new ForbiddenException(body);
      if (error.code === "not-found") throw new NotFoundException(body);
      if (error.code === "unavailable") throw new ServiceUnavailableException(body);
      if (["conflict", "idempotency", "closed", "capacity"].includes(error.code)) throw new ConflictException(body);
      throw new BadRequestException(body);
    }
  }
}
@Controller("/creator/works/:workId/work-sessions")
export class StudioWorkSessionController {
  constructor(@Inject(StudioWorkSessionService) private readonly service: StudioWorkSessionService) {}
  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  list(@Param(new ZodValidationPipe(WorkParams)) p: WorkParams, @Query(new ZodValidationPipe(ListQuery)) query: ListQuery, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (user, repository) => repository.list(user, p.workId, query.cursor ?? null));
  }
  @Post()
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(200)
  create(@Param(new ZodValidationPipe(WorkParams)) p: WorkParams, @Body(new ZodValidationPipe(CreateDto)) input: CreateDto, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (user, repository) => repository.create(user, p.workId, input));
  }
  @Get(":sessionId")
  @Header("Cache-Control", "private, no-store, max-age=0")
  current(@Param(new ZodValidationPipe(SessionParams)) p: SessionParams, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (user, repository) => repository.current(user, p.workId, p.sessionId));
  }
  @Post(":sessionId/commands")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(200)
  command(@Param(new ZodValidationPipe(SessionParams)) p: SessionParams, @Body(new ZodValidationPipe(CommandDto)) input: StudioWorkSessionCommand, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (user, repository) => repository.command(user, p.workId, p.sessionId, input));
  }
  @Get(":sessionId/resources")
  @Header("Cache-Control", "private, no-store, max-age=0")
  resources(@Param(new ZodValidationPipe(SessionParams)) p: SessionParams,
    @Query(new ZodValidationPipe(ResourceQuery)) query: ResourceQuery, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (user, repository) => repository.resources(user, p.workId, p.sessionId, query.offset ?? 0));
  }
  @Get(":sessionId/operations/:operationId")
  @Header("Cache-Control", "private, no-store, max-age=0")
  receipt(@Param(new ZodValidationPipe(ReceiptParams)) p: ReceiptParams, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (user, repository) => repository.receipt(user, p.workId, p.sessionId, p.operationId));
  }
}
