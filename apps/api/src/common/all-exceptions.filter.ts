import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from "@nestjs/common";

import type { ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";

/**
 * 전역 예외 필터(역호환 보장).
 *
 * 응답 envelope 는 기존 NestJS 기본 형태를 그대로 보존하고 그 위에 path·timestamp 만 ADD 한다:
 * - HttpException 의 getResponse() 가 **객체**면 그 객체를 펼쳐서(spread) statusCode/message/error
 *   등 기존 필드를 한 글자도 바꾸지 않고 유지한다(이 레포의 컨트롤러는 { error: "..." } 를 던진다).
 * - getResponse() 가 **문자열**이면 { statusCode, message } 형태로 감싼다(NestJS 기본과 동일).
 * - HttpException 이 아니면(예기치 못한 5xx) statusCode=500 + 일반 message 로 envelope 를 만든다.
 *
 * 프론트(lib/http-safe.ts resolveApiError)가 읽는 error / message / statusCode 필드는 절대 제거·변형하지 않는다.
 * 5xx 는 Logger 로 error 로깅한다(nestjs-pino 의 app.useLogger 가 설정돼 있으면 자동으로 그 로거가 쓰인다).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // 기존 envelope 보존: HttpException 객체 응답은 그대로 펼치고, 문자열/비-HttpException 은 표준 형태로 감싼다.
    const base = this.toBaseBody(exception, status);

    // path·timestamp 만 추가(기존 statusCode/message/error 는 base 가 그대로 보존).
    const body = {
      ...base,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception)
      );
    }

    response.status(status).json(body);
  }

  /**
   * 기존 NestJS 기본 필드(statusCode·message·error)를 보존하는 envelope 본문을 만든다.
   * - HttpException + 객체 응답: 그 객체를 그대로 펼친다(컨트롤러가 넣은 error/message/statusCode 보존).
   * - HttpException + 문자열 응답: { statusCode, message } 로 감싼다(NestJS 기본 동작과 동일).
   * - 그 외(예기치 못한 에러): { statusCode: 500, message } 로 감싼다.
   */
  private toBaseBody(exception: unknown, status: number): Record<string, unknown> {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === "object" && res !== null) {
        // 객체 응답을 그대로 보존하되 statusCode 가 비어 있으면 보강한다(기존 값은 절대 덮어쓰지 않음).
        const obj = res as Record<string, unknown>;
        return "statusCode" in obj ? { ...obj } : { statusCode: status, ...obj };
      }
      return { statusCode: status, message: res };
    }
    return { statusCode: status, message: "Internal server error" };
  }
}
