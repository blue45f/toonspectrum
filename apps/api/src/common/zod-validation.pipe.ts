import { BadRequestException } from "@nestjs/common";
import { createZodValidationPipe } from "nestjs-zod";
import type { ZodError } from "zod";

/**
 * 전역 Zod 검증 파이프(표준).
 * createZodDto 로 정의한 DTO 만 검증하고, 그 외 메타타입(@Body() body: unknown 등)은 그대로 통과시킨다.
 * 응답은 { statusCode, message: string[], error } 형태를 유지한다.
 * nestjs-zod 의 ZodExceptionCreator 시그니처는 (error: unknown) => Error 이므로 ZodError 로 좁힌다.
 */
export const ZodValidationPipe = createZodValidationPipe({
  createValidationException: (error) =>
    new BadRequestException((error as ZodError).issues.map((issue) => issue.message)),
});
