import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, HttpCode, Inject, Injectable, NotFoundException, Param, Post, ServiceUnavailableException } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { reviewPolicyCommandSchema, studioEntityIdSchema, type ReviewPolicyCommand } from "@toonspectrum/studio-project-model";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { StudioProjectForbiddenError, StudioProjectNotFoundError } from "./studio-project-graph.repository";
import { StudioReviewPolicyRepository } from "./studio-review-policy.repository";
import { StudioReviewPolicyError } from "./studio-review-policy-store";

class Params extends createZodDto(z.object({ reviewId: studioEntityIdSchema }).strict()) {}
export function rethrowReviewPolicyError(error: unknown): never {
  if (error instanceof StudioProjectForbiddenError) throw new ForbiddenException({ code: error.message });
  if (error instanceof StudioProjectNotFoundError) throw new NotFoundException({ code: error.message });
  if (!(error instanceof StudioReviewPolicyError)) throw error;
  const body = { code: error.message, message: "현재 검수본, 정책 버전, 필수 검토와 접근 권한을 다시 확인해 주세요." };
  if (error.code === "unavailable") throw new ServiceUnavailableException(body);
  if (error.code === "forbidden") throw new ForbiddenException(body);
  if (error.code === "not-found") throw new NotFoundException(body);
  if (["conflict", "closed", "unsatisfied", "capacity"].includes(error.code)) throw new ConflictException(body);
  throw new BadRequestException(body);
}
@Injectable()
export class StudioReviewPolicyService {
  constructor(@Inject(StudioReviewPolicyRepository) readonly repository: StudioReviewPolicyRepository) {}
  async run<T>(actor: string | undefined, operation: (actorId: string) => Promise<T>): Promise<T> {
    if (!actor?.trim()) throw new ForbiddenException("로그인이 필요합니다.");
    try { return await operation(actor.trim()); } catch (error) { rethrowReviewPolicyError(error); }
  }
}
@Controller("/studio-project-graph/reviews/:reviewId/policy")
export class StudioReviewPolicyController {
  constructor(@Inject(StudioReviewPolicyService) readonly service: StudioReviewPolicyService) {}
  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  current(@Param(new ZodValidationPipe(Params)) params: Params, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (actorId) => this.service.repository.current(actorId, params.reviewId));
  }
  @Post("commands")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  command(@Param(new ZodValidationPipe(Params)) params: Params, @Body(new ZodValidationPipe(createZodDto(reviewPolicyCommandSchema))) input: ReviewPolicyCommand, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, (actorId) => this.service.repository.command(actorId, params.reviewId, input));
  }
}
