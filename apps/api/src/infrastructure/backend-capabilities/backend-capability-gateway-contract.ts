import { z } from "zod";

import {
  BACKEND_CAPABILITY_IDS,
  BACKEND_CAPABILITY_WORKLOADS,
  BACKEND_REMOTE_PROVIDER_IDS,
  backendCapabilityWorkloadCapability,
} from "./backend-capability-policy";

export const BACKEND_CAPABILITY_GATEWAY_VERSION =
  "toonspectrum.backend-capability.v1" as const;
export const BACKEND_CAPABILITY_GATEWAY_PATH =
  "/.well-known/toonspectrum/backend-capabilities/v1/execute" as const;
export const BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE =
  "application/vnd.toonspectrum.backend-capability+json;version=1" as const;
export const BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER =
  "x-toonspectrum-gateway-token" as const;
export const BACKEND_CAPABILITY_IDEMPOTENCY_HEADER =
  "x-toonspectrum-idempotency-key" as const;

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

const CanonicalJsonValueSchema: z.ZodType<CanonicalJsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(CanonicalJsonValueSchema),
    z.record(z.string(), CanonicalJsonValueSchema),
  ])
);

export const BackendCapabilityIdempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

export const BackendCapabilityTenantIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

export const BackendCapabilityGatewayCommandSchema = z
  .object({
    tenantId: BackendCapabilityTenantIdSchema,
    capability: z.enum(BACKEND_CAPABILITY_IDS),
    workload: z.enum(BACKEND_CAPABILITY_WORKLOADS),
    estimatedCostUnits: z.number().int().positive().max(1_000_000),
    estimatedDurationMs: z.number().int().positive().max(86_400_000),
    durability: z.enum(["best-effort", "durable"]),
    idempotencyKey: BackendCapabilityIdempotencyKeySchema,
    idempotent: z.boolean(),
    payload: CanonicalJsonValueSchema,
  })
  .strict()
  .superRefine((command, context) => {
    if (
      backendCapabilityWorkloadCapability(command.workload) !==
      command.capability
    ) {
      context.addIssue({
        code: "custom",
        path: ["workload"],
        message: `${command.workload} is not a ${command.capability} workload`,
      });
    }
    if (
      command.capability === "object-storage" &&
      command.durability !== "durable"
    ) {
      context.addIssue({
        code: "custom",
        path: ["durability"],
        message: "object storage commands must be durable",
      });
    }
  });

export type BackendCapabilityGatewayCommand = z.infer<
  typeof BackendCapabilityGatewayCommandSchema
>;

export const BackendCapabilityGatewayEnvelopeSchema = z
  .object({
    version: z.literal(BACKEND_CAPABILITY_GATEWAY_VERSION),
    provider: z.enum(BACKEND_REMOTE_PROVIDER_IDS),
    tenantId: BackendCapabilityTenantIdSchema,
    capability: z.enum(BACKEND_CAPABILITY_IDS),
    workload: z.enum(BACKEND_CAPABILITY_WORKLOADS),
    idempotencyKey: BackendCapabilityIdempotencyKeySchema,
    idempotent: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    nonce: z.uuid(),
    requirements: z
      .object({
        fidelity: z.literal("exact"),
        allowDegraded: z.literal(false),
        latency: z.literal("tolerant"),
      })
      .strict(),
    execution: z
      .object({
        estimatedCostUnits: z.number().int().positive().max(1_000_000),
        estimatedDurationMs: z.number().int().positive().max(86_400_000),
        durability: z.enum(["best-effort", "durable"]),
      })
      .strict(),
    payload: CanonicalJsonValueSchema,
  })
  .strict();

export type BackendCapabilityGatewayEnvelope = z.infer<
  typeof BackendCapabilityGatewayEnvelopeSchema
>;

export const BackendCapabilityGatewayResponseSchema = z
  .object({
    version: z.literal(BACKEND_CAPABILITY_GATEWAY_VERSION),
    provider: z.enum(BACKEND_REMOTE_PROVIDER_IDS),
    idempotencyKey: BackendCapabilityIdempotencyKeySchema,
    outcome: z.enum(["accepted", "completed", "duplicate", "rejected"]),
    retryable: z.boolean(),
    fidelity: z.literal("exact"),
    result: CanonicalJsonValueSchema.nullable(),
    errorCode: z
      .string()
      .min(1)
      .max(96)
      .regex(/^[A-Z0-9][A-Z0-9_.:-]*$/u)
      .nullable(),
  })
  .strict()
  .superRefine((response, context) => {
    const rejected = response.outcome === "rejected";
    if (rejected && response.errorCode === null) {
      context.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: "rejected responses require an error code",
      });
    }
    if (!rejected && (response.retryable || response.errorCode !== null)) {
      context.addIssue({
        code: "custom",
        path: ["retryable"],
        message: "successful responses cannot be retryable or carry an error code",
      });
    }
  });

export type BackendCapabilityGatewayResponse = z.infer<
  typeof BackendCapabilityGatewayResponseSchema
>;

/**
 * RFC 8785-inspired deterministic JSON for the supported JSON subset. Object keys are sorted at
 * every depth; values outside JSON (undefined, bigint, NaN, Date, functions) are rejected first.
 */
export function canonicalJsonStringify(value: unknown): string {
  const parsed = CanonicalJsonValueSchema.parse(value);
  return stringifyCanonicalJson(parsed);
}

function stringifyCanonicalJson(value: CanonicalJsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stringifyCanonicalJson).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stringifyCanonicalJson(value[key] ?? null)}`
    )
    .join(",")}}`;
}
