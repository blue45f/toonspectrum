import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, HttpCode, Inject, Injectable, NotFoundException, Param, Post } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { studioReviewCompletionTaskIdSchema, studioReviewTaskCompletionInputSchema, studioReviewTaskReferenceSchema } from "@toonspectrum/studio-project-model";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { StudioReviewTaskCompletionError, StudioReviewTaskCompletionRepository } from "./studio-review-task-completion.repository";

class ParamsDto extends createZodDto(z.object({ id: studioReviewTaskReferenceSchema.shape.commentId, taskId: studioReviewCompletionTaskIdSchema }).strict()) {}
class CompleteDto extends createZodDto(studioReviewTaskCompletionInputSchema) {}

@Injectable()
export class StudioReviewTaskCompletionService {
  constructor(@Inject(StudioReviewTaskCompletionRepository) private readonly repository: StudioReviewTaskCompletionRepository) {}
  async run(actor: string | undefined, workId: string, taskId: string, input?: CompleteDto) {
    if (!actor) throw new ForbiddenException("로그인이 필요해요.");
    try { return await (input ? this.repository.complete(actor, workId, taskId, input) : this.repository.read(actor, workId, taskId)); }
    catch (error) {
      if (!(error instanceof StudioReviewTaskCompletionError)) throw error;
      const body = { code: `studio_review_task_completion_${error.code}`, message: "작업과 검수 근거를 다시 확인해 주세요." };
      if (error.code === "forbidden") throw new ForbiddenException(body);
      if (error.code === "not-found") throw new NotFoundException(body);
      if (error.code === "conflict" || error.code === "idempotency") throw new ConflictException(body);
      throw new BadRequestException(body);
    }
  }
}

@Controller()
export class StudioReviewTaskCompletionController {
  constructor(@Inject(StudioReviewTaskCompletionService) private readonly service: StudioReviewTaskCompletionService) {}
  @Get("/creator/works/:id/production-tasks/:taskId/review-completion")
  @Header("Cache-Control", "private, no-store, max-age=0")
  read(@Param(new ZodValidationPipe(ParamsDto)) params: ParamsDto, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, params.id, params.taskId);
  }
  @Post("/creator/works/:id/production-tasks/:taskId/review-completion")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(200)
  complete(@Param(new ZodValidationPipe(ParamsDto)) params: ParamsDto,
    @Body(new ZodValidationPipe(CompleteDto)) input: CompleteDto, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, params.id, params.taskId, input);
  }
}
