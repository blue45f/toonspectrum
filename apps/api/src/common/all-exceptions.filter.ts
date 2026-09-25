import { randomUUID } from "node:crypto";

import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";

import { safeHttpRequestPathname } from "./http-request-path";

import type { ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";

const SAFE_5XX_FIELDS = [
  "status",
  "code",
  "capability",
  "retryable",
  "retryAfterSeconds",
  "requestId",
  "incidentId",
] as const;

function safeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[a-zA-Z0-9._:-]{1,128}$/u.test(trimmed) ? trimmed : null;
}

function requestIdentifier(request: Request, candidate: unknown): string {
  const fromBody = safeIdentifier(candidate);
  if (fromBody) return fromBody;
  const header = request.headers["x-request-id"];
  const fromHeader = safeIdentifier(Array.isArray(header) ? header[0] : header);
  return fromHeader ?? randomUUID();
}

function boundedRetryAfter(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(3_600, Math.max(1, Math.trunc(value)));
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const pathname = safeHttpRequestPathname(request);
    const raw = this.toBaseBody(exception, status);
    const base = status >= HttpStatus.INTERNAL_SERVER_ERROR
      ? this.toSafe5xxBody(raw, status)
      : raw;
    const requestId = status >= HttpStatus.INTERNAL_SERVER_ERROR
      ? requestIdentifier(request, base.requestId)
      : null;
    const body = {
      ...base,
      ...(requestId ? { requestId } : {}),
      path: pathname,
      timestamp: new Date().toISOString(),
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Request-Id", requestId!);
      const incidentId = safeIdentifier(base.incidentId);
      if (incidentId) response.setHeader("X-Incident-Id", incidentId);
      const retryAfter = boundedRetryAfter(base.retryAfterSeconds);
      if (retryAfter !== null) response.setHeader("Retry-After", String(retryAfter));
      this.logger.error(JSON.stringify({
        event: "http_request_failed",
        method: request.method,
        path: pathname,
        statusCode: status,
        requestId,
        incidentId,
        code: safeIdentifier(base.code),
        capability: safeIdentifier(base.capability),
      }));
    }

    response.status(status).json(body);
  }

  private toSafe5xxBody(
    source: Record<string, unknown>,
    status: number,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      statusCode: status,
      message: "Request could not be completed",
    };
    for (const key of SAFE_5XX_FIELDS) {
      const value = source[key];
      if (key === "retryable" && typeof value === "boolean") body[key] = value;
      else if (key === "retryAfterSeconds") {
        const bounded = boundedRetryAfter(value);
        if (bounded !== null) body[key] = bounded;
      } else {
        const safe = safeIdentifier(value);
        if (safe) body[key] = safe;
      }
    }
    return body;
  }

  private toBaseBody(
    exception: unknown,
    status: number,
  ): Record<string, unknown> {
    if (exception instanceof HttpException) {
      const value = exception.getResponse();
      if (typeof value === "object" && value !== null) {
        const object = value as Record<string, unknown>;
        return "statusCode" in object
          ? { ...object }
          : { statusCode: status, ...object };
      }
      return { statusCode: status, message: value };
    }
    return { statusCode: status, message: "Internal server error" };
  }
}
