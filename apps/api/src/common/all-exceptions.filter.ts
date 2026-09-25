import { randomUUID } from "node:crypto";

import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from "@nestjs/common";

import { isDatabaseAvailabilityError } from "./database-availability";
import { safeHttpRequestPathname } from "./http-request-path";
import {
  capabilityUnavailableException,
  DATABASE_UNAVAILABLE_CODE,
} from "./service-availability";

import type { ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";

const SAFE_MACHINE_TOKEN = /^[A-Za-z][A-Za-z0-9._-]{1,95}$/u;
const SAFE_CAPABILITY = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const SAFE_STATUS = new Set(["degraded", "unavailable", "not_ready"]);

type RequestWithId = Request & { readonly id?: string | number };

function safeToken(value: unknown, pattern = SAFE_MACHINE_TOKEN): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return pattern.test(normalized) ? normalized : undefined;
}

function safeRetryAfterSeconds(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = Math.trunc(value);
  return normalized >= 1 && normalized <= 3_600 ? normalized : undefined;
}

function safe5xxMetadata(exception: unknown): Record<string, unknown> {
  if (!(exception instanceof HttpException)) return {};
  const raw = exception.getResponse();
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const code = safeToken(source.code);
  const capability = safeToken(source.capability, SAFE_CAPABILITY);
  const incidentId = safeToken(source.incidentId);
  const legacyError = safeToken(source.error, /^[a-z][a-z0-9_-]{1,80}$/u);
  const status = safeToken(source.status);
  const retryAfterSeconds = safeRetryAfterSeconds(source.retryAfterSeconds);
  return {
    ...(code ? { code } : {}),
    ...(capability ? { capability } : {}),
    ...(incidentId ? { incidentId } : {}),
    ...(legacyError ? { error: legacyError } : {}),
    ...(status && SAFE_STATUS.has(status) ? { status } : {}),
    ...(typeof source.retryable === "boolean" ? { retryable: source.retryable } : {}),
    ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
  };
}

function requestId(request: RequestWithId): string {
  const loggerId = request.id;
  if (typeof loggerId === "string" && SAFE_MACHINE_TOKEN.test(loggerId)) return loggerId;
  if (typeof loggerId === "number" && Number.isSafeInteger(loggerId)) return `req_${loggerId}`;
  const inbound = request.headers?.["x-request-id"];
  const candidate = Array.isArray(inbound) ? inbound[0] : inbound;
  const safeInbound = safeToken(candidate);
  return safeInbound ?? `req_${randomUUID()}`;
}

/**
 * 전역 HTTP 예외 경계.
 *
 * - 4xx는 기존 controller envelope를 보존한다.
 * - 5xx는 비밀이 될 수 있는 message/details를 제거하되, 클라이언트가 안전하게 분기할 수 있는
 *   code/capability/retryable/retryAfterSeconds/incidentId만 허용 목록으로 보존한다.
 * - 모든 오류 응답에 path/timestamp/requestId를 추가하고 5xx는 공유 캐시에 저장하지 않는다.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const normalizedException = exception instanceof HttpException
      || !isDatabaseAvailabilityError(exception)
      ? exception
      : capabilityUnavailableException("database", {
          code: DATABASE_UNAVAILABLE_CODE,
        });
    const status = normalizedException instanceof HttpException
      ? normalizedException.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const pathname = safeHttpRequestPathname(request);
    const correlationId = requestId(request);
    const metadata = status >= HttpStatus.INTERNAL_SERVER_ERROR
      ? safe5xxMetadata(normalizedException)
      : {};
    const base = status >= HttpStatus.INTERNAL_SERVER_ERROR
      ? { statusCode: status, message: "Request could not be completed", ...metadata }
      : this.toBaseBody(normalizedException, status);
    const body = {
      ...base,
      path: pathname,
      timestamp: new Date().toISOString(),
      requestId: correlationId,
    };

    response.setHeader("X-Request-Id", correlationId);
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      response.setHeader("Cache-Control", "no-store");
      const retryAfterSeconds = safeRetryAfterSeconds(metadata.retryAfterSeconds);
      if (retryAfterSeconds) response.setHeader("Retry-After", String(retryAfterSeconds));
      const incidentId = safeToken(metadata.incidentId);
      if (incidentId) response.setHeader("X-Incident-Id", incidentId);
      this.logger.error(JSON.stringify({
        event: "http_request_failed",
        method: request.method,
        path: pathname,
        status,
        requestId: correlationId,
        ...(metadata.code ? { code: metadata.code } : {}),
        ...(metadata.capability ? { capability: metadata.capability } : {}),
        ...(incidentId ? { incidentId } : {}),
      }));
    }

    response.status(status).json(body);
  }

  private toBaseBody(exception: unknown, status: number): Record<string, unknown> {
    if (exception instanceof HttpException) {
      const value = exception.getResponse();
      if (typeof value === "object" && value !== null) {
        const object = value as Record<string, unknown>;
        return "statusCode" in object ? { ...object } : { statusCode: status, ...object };
      }
      return { statusCode: status, message: value };
    }
    return { statusCode: status, message: "Internal server error" };
  }
}
