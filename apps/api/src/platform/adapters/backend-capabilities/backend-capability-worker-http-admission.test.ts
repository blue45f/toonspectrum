import { describe, expect, it, vi } from "vitest";

import {
  BACKEND_CAPABILITY_GATEWAY_PATH,
  BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER,
} from "./backend-capability-gateway-contract";
import { resolveBackendCapabilityPolicy } from "./backend-capability-policy";
import {
  backendCapabilityWorkerParserLimitBytes,
  createBackendCapabilityWorkerPreBodyAdmission,
  getBackendCapabilityWorkerHttpAdmission,
  verifyBackendCapabilityWorkerRawBody,
} from "./backend-capability-worker-http-admission";

import type { NextFunction, Request, Response } from "express";

const token = "render-worker-token-that-is-at-least-32-characters";
const policy = resolveBackendCapabilityPolicy({
  BACKEND_DISTRIBUTION_ENABLED: "true",
  BACKEND_RENDER_ENABLED: "true",
  BACKEND_RENDER_BASE_URL: "https://render-worker.example.test",
  BACKEND_RENDER_AUTH_TOKEN: token,
  BACKEND_RENDER_DAILY_REQUEST_BUDGET: "100",
  BACKEND_RENDER_DAILY_COST_BUDGET: "1000",
  BACKEND_RENDER_MAX_EXECUTION_MS: "30000",
  BACKEND_RENDER_MAX_PAYLOAD_BYTES: "1024",
  BACKEND_RENDER_MAX_RESPONSE_BYTES: "65536",
  BACKEND_RENDER_MAX_CONCURRENCY: "2",
});

function responseMock(): Response {
  const response = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response as unknown as Response;
}

function request(
  headers: Record<string, string> = {},
): Request {
  return {
    path: BACKEND_CAPABILITY_GATEWAY_PATH,
    headers,
  } as unknown as Request;
}

describe("capability worker pre-body admission", () => {
  it("authenticates before parsing and records the exact transport byte budget", () => {
    const req = request({
      [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: token,
      "content-length": "1024",
    });
    const res = responseMock();
    const next = vi.fn<NextFunction>();

    createBackendCapabilityWorkerPreBodyAdmission(policy)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(getBackendCapabilityWorkerHttpAdmission(req)).toMatchObject({
      providerId: "render",
      maximumBodyBytes: 1024,
      rawBodyBytes: null,
    });
    verifyBackendCapabilityWorkerRawBody(req, res, Buffer.alloc(1024));
    expect(getBackendCapabilityWorkerHttpAdmission(req)?.rawBodyBytes).toBe(1024);
    expect(backendCapabilityWorkerParserLimitBytes(policy)).toBe(1024);
  });

  it("rejects invalid tokens and declared over-budget bodies before JSON parsing", () => {
    const invalid = request({
      [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: "invalid",
      "content-length": "10",
    });
    const invalidResponse = responseMock();
    const invalidNext = vi.fn<NextFunction>();
    createBackendCapabilityWorkerPreBodyAdmission(policy)(
      invalid,
      invalidResponse,
      invalidNext,
    );
    expect(invalidNext).not.toHaveBeenCalled();
    expect(invalidResponse.status).toHaveBeenCalledWith(401);

    const oversized = request({
      [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: token,
      "content-length": "1025",
    });
    const oversizedResponse = responseMock();
    const oversizedNext = vi.fn<NextFunction>();
    createBackendCapabilityWorkerPreBodyAdmission(policy)(
      oversized,
      oversizedResponse,
      oversizedNext,
    );
    expect(oversizedNext).not.toHaveBeenCalled();
    expect(oversizedResponse.status).toHaveBeenCalledWith(413);
  });

  it("rejects a chunked body when its exact parsed bytes exceed the admitted provider limit", () => {
    const req = request({ [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: token });
    const res = responseMock();
    createBackendCapabilityWorkerPreBodyAdmission(policy)(
      req,
      res,
      vi.fn<NextFunction>(),
    );

    expect(() =>
      verifyBackendCapabilityWorkerRawBody(req, res, Buffer.alloc(1025)),
    ).toThrow(/exceeds the provider budget/u);
  });
});
