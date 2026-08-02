import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Headers,
  Inject,
  Request,
  HttpCode,
  PayloadTooLargeException,
  Post,
  UnauthorizedException,
} from "@nestjs/common";

import { resolveApiRuntimeRole } from "../../config/runtime-role";

import {
  BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
  BACKEND_CAPABILITY_GATEWAY_PATH,
  BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER,
  BACKEND_CAPABILITY_IDEMPOTENCY_HEADER,
  BackendCapabilityGatewayEnvelopeSchema,
  type BackendCapabilityGatewayResponse,
} from "./backend-capability-gateway-contract";
import { BackendCapabilityGatewayExecutor } from "./backend-capability-gateway-executor";
import { BACKEND_CAPABILITY_POLICY } from "./backend-capability-router";
import {
  backendCapabilityTokensEqual,
  getBackendCapabilityWorkerHttpAdmission,
} from "./backend-capability-worker-http-admission";

import type { BackendCapabilityPolicy } from "./backend-capability-policy";
import type { Request as ExpressRequest } from "express";

function normalizeHeaderValue(
  value: string | string[] | undefined
): string {
  if (Array.isArray(value)) {
    if (value.length !== 1) return "";
    return value[0].trim();
  }
  return typeof value === "string" ? value.trim() : "";
}

function normalizeContentType(value: string | string[] | undefined): string {
  const normalized = normalizeHeaderValue(value);
  if (!normalized) return "";
  return normalized.toLowerCase().split(";")[0].trim();
}

function requireSingleHeader(
  value: string | string[] | undefined,
  headerName: string
): string {
  const normalized = normalizeHeaderValue(value);
  if (!normalized) {
    throw new UnauthorizedException(`${headerName} is required`);
  }
  return normalized;
}

interface GatewayRequestAbortScope {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
}

function createGatewayRequestAbortScope(
  request: ExpressRequest
): GatewayRequestAbortScope {
  const controller = new AbortController();
  const abort = () => controller.abort(new Error("gateway caller disconnected"));
  const response = request.res;
  const onResponseClose = () => {
    if (!response?.writableEnded) abort();
  };

  request.once("aborted", abort);
  response?.once("close", onResponseClose);
  if (request.aborted) abort();

  return {
    signal: controller.signal,
    dispose: () => {
      request.off("aborted", abort);
      response?.off("close", onResponseClose);
    },
  };
}

@Controller()
export class BackendCapabilityGatewayController {
  constructor(
    @Inject(BACKEND_CAPABILITY_POLICY)
    private readonly policy: BackendCapabilityPolicy,
    private readonly executor: BackendCapabilityGatewayExecutor
  ) {}

  @Post(BACKEND_CAPABILITY_GATEWAY_PATH)
  @HttpCode(200)
  @Header("Content-Type", BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE)
  @Header("Cache-Control", "private, no-store, max-age=0")
  async execute(
    @Headers(BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER) tokenHeader: string | string[] | undefined,
    @Headers(BACKEND_CAPABILITY_IDEMPOTENCY_HEADER) idempotencyHeader: string | string[] | undefined,
    @Headers("content-type") contentTypeHeader: string | string[] | undefined,
    @Request() request: ExpressRequest,
    @Body() body: unknown
  ): Promise<BackendCapabilityGatewayResponse> {
    const contentType = normalizeContentType(contentTypeHeader);
    if (
      contentType !==
      BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE.toLowerCase().split(";")[0].trim()
    ) {
      throw new BadRequestException("Invalid gateway content-type");
    }

    const parsed = BackendCapabilityGatewayEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Invalid gateway payload");
    }

    const envelope = parsed.data;
    const runtimeRole = resolveApiRuntimeRole(process.env);
    if (runtimeRole === "capability-worker") {
      const admission = getBackendCapabilityWorkerHttpAdmission(request);
      if (!admission || admission.providerId !== envelope.provider) {
        throw new UnauthorizedException("Invalid gateway token");
      }
      if (
        admission.rawBodyBytes === null
        || admission.rawBodyBytes > admission.maximumBodyBytes
      ) {
        throw new PayloadTooLargeException(
          "Gateway payload exceeds the provider budget",
        );
      }
    }
    const headerToken = requireSingleHeader(
      tokenHeader,
      BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER
    );
    const headerIdempotency = normalizeHeaderValue(idempotencyHeader);
    if (envelope.idempotencyKey !== headerIdempotency) {
      throw new BadRequestException("Idempotency header mismatch");
    }

    const policyProvider = this.policy.providers[envelope.provider];
    if (
      !policyProvider.enabled
      || typeof policyProvider.authToken !== "string"
      || !backendCapabilityTokensEqual(headerToken, policyProvider.authToken)
    ) {
      throw new UnauthorizedException("Invalid gateway token");
    }
    if (runtimeRole === "capability-worker") {
      const payload = envelope.payload;
      const operation =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>).operation
          : undefined;
      const allowedWorkload =
        envelope.workload === "thumbnail" ||
        (envelope.workload === "webhook" && operation === "studio-ai-long");
      if (
        !allowedWorkload ||
        !policyProvider.placementRoles.has("container-worker")
      ) {
        throw new BadRequestException(
          "Workload is not available on this runtime role",
        );
      }
    }

    const abortScope = createGatewayRequestAbortScope(request);
    try {
      return await this.executor.execute(
        envelope,
        envelope.provider,
        abortScope.signal
      );
    } finally {
      abortScope.dispose();
    }
  }
}
