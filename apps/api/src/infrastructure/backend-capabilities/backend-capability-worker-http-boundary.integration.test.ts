import "reflect-metadata";

import { request as requestHttp } from "node:http";

import {
  Body,
  Controller,
  Module,
  Post,
  Req,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { configureApiBodyParserBoundary } from "../../config/api-body-parser-boundary";

import {
  BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
  BACKEND_CAPABILITY_GATEWAY_PATH,
  BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER,
} from "./backend-capability-gateway-contract";
import { resolveBackendCapabilityPolicy } from "./backend-capability-policy";
import { BackendCapabilityWorkerLiveController } from "./backend-capability-worker-health.controller";
import { getBackendCapabilityWorkerHttpAdmission } from "./backend-capability-worker-http-admission";

import type { INestApplication } from "@nestjs/common";
import type { Request } from "express";
import type { AddressInfo } from "node:net";

const workerToken = "render-worker-token-that-is-at-least-32-characters";
const workerPolicy = resolveBackendCapabilityPolicy({
  BACKEND_DISTRIBUTION_ENABLED: "true",
  BACKEND_RENDER_ENABLED: "true",
  BACKEND_RENDER_BASE_URL: "https://render-worker.example.test",
  BACKEND_RENDER_AUTH_TOKEN: workerToken,
  BACKEND_RENDER_DAILY_REQUEST_BUDGET: "100",
  BACKEND_RENDER_DAILY_COST_BUDGET: "1000",
  BACKEND_RENDER_MAX_EXECUTION_MS: "30000",
  BACKEND_RENDER_MAX_PAYLOAD_BYTES: "1024",
  BACKEND_RENDER_MAX_RESPONSE_BYTES: "65536",
  BACKEND_RENDER_MAX_CONCURRENCY: "2",
});
const gatewayExecution = vi.fn();

@Controller()
class CapabilityWorkerParserProbeController {
  @Post(BACKEND_CAPABILITY_GATEWAY_PATH)
  execute(@Body() body: unknown, @Req() request: Request) {
    gatewayExecution();
    return {
      body,
      rawBodyBytes:
        getBackendCapabilityWorkerHttpAdmission(request)?.rawBodyBytes ?? null,
    };
  }
}

@Module({
  controllers: [
    CapabilityWorkerParserProbeController,
    BackendCapabilityWorkerLiveController,
  ],
})
class CapabilityWorkerHttpBoundaryTestModule {}

interface RawResponse {
  readonly status: number;
  readonly body: string;
}

function rawRequest(
  baseUrl: URL,
  input: {
    readonly method: "GET" | "POST";
    readonly path: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly chunks?: readonly string[];
  },
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const request = requestHttp({
      hostname: baseUrl.hostname,
      port: baseUrl.port,
      method: input.method,
      path: input.path,
      headers: input.headers,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.once("end", () => resolve({
        status: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.once("error", reject);
    for (const chunk of input.chunks ?? []) request.write(chunk);
    request.end();
  });
}

describe("capability worker real Nest/Express body boundary", () => {
  let app: INestApplication;
  let baseUrl: URL;

  beforeAll(async () => {
    app = await NestFactory.create(CapabilityWorkerHttpBoundaryTestModule, {
      bodyParser: false,
      logger: false,
    });
    configureApiBodyParserBoundary(app, workerPolicy);
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = new URL(`http://127.0.0.1:${address.port}`);
  });

  beforeEach(() => {
    gatewayExecution.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects an invalid token before malformed JSON reaches the parser", async () => {
    const body = "{not-json";
    const response = await rawRequest(baseUrl, {
      method: "POST",
      path: BACKEND_CAPABILITY_GATEWAY_PATH,
      headers: {
        "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
        "content-length": String(Buffer.byteLength(body)),
        [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: "invalid-worker-token",
      },
      chunks: [body],
    });

    expect(response.status).toBe(401);
    expect(response.body).toContain("Invalid gateway token");
    expect(response.body).not.toContain(workerToken);
    expect(gatewayExecution).not.toHaveBeenCalled();
  });

  it("rejects a declared provider-budget overflow before controller execution", async () => {
    const body = JSON.stringify("x".repeat(1_023));
    expect(Buffer.byteLength(body)).toBe(1_025);
    const response = await rawRequest(baseUrl, {
      method: "POST",
      path: BACKEND_CAPABILITY_GATEWAY_PATH,
      headers: {
        "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
        "content-length": String(Buffer.byteLength(body)),
        [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: workerToken,
      },
      chunks: [body],
    });

    expect(response.status).toBe(413);
    expect(response.body).toContain("Gateway payload exceeds the provider budget");
    expect(gatewayExecution).not.toHaveBeenCalled();
  });

  it("enforces the exact byte budget for chunked bodies without Content-Length", async () => {
    const body = JSON.stringify("x".repeat(1_023));
    const response = await rawRequest(baseUrl, {
      method: "POST",
      path: BACKEND_CAPABILITY_GATEWAY_PATH,
      headers: {
        "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
        [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: workerToken,
      },
      chunks: [body.slice(0, 500), body.slice(500)],
    });

    expect(response.status).toBe(413);
    expect(gatewayExecution).not.toHaveBeenCalled();
  });

  it("records raw transport bytes for an admitted vendor JSON request", async () => {
    const body = JSON.stringify({ operation: "probe", value: "한글" });
    const response = await rawRequest(baseUrl, {
      method: "POST",
      path: BACKEND_CAPABILITY_GATEWAY_PATH,
      headers: {
        "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
        "content-length": String(Buffer.byteLength(body)),
        [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: workerToken,
      },
      chunks: [body],
    });

    expect(response.status).toBe(201);
    expect(JSON.parse(response.body)).toEqual({
      body: { operation: "probe", value: "한글" },
      rawBodyBytes: Buffer.byteLength(body),
    });
    expect(gatewayExecution).toHaveBeenCalledOnce();
  });

  it("does not parse or authenticate a capability-worker health body", async () => {
    const response = await rawRequest(baseUrl, {
      method: "GET",
      path: "/health/live",
      headers: {
        "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
        "content-length": String(Buffer.byteLength("{malformed-json")),
      },
      chunks: ["{malformed-json"],
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      status: "ok",
      role: "capability-worker",
    });
    expect(gatewayExecution).not.toHaveBeenCalled();
  });
});
