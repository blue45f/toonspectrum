import { createHmac, timingSafeEqual } from "node:crypto";

import {
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";

import { BACKEND_CAPABILITY_GATEWAY_VERSION } from "./backend-capability-gateway-contract";
import {
  BACKEND_CAPABILITY_GATEWAY_RUNTIME,
  type BackendCapabilityGatewayRuntime,
} from "./backend-capability-gateway-dispatcher";
import { BackendCapabilityGatewayExecutor } from "./backend-capability-gateway-executor";
import {
  BACKEND_REMOTE_PROVIDER_IDS,
  type BackendCapabilityPolicy,
} from "./backend-capability-policy";
import { BACKEND_CAPABILITY_POLICY } from "./backend-capability-router";

export const BACKEND_CAPABILITY_WORKER_HEALTH_PATH =
  "/.well-known/toonspectrum/backend-capabilities/v1/health" as const;
export const BACKEND_CAPABILITY_WORKER_HEALTH_PROVIDER_HEADER =
  "x-toonspectrum-health-provider" as const;
export const BACKEND_CAPABILITY_WORKER_HEALTH_TIMESTAMP_HEADER =
  "x-toonspectrum-health-timestamp" as const;
export const BACKEND_CAPABILITY_WORKER_HEALTH_SIGNATURE_HEADER =
  "x-toonspectrum-health-signature" as const;

const MAXIMUM_HEALTH_CLOCK_SKEW_MS = 60_000;
const HealthProviderSchema = z.enum(BACKEND_REMOTE_PROVIDER_IDS);
const HealthTimestampSchema = z
  .string()
  .regex(/^\d{13}$/u)
  .transform(Number)
  .pipe(z.number().int().positive());
const HealthSignatureSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/u);

const BackendCapabilityWorkerHealthResponseSchema = z
  .object({
    version: z.literal(BACKEND_CAPABILITY_GATEWAY_VERSION),
    role: z.literal("capability-worker"),
    ready: z.literal(true),
    operations: z.array(z.enum(["thumbnail.render", "studio-ai-long"])).min(1),
  })
  .strict();

function singleHeader(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.length === 1 ? value[0].trim() : "";
  return typeof value === "string" ? value.trim() : "";
}

export function createBackendCapabilityWorkerHealthSignature(
  token: string,
  provider: string,
  timestamp: string,
): string {
  const message = [
    "GET",
    BACKEND_CAPABILITY_WORKER_HEALTH_PATH,
    provider,
    timestamp,
  ].join("\n");
  return `sha256:${createHmac("sha256", token).update(message).digest("hex")}`;
}

@Controller()
export class BackendCapabilityWorkerHealthController {
  constructor(
    @Inject(BACKEND_CAPABILITY_POLICY)
    private readonly policy: BackendCapabilityPolicy,
    @Inject(BACKEND_CAPABILITY_GATEWAY_RUNTIME)
    private readonly runtime: BackendCapabilityGatewayRuntime,
    private readonly executor: BackendCapabilityGatewayExecutor,
  ) {}

  @Get(BACKEND_CAPABILITY_WORKER_HEALTH_PATH)
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Pragma", "no-cache")
  async ready(
    @Headers(BACKEND_CAPABILITY_WORKER_HEALTH_PROVIDER_HEADER)
    providerHeader: string | string[] | undefined,
    @Headers(BACKEND_CAPABILITY_WORKER_HEALTH_TIMESTAMP_HEADER)
    timestampHeader: string | string[] | undefined,
    @Headers(BACKEND_CAPABILITY_WORKER_HEALTH_SIGNATURE_HEADER)
    signatureHeader: string | string[] | undefined,
  ): Promise<z.infer<typeof BackendCapabilityWorkerHealthResponseSchema>> {
    const provider = HealthProviderSchema.safeParse(singleHeader(providerHeader));
    const timestampText = singleHeader(timestampHeader);
    const timestamp = HealthTimestampSchema.safeParse(timestampText);
    const signature = HealthSignatureSchema.safeParse(
      singleHeader(signatureHeader),
    );
    if (!provider.success || !timestamp.success || !signature.success) {
      throw new UnauthorizedException("Invalid worker health signature");
    }

    const providerPolicy = this.policy.providers[provider.data];
    if (
      !this.policy.enabled ||
      !providerPolicy.enabled ||
      typeof providerPolicy.authToken !== "string" ||
      !providerPolicy.placementRoles.has("container-worker") ||
      !providerPolicy.supportedCapabilities.has("async-job")
    ) {
      throw new UnauthorizedException("Invalid worker health signature");
    }
    const now = this.runtime.now();
    if (
      !Number.isSafeInteger(now) ||
      Math.abs(now - timestamp.data) > MAXIMUM_HEALTH_CLOCK_SKEW_MS
    ) {
      throw new UnauthorizedException("Invalid worker health signature");
    }
    const expected = createBackendCapabilityWorkerHealthSignature(
      providerPolicy.authToken,
      provider.data,
      timestampText,
    );
    const actualBytes = Buffer.from(signature.data, "utf8");
    const expectedBytes = Buffer.from(expected, "utf8");
    if (
      actualBytes.byteLength !== expectedBytes.byteLength ||
      !timingSafeEqual(actualBytes, expectedBytes)
    ) {
      throw new UnauthorizedException("Invalid worker health signature");
    }

    if (!this.executor.hasCapabilityWorkerExecutor()) {
      throw new ServiceUnavailableException("Capability worker is not ready");
    }
    // The built-in worker currently owns exact thumbnail rendering. Long AI remains behind the
    // same port and is advertised only after a durable queue adapter declares it in readiness.
    const portReadiness = await this.executor.capabilityWorkerReadiness();
    if (!portReadiness?.ready) {
      throw new ServiceUnavailableException("Capability worker is not ready");
    }
    return BackendCapabilityWorkerHealthResponseSchema.parse({
      version: BACKEND_CAPABILITY_GATEWAY_VERSION,
      role: "capability-worker",
      ready: true,
      operations: portReadiness.operations,
    });
  }
}

@Controller("health")
export class BackendCapabilityWorkerLiveController {
  @Get("live")
  @Header("Cache-Control", "no-store, max-age=0")
  @Header("Pragma", "no-cache")
  live(): { readonly status: "ok"; readonly role: "capability-worker" } {
    return { status: "ok", role: "capability-worker" };
  }
}
