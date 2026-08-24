import { BadGatewayException, BadRequestException, Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AllExceptionsFilter } from "./all-exceptions.filter";
import {
  normalizeSafeHttpPathname,
  safeHttpRequestPathname,
} from "./http-request-path";

import type { ArgumentsHost } from "@nestjs/common";
import type { Request, Response } from "express";

function boundary(requestUrl: string) {
  const json = vi.fn();
  const setHeader = vi.fn();
  const status = vi.fn(() => ({ json }));
  const response = { setHeader, status } as unknown as Response;
  const request = {
    method: "GET",
    originalUrl: requestUrl,
    url: requestUrl,
  } as Request;
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, json, setHeader, status };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("safe HTTP request pathname", () => {
  it("removes query credentials and fragments from relative and absolute URLs", () => {
    expect(
      normalizeSafeHttpPathname(
        "/api/auth/oauth/google/callback?code=oauth-secret&state=state-secret#fragment",
      ),
    ).toBe("/api/auth/oauth/google/callback");
    expect(
      normalizeSafeHttpPathname(
        "https://www.toonstudio.cloud/api/auth/session?token=secret",
      ),
    ).toBe("/api/auth/session");
  });

  it("fails to a non-sensitive root pathname instead of returning an unsafe URL", () => {
    expect(
      safeHttpRequestPathname({
        originalUrl: "not-an-http-path?code=secret",
        url: "also-not-a-path?state=secret",
      }),
    ).toBe("/");
  });
});

describe("AllExceptionsFilter credential boundary", () => {
  it("keeps OAuth query credentials out of 5xx responses and logs", () => {
    const logger = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const { host, json, status } = boundary(
      "/api/auth/oauth/google/callback?code=oauth-secret&state=state-secret",
    );

    new AllExceptionsFilter().catch(
      new Error(
        "unexpected /api/auth/oauth/google/callback?code=oauth-secret&state=state-secret",
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/auth/oauth/google/callback",
        statusCode: 500,
      }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain("oauth-secret");
    expect(JSON.stringify(json.mock.calls)).not.toContain("state-secret");
    expect(JSON.stringify(logger.mock.calls)).not.toContain("oauth-secret");
    expect(JSON.stringify(logger.mock.calls)).not.toContain("state-secret");
  });

  it("preserves the existing HttpException envelope while normalizing its path", () => {
    const { host, json, status } = boundary(
      "/api/auth/login?password=never-return-this",
    );

    new AllExceptionsFilter().catch(
      new BadRequestException({ error: "invalid-login" }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "invalid-login",
        path: "/api/auth/login",
        statusCode: 400,
      }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain("never-return-this");
  });

  it("redacts nested upstream details from an explicit 5xx HttpException envelope", () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { host, json, status } = boundary("/api/catalog/ingest");

    new AllExceptionsFilter().catch(
      new BadGatewayException({
        error: "postgresql://operator:secret@db.example/internal",
        message: "https://storage.example/object?signature=secret",
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 502,
      message: "Request could not be completed",
      path: "/api/catalog/ingest",
    }));
    expect(JSON.stringify(json.mock.calls)).not.toContain("operator");
    expect(JSON.stringify(json.mock.calls)).not.toContain("signature");
  });

  it("overrides shared cache policies with no-store on 5xx so outages are never edge-cached", () => {
    const logger = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const { host, setHeader } = boundary("/api/creator/marketplace/resources");

    new AllExceptionsFilter().catch(new Error("neon quota exhausted"), host);

    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(logger).toHaveBeenCalled();
  });

  it("leaves 4xx responses untouched for route cache policies", () => {
    const { host, setHeader } = boundary("/api/creator/marketplace/resources");

    new AllExceptionsFilter().catch(
      new BadRequestException({ error: "invalid-query" }),
      host,
    );

    expect(setHeader).not.toHaveBeenCalled();
  });
});
