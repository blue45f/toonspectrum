import { createHash } from "node:crypto";

import { Inject, Injectable, Optional } from "@nestjs/common";
import { z } from "zod";

import { parseStudioAiIdempotencyKey } from "../../modules/studio-ai/studio-ai-idempotency";
import {
  classifyStudioAiProviderFailure,
  resolveStudioAiProviderCandidates,
  resolveStudioAiTimeoutMs,
  type StudioAiProviderConfig,
} from "../../modules/studio-ai/studio-ai-provider";
import { STUDIO_AI_BILLING_FAILOVER_REASON, studioAiProviderRequestId } from "../../modules/studio-ai/studio-ai-provider";
import { StudioAiTaskSchema, type StudioAiProviderPreference } from "../../modules/studio-ai/studio-ai.dto";

import {
  BACKEND_CAPABILITY_DURABLE_QUEUE_PORT,
  BACKEND_CAPABILITY_DURABLE_QUEUE_WORKLOADS,
  BackendCapabilityCleanupPayloadSchema,
  BackendCapabilityDurableQueueCommandSchema,
  BackendCapabilityDurableQueueProviderSchema,
  BackendCapabilityDurableQueueReadinessSchema,
  BackendCapabilityDurableQueueSubmissionSchema,
  BackendCapabilityNotificationPayloadSchema,
  type BackendCapabilityDurableQueuePort,
  type BackendCapabilityDurableQueueReadiness,
} from "./backend-capability-durable-queue.port";
import {
  BACKEND_CAPABILITY_GATEWAY_VERSION,
  BackendCapabilityGatewayResponseSchema,
  canonicalJsonStringify,
  type BackendCapabilityGatewayEnvelope,
  type BackendCapabilityGatewayResponse,
} from "./backend-capability-gateway-contract";
import {
  BACKEND_GATEWAY_HARD_MAX_BODY_BYTES,
  type BackendCapabilityPolicy,
  type BackendRemoteProviderId,
} from "./backend-capability-policy";
import { BACKEND_CAPABILITY_POLICY } from "./backend-capability-router";

interface GatewayReceipt {
  commandFingerprint: string;
  response: BackendCapabilityGatewayResponse;
  expiresAtMs: number;
}

interface StudioAiCompletion {
  content: string;
  provider: string;
  model: string;
  requestId?: string;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  failover?: {
    attemptedProvider: string;
    attemptedModel: string;
    actualProvider: string;
    actualModel: string;
    reason: string;
  };
}

type StudioAiAttempt =
  | { kind: "completed"; completion: StudioAiCompletion }
  | {
      kind: "rejected";
      retryable: boolean;
      errorCode: string;
      terminal: boolean;
      allowFailover: boolean;
    };

const IDEMPOTENCY_TTL_MS = 6 * 60 * 60 * 1000;
const DURABLE_QUEUE_READINESS_TIMEOUT_MS = 2_500;

class DurableQueueCallAbortedError extends Error {
  constructor() {
    super("durable queue call aborted");
    this.name = "DurableQueueCallAbortedError";
  }
}

interface DurableQueueAbortScope {
  readonly signal: AbortSignal;
  readonly callerAborted: () => boolean;
  readonly timedOut: () => boolean;
  readonly dispose: () => void;
}

function createDurableQueueAbortScope(
  timeoutMs: number,
  callerSignal: AbortSignal | undefined
): DurableQueueAbortScope {
  const controller = new AbortController();
  let callerAborted = callerSignal?.aborted ?? false;
  let timedOut = false;
  const onCallerAbort = () => {
    callerAborted = true;
    controller.abort(callerSignal?.reason);
  };
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  if (callerAborted) controller.abort(callerSignal?.reason);

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("durable queue executor timeout"));
  }, timeoutMs);
  timer.unref?.();

  return {
    signal: controller.signal,
    callerAborted: () => callerAborted,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

function awaitDurableQueueCall<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) return Promise.reject(new DurableQueueCallAbortedError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DurableQueueCallAbortedError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

const StudioAiWebhookPayloadSchema = z
  .object({
    operation: z.literal("studio-ai-chat"),
    capability: z.literal("studio-ai-chat"),
    tenant: z.string().min(1).max(256),
    provider: z.enum(["zai", "deepseek"]).optional(),
    modelHint: z.string().trim().min(1).max(200),
    temperature: z.number().finite().min(0).max(2),
    maxTokens: z.number().int().positive().max(24_000),
    responseFormat: z.enum(["json", "text"]),
    task: StudioAiTaskSchema,
    system: z.string().trim().min(1).max(6_000),
    user: z.string().trim().min(1).max(12_000),
    anonymousUserId: z.string().nullable(),
    requestKey: z
      .string()
      .transform((value) => parseStudioAiIdempotencyKey(value))
      .pipe(z.string()),
  })
  .strict();

const ThumbnailPayloadSchema = z
  .object({
    operation: z.literal("thumbnail.render"),
    tenantId: z.string().min(1).max(256),
    sourceAssetId: z.string().min(1).max(256),
    format: z.enum(["webp", "png", "jpeg"]).optional(),
    maxWidth: z.number().int().positive().max(8_192).optional(),
    maxHeight: z.number().int().positive().max(8_192).optional(),
    requestKey: z
      .string()
      .transform((value) => parseStudioAiIdempotencyKey(value))
      .pipe(z.string()),
  })
  .strict();

const LongStudioAiPayloadSchema = z
  .object({
    operation: z.literal("studio-ai-long"),
    tenantId: z.string().min(1).max(256),
    requestKey: z
      .string()
      .transform((value) => parseStudioAiIdempotencyKey(value))
      .pipe(z.string()),
    jobType: z.string().min(1).max(128),
    task: z.record(z.string(), z.unknown()),
  })
  .strict();

function commandFingerprint(command: BackendCapabilityGatewayEnvelope): string {
  const payload = canonicalJsonStringify({
    domain: "toonspectrum.backend-capability-gateway-executor-request.v1",
    tenantId: command.tenantId,
    capability: command.capability,
    workload: command.workload,
    idempotencyKey: command.idempotencyKey,
    idempotent: command.idempotent,
    execution: command.execution,
    payload: command.payload,
  });
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}

function parsedNumber(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 2_000_000
    ? value
    : undefined;
}

function providerUsage(payload: Record<string, unknown>): {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
} {
  const usage = payload.usage as Record<string, unknown> | undefined;
  if (!usage) return {};
  return {
    ...(parsedNumber(usage.promptTokens) ??
    parsedNumber(usage.prompt_tokens) !== undefined
      ? {
          promptTokens:
            parsedNumber(usage.promptTokens) ??
            parsedNumber(usage.prompt_tokens),
        }
      : {}),
    ...(parsedNumber(usage.completionTokens) ??
    parsedNumber(usage.completion_tokens) !== undefined
      ? {
          completionTokens:
            parsedNumber(usage.completionTokens) ??
            parsedNumber(usage.completion_tokens),
        }
      : {}),
    ...(parsedNumber(usage.totalTokens) ??
    parsedNumber(usage.total_tokens) !== undefined
      ? {
          totalTokens:
            parsedNumber(usage.totalTokens) ??
            parsedNumber(usage.total_tokens),
        }
      : {}),
  };
}

@Injectable()
export class BackendCapabilityGatewayExecutor {
  private readonly receipts = new Map<string, GatewayReceipt>();

  constructor(
    @Inject(BACKEND_CAPABILITY_POLICY)
    private readonly policy: BackendCapabilityPolicy,
    @Optional()
    @Inject(BACKEND_CAPABILITY_DURABLE_QUEUE_PORT)
    private readonly durableQueue?: BackendCapabilityDurableQueuePort
  ) {}

  hasDurableQueueExecutor(): boolean {
    return this.durableQueue !== undefined;
  }

  /**
   * True only when local policy enables a cleanup/notification durable-queue
   * provider. The authoritative API may omit the port while distribution is
   * disabled, but an enabled queue role must never advertise green readiness
   * without an installed adapter.
   */
  isDurableQueueExecutorRequired(): boolean {
    return BACKEND_CAPABILITY_DURABLE_QUEUE_WORKLOADS.some((workload) =>
      this.policy.workloadProviderOrder[workload].some((candidate) => {
        const providerId = BackendCapabilityDurableQueueProviderSchema.safeParse(candidate);
        return providerId.success
          && this.isDurableQueueProviderAllowed(providerId.data, workload);
      })
    );
  }

  async isDurableQueueReady(
    signal: AbortSignal | undefined = undefined
  ): Promise<boolean> {
    const durableQueue = this.durableQueue;
    if (!durableQueue) return false;

    const scope = createDurableQueueAbortScope(
      DURABLE_QUEUE_READINESS_TIMEOUT_MS,
      signal
    );
    try {
      const rawReadiness = await awaitDurableQueueCall(
        Promise.resolve().then(() =>
          durableQueue.verifyReadiness({ signal: scope.signal })
        ),
        scope.signal
      );
      const readiness =
        BackendCapabilityDurableQueueReadinessSchema.safeParse(rawReadiness);
      if (!readiness.success || !readiness.data.ready) return false;
      const ready = readiness.data;
      return BACKEND_CAPABILITY_DURABLE_QUEUE_WORKLOADS.every((workload) =>
        this.readinessSupportsWorkload(ready, workload)
      );
    } catch {
      return false;
    } finally {
      scope.dispose();
    }
  }

  async execute(
    envelope: BackendCapabilityGatewayEnvelope,
    providerId: BackendRemoteProviderId,
    signal: AbortSignal | undefined = undefined
  ): Promise<BackendCapabilityGatewayResponse> {
    const now = Date.now();
    this.purgeExpired(now);

    if (providerId !== envelope.provider) {
      return this.parseGatewayResponse({
        providerId,
        idempotencyKey: envelope.idempotencyKey,
        outcome: "rejected",
        retryable: false,
        result: null,
        errorCode: "PROVIDER_ID_MISMATCH",
      });
    }

    const provider = this.policy.providers[providerId];
    if (!this.policy.enabled || !provider.enabled) {
      return this.parseGatewayResponse({
        providerId,
        idempotencyKey: envelope.idempotencyKey,
        outcome: "rejected",
        retryable: false,
        result: null,
        errorCode: "PROVIDER_NOT_ENABLED",
      });
    }

    let envelopeBytes: number;
    try {
      envelopeBytes = Buffer.byteLength(
        canonicalJsonStringify(envelope),
        "utf8"
      );
    } catch {
      return this.parseGatewayResponse({
        providerId,
        idempotencyKey: envelope.idempotencyKey,
        outcome: "rejected",
        retryable: false,
        result: null,
        errorCode: "INVALID_GATEWAY_PAYLOAD",
      });
    }
    if (
      envelopeBytes > BACKEND_GATEWAY_HARD_MAX_BODY_BYTES ||
      envelopeBytes > provider.maxPayloadBytes ||
      envelope.execution.estimatedDurationMs > provider.maxExecutionMs
    ) {
      return this.parseGatewayResponse({
        providerId,
        idempotencyKey: envelope.idempotencyKey,
        outcome: "rejected",
        retryable: false,
        result: null,
        errorCode: "PROVIDER_LIMIT_EXCEEDED",
      });
    }

    const cacheKey = `${providerId}:${envelope.idempotencyKey}`;
    const hash = commandFingerprint(envelope);
    const existing = this.receipts.get(cacheKey);
    if (existing) {
      if (existing.commandFingerprint === hash) {
        return this.parseGatewayResponse({
          providerId,
          idempotencyKey: envelope.idempotencyKey,
          outcome: "duplicate",
          retryable: false,
          result: existing.response.result,
          errorCode: null,
        });
      }
      return this.parseGatewayResponse({
        providerId,
        idempotencyKey: envelope.idempotencyKey,
        outcome: "rejected",
        retryable: false,
        result: null,
        errorCode: "IDEMPOTENCY_KEY_MISMATCH",
      });
    }

    const response = await this.executeByWorkload(envelope, signal);
    if (response.outcome !== "rejected") {
      this.receipts.set(cacheKey, {
        commandFingerprint: hash,
        response,
        expiresAtMs: now + IDEMPOTENCY_TTL_MS,
      });
    }
    return response;
  }

  private async executeByWorkload(
    envelope: BackendCapabilityGatewayEnvelope,
    signal: AbortSignal | undefined
  ): Promise<BackendCapabilityGatewayResponse> {
    switch (envelope.workload) {
      case "webhook": {
        const operation = this.extractPayloadOperation(envelope.payload);
        if (operation === "studio-ai-long") {
          return this.executeLongAiPayload(envelope);
        }
        return this.executeWebhookPayload(envelope, signal);
      }
      case "thumbnail":
        return this.executeThumbnailPayload(envelope);
      case "cleanup":
      case "notification":
        return this.executeDurableQueuePayload(envelope, signal);
      default:
        return this.parseGatewayResponse({
          providerId: envelope.provider,
          idempotencyKey: envelope.idempotencyKey,
          outcome: "rejected",
          retryable: false,
          result: null,
          errorCode: "UNSUPPORTED_WORKLOAD",
        });
    }
  }

  private extractPayloadOperation(
    payload: unknown
  ): string | undefined {
    if (!payload || typeof payload !== "object") return undefined;
    const candidate = payload as Record<string, unknown>;
    return typeof candidate.operation === "string" ? candidate.operation : undefined;
  }

  private async executeDurableQueuePayload(
    envelope: BackendCapabilityGatewayEnvelope,
    signal: AbortSignal | undefined
  ): Promise<BackendCapabilityGatewayResponse> {
    if (
      envelope.workload !== "cleanup" &&
      envelope.workload !== "notification"
    ) {
      return this.rejectDurableQueue(
        envelope,
        "DURABLE_QUEUE_WORKLOAD_UNSUPPORTED",
        false
      );
    }
    const providerId = BackendCapabilityDurableQueueProviderSchema.safeParse(
      envelope.provider
    );
    if (
      !providerId.success ||
      !this.isDurableQueueProviderAllowed(
        providerId.data,
        envelope.workload
      )
    ) {
      return this.rejectDurableQueue(
        envelope,
        "DURABLE_QUEUE_PROVIDER_UNSUPPORTED",
        false
      );
    }

    if (!envelope.idempotent || envelope.execution.durability !== "durable") {
      return this.rejectDurableQueue(
        envelope,
        "DURABLE_QUEUE_REQUIRES_IDEMPOTENT_DURABLE_COMMAND",
        false
      );
    }

    const payloadSchema =
      envelope.workload === "cleanup"
        ? BackendCapabilityCleanupPayloadSchema
        : BackendCapabilityNotificationPayloadSchema;
    const payload = payloadSchema.safeParse(envelope.payload);
    if (
      !payload.success ||
      payload.data.requestKey !== envelope.idempotencyKey
    ) {
      return this.rejectDurableQueue(
        envelope,
        "INVALID_DURABLE_QUEUE_PAYLOAD",
        false
      );
    }

    const durableQueue = this.durableQueue;
    if (!durableQueue) {
      return this.rejectDurableQueue(
        envelope,
        "DURABLE_QUEUE_EXECUTOR_UNAVAILABLE",
        true
      );
    }

    const provider = this.policy.providers[providerId.data];
    const timeoutMs = Math.max(
      1,
      Math.min(
        provider.maxExecutionMs,
        envelope.execution.estimatedDurationMs
      )
    );
    const scope = createDurableQueueAbortScope(timeoutMs, signal);
    try {
      const rawReadiness = await awaitDurableQueueCall(
        Promise.resolve().then(() =>
          durableQueue.verifyReadiness({ signal: scope.signal })
        ),
        scope.signal
      );
      const readiness =
        BackendCapabilityDurableQueueReadinessSchema.safeParse(rawReadiness);
      if (!readiness.success) {
        return this.rejectDurableQueue(
          envelope,
          "DURABLE_QUEUE_INVALID_READINESS",
          true
        );
      }
      if (
        !readiness.data.ready ||
        !this.readinessSupports(
          readiness.data,
          providerId.data,
          envelope.workload
        )
      ) {
        return this.rejectDurableQueue(
          envelope,
          "DURABLE_QUEUE_EXECUTOR_NOT_READY",
          true
        );
      }

      const command = BackendCapabilityDurableQueueCommandSchema.safeParse({
        providerId: providerId.data,
        tenantId: envelope.tenantId,
        workload: envelope.workload,
        idempotencyKey: envelope.idempotencyKey,
        createdAt: envelope.createdAt,
        task: payload.data.task,
      });
      if (!command.success) {
        return this.rejectDurableQueue(
          envelope,
          "INVALID_DURABLE_QUEUE_PAYLOAD",
          false
        );
      }

      const rawSubmission = await awaitDurableQueueCall(
        Promise.resolve().then(() =>
          durableQueue.submit(command.data, { signal: scope.signal })
        ),
        scope.signal
      );
      const submission =
        BackendCapabilityDurableQueueSubmissionSchema.safeParse(rawSubmission);
      if (!submission.success) {
        return this.rejectDurableQueue(
          envelope,
          "DURABLE_QUEUE_INVALID_RESPONSE",
          true
        );
      }

      switch (submission.data.outcome) {
        case "accepted":
        case "duplicate":
          return this.parseGatewayResponse({
            providerId: envelope.provider,
            idempotencyKey: envelope.idempotencyKey,
            outcome: submission.data.outcome,
            retryable: false,
            result: {
              requestType: envelope.workload,
              status: "accepted",
              jobId: submission.data.jobId,
            },
            errorCode: null,
          });
        case "completed":
          if (
            !this.isDurableQueueResultWithinProviderLimit(
              providerId.data,
              submission.data.result
            )
          ) {
            return this.rejectDurableQueue(
              envelope,
              "PROVIDER_RESPONSE_LIMIT_EXCEEDED",
              false
            );
          }
          return this.parseGatewayResponse({
            providerId: envelope.provider,
            idempotencyKey: envelope.idempotencyKey,
            outcome: "completed",
            retryable: false,
            result: submission.data.result,
            errorCode: null,
          });
        case "rejected":
          return this.rejectDurableQueue(
            envelope,
            submission.data.errorCode,
            submission.data.retryable
          );
      }
    } catch (error) {
      if (scope.callerAborted()) {
        return this.rejectDurableQueue(
          envelope,
          "DURABLE_QUEUE_EXECUTION_ABORTED",
          true
        );
      }
      if (
        scope.timedOut() ||
        error instanceof DurableQueueCallAbortedError
      ) {
        return this.rejectDurableQueue(
          envelope,
          "DURABLE_QUEUE_EXECUTION_TIMEOUT",
          true
        );
      }
      return this.rejectDurableQueue(
        envelope,
        "DURABLE_QUEUE_EXECUTION_FAILED",
        true
      );
    } finally {
      scope.dispose();
    }
  }

  private readinessSupportsWorkload(
    readiness: BackendCapabilityDurableQueueReadiness & { ready: true },
    workload: "cleanup" | "notification"
  ): boolean {
    return (
      readiness.workloads.includes(workload) &&
      readiness.providerIds.some((providerId) =>
        this.isDurableQueueProviderAllowed(providerId, workload)
      )
    );
  }

  private readinessSupports(
    readiness: BackendCapabilityDurableQueueReadiness & { ready: true },
    providerId: "upstash-qstash" | "cloudflare",
    workload: "cleanup" | "notification"
  ): boolean {
    return (
      readiness.providerIds.includes(providerId) &&
      readiness.workloads.includes(workload) &&
      this.isDurableQueueProviderAllowed(providerId, workload)
    );
  }

  private isDurableQueueProviderAllowed(
    providerId: "upstash-qstash" | "cloudflare",
    workload: "cleanup" | "notification"
  ): boolean {
    const provider = this.policy.providers[providerId];
    return (
      this.policy.enabled &&
      provider.enabled &&
      provider.supportedCapabilities.has("async-job") &&
      provider.placementRoles.has("durable-queue") &&
      this.policy.workloadProviderOrder[workload].includes(providerId)
    );
  }

  private isDurableQueueResultWithinProviderLimit(
    providerId: "upstash-qstash" | "cloudflare",
    result: unknown
  ): boolean {
    try {
      const responseBytes = Buffer.byteLength(
        canonicalJsonStringify(result),
        "utf8"
      );
      return responseBytes <= this.policy.providers[providerId].maxResponseBytes;
    } catch {
      return false;
    }
  }

  private rejectDurableQueue(
    envelope: BackendCapabilityGatewayEnvelope,
    errorCode: string,
    retryable: boolean
  ): BackendCapabilityGatewayResponse {
    return this.parseGatewayResponse({
      providerId: envelope.provider,
      idempotencyKey: envelope.idempotencyKey,
      outcome: "rejected",
      retryable,
      result: null,
      errorCode,
    });
  }

  private async executeThumbnailPayload(
    envelope: BackendCapabilityGatewayEnvelope
  ): Promise<BackendCapabilityGatewayResponse> {
    const payloadParse = ThumbnailPayloadSchema.safeParse(envelope.payload);
    if (!payloadParse.success) {
      return this.parseGatewayResponse({
        providerId: envelope.provider,
        idempotencyKey: envelope.idempotencyKey,
        outcome: "rejected",
        retryable: false,
        result: null,
        errorCode: "INVALID_WEBHOOK_PAYLOAD",
      });
    }
    if (payloadParse.data.operation !== "thumbnail.render") {
      return this.parseGatewayResponse({
        providerId: envelope.provider,
        idempotencyKey: envelope.idempotencyKey,
        outcome: "rejected",
        retryable: false,
        result: null,
        errorCode: "UNSUPPORTED_OPERATION",
      });
    }

    return this.parseGatewayResponse({
      providerId: envelope.provider,
      idempotencyKey: envelope.idempotencyKey,
      outcome: "accepted",
      retryable: false,
      result: {
        requestType: "thumbnail",
        status: "accepted",
        jobId: `thumbnail:${payloadParse.data.requestKey}`,
      },
      errorCode: null,
    });
  }

  private async executeLongAiPayload(
    envelope: BackendCapabilityGatewayEnvelope
  ): Promise<BackendCapabilityGatewayResponse> {
    const payloadParse = LongStudioAiPayloadSchema.safeParse(envelope.payload);
    if (!payloadParse.success) {
      return this.parseGatewayResponse({
        providerId: envelope.provider,
        idempotencyKey: envelope.idempotencyKey,
        outcome: "rejected",
        retryable: false,
        result: null,
        errorCode: "INVALID_WEBHOOK_PAYLOAD",
      });
    }
    if (payloadParse.data.operation !== "studio-ai-long") {
      return this.parseGatewayResponse({
        providerId: envelope.provider,
        idempotencyKey: envelope.idempotencyKey,
        outcome: "rejected",
        retryable: false,
        result: null,
        errorCode: "UNSUPPORTED_OPERATION",
      });
    }

    return this.parseGatewayResponse({
      providerId: envelope.provider,
      idempotencyKey: envelope.idempotencyKey,
      outcome: "accepted",
      retryable: false,
      result: {
        requestType: "studio-ai-long",
        status: "accepted",
        jobId: `studio-ai-long:${payloadParse.data.requestKey}`,
        jobType: payloadParse.data.jobType,
      },
      errorCode: null,
    });
  }

  private async executeWebhookPayload(
    envelope: BackendCapabilityGatewayEnvelope,
    signal: AbortSignal | undefined
  ): Promise<BackendCapabilityGatewayResponse> {
    const payloadParse = StudioAiWebhookPayloadSchema.safeParse(envelope.payload);
    if (!payloadParse.success) {
      return this.parseGatewayResponse({
        providerId: envelope.provider,
        idempotencyKey: envelope.idempotencyKey,
        outcome: "rejected",
        retryable: false,
        result: null,
        errorCode: "INVALID_WEBHOOK_PAYLOAD",
      });
    }
    if (payloadParse.data.operation !== "studio-ai-chat") {
      return this.parseGatewayResponse({
        providerId: envelope.provider,
        idempotencyKey: envelope.idempotencyKey,
        outcome: "rejected",
        retryable: false,
        result: null,
        errorCode: "UNSUPPORTED_OPERATION",
      });
    }

    const payload = payloadParse.data;
    const providers = resolveStudioAiProviderCandidates(
      (payload.provider ?? "zai") as StudioAiProviderPreference
    );
    if (providers.length === 0) {
      return this.parseGatewayResponse({
        providerId: envelope.provider,
        idempotencyKey: envelope.idempotencyKey,
        outcome: "rejected",
        retryable: false,
        result: null,
        errorCode: "AI_PROVIDER_NOT_CONFIGURED",
      });
    }

    let failoverSource: StudioAiProviderConfig | null = null;
    for (let index = 0; index < providers.length; index += 1) {
      const provider = providers[index];
      const attempt = await this.callStudioAiProvider(provider, payload, signal);

      if (attempt.kind === "completed") {
        if (failoverSource) {
          return this.parseGatewayResponse({
            providerId: envelope.provider,
            idempotencyKey: envelope.idempotencyKey,
            outcome: "completed",
            retryable: false,
            result: {
              ...attempt.completion,
              failover: {
                attemptedProvider: failoverSource.id,
                attemptedModel: failoverSource.model,
                actualProvider: attempt.completion.provider,
                actualModel: attempt.completion.model,
                reason: STUDIO_AI_BILLING_FAILOVER_REASON,
              },
            },
            errorCode: null,
          });
        }
        return this.parseGatewayResponse({
          providerId: envelope.provider,
          idempotencyKey: envelope.idempotencyKey,
          outcome: "completed",
          retryable: false,
          result: attempt.completion,
          errorCode: null,
        });
      }

      if (attempt.allowFailover && index + 1 < providers.length) {
        failoverSource = provider;
        continue;
      }
      return this.parseGatewayResponse({
        providerId: envelope.provider,
        idempotencyKey: envelope.idempotencyKey,
        outcome: "rejected",
        retryable: attempt.retryable,
        result: null,
        errorCode: attempt.errorCode,
      });
    }

    return this.parseGatewayResponse({
      providerId: envelope.provider,
      idempotencyKey: envelope.idempotencyKey,
      outcome: "rejected",
      retryable: true,
      result: null,
      errorCode: "AI_PROVIDER_POOL_EXHAUSTED",
    });
  }

  private async callStudioAiProvider(
    provider: StudioAiProviderConfig,
    webhookPayload: z.infer<typeof StudioAiWebhookPayloadSchema>,
    signal: AbortSignal | undefined
  ): Promise<StudioAiAttempt> {
    const timeoutMs = resolveStudioAiTimeoutMs(provider.id);
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort();
    signal?.addEventListener("abort", onCallerAbort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new Error("backend capability ai gateway timeout")),
      timeoutMs
    );
    timer.unref?.();

    try {
      const response = await fetch(provider.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
          ...(provider.id === "zai" ? { "Accept-Language": "en-US,en" } : {}),
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: "system", content: webhookPayload.system },
            { role: "user", content: webhookPayload.user },
          ],
          thinking: { type: "disabled" },
          temperature: webhookPayload.temperature,
          max_tokens: webhookPayload.maxTokens,
          stream: false,
          ...(webhookPayload.responseFormat === "json"
            ? { response_format: { type: "json_object" } }
            : {}),
          ...(provider.id === "deepseek" && webhookPayload.anonymousUserId
            ? { user_id: webhookPayload.anonymousUserId }
            : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      if (!response.ok) {
        const body = await this.safeJson(response);
        const failure = classifyStudioAiProviderFailure(provider.id, response.status, body);
        if (failure.kind === "request_rejected") {
          return {
            kind: "rejected",
            retryable: false,
            errorCode: "AI_REQUEST_REJECTED",
            terminal: true,
            allowFailover: false,
          };
        }
        if (failure.kind === STUDIO_AI_BILLING_FAILOVER_REASON) {
          return {
            kind: "rejected",
            retryable: true,
            errorCode: "AI_BILLING_QUOTA_EXHAUSTED",
            terminal: true,
            allowFailover: true,
          };
        }
        if (failure.kind === "rate_limited") {
          return {
            kind: "rejected",
            retryable: true,
            errorCode: "AI_RATE_LIMITED",
            terminal: true,
            allowFailover: false,
          };
        }
        if (failure.kind === "authentication") {
          return {
            kind: "rejected",
            retryable: false,
            errorCode: "AI_AUTHENTICATION",
            terminal: true,
            allowFailover: false,
          };
        }
        return {
          kind: "rejected",
          retryable: failure.kind === "provider_unavailable",
          errorCode: "AI_PROVIDER_ERROR",
          terminal: true,
          allowFailover: false,
        };
      }

      const body = await this.safeJson(response);
      if (!body || typeof body !== "object") {
        return {
          kind: "rejected",
          retryable: false,
          errorCode: "AI_INVALID_RESPONSE",
          terminal: true,
          allowFailover: false,
        };
      }
      const providerPayload = body as Record<string, unknown>;
      const choices = Array.isArray(providerPayload.choices)
        ? providerPayload.choices
        : [];
      const firstChoice = choices[0];
      const message =
        firstChoice && typeof firstChoice === "object" && firstChoice !== null
          ? (firstChoice as Record<string, unknown>).message
          : undefined;
      const messageRecord =
        typeof message === "object" && message !== null
          ? (message as Record<string, unknown>)
          : undefined;
      const content =
        typeof messageRecord?.content === "string"
        ? String(messageRecord.content).trim()
        : "";
      if (!content) {
        return {
          kind: "rejected",
          retryable: false,
          errorCode: "AI_RESPONSE_EMPTY",
          terminal: true,
          allowFailover: false,
        };
      }

      const model = typeof providerPayload.model === "string" &&
        providerPayload.model.trim()
        ? providerPayload.model.trim().slice(0, 200)
        : provider.model;
      return {
        kind: "completed",
        completion: {
          content,
          provider: provider.id,
          model,
          requestId: studioAiProviderRequestId(providerPayload),
          usage: providerUsage(providerPayload),
        },
      };
    } catch (error) {
      clearTimeout(timer);
      const aborted =
        error instanceof DOMException && error.name === "AbortError";
      return {
        kind: "rejected",
        retryable: !aborted,
        errorCode: aborted ? "AI_REQUEST_ABORTED" : "AI_NETWORK_ERROR",
        terminal: true,
        allowFailover: false,
      };
    }
  }

  private async safeJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private parseGatewayResponse(input: {
    providerId: string;
    idempotencyKey: string;
    outcome: "completed" | "accepted" | "duplicate" | "rejected";
    retryable: boolean;
    result: unknown;
    errorCode: string | null;
  }): BackendCapabilityGatewayResponse {
    return BackendCapabilityGatewayResponseSchema.parse({
      version: BACKEND_CAPABILITY_GATEWAY_VERSION,
      provider: input.providerId,
      idempotencyKey: input.idempotencyKey,
      outcome: input.outcome,
      retryable: input.retryable,
      fidelity: "exact",
      result: input.result,
      errorCode: input.errorCode,
    });
  }

  private purgeExpired(now: number): void {
    for (const [cacheKey, receipt] of this.receipts) {
      if (receipt.expiresAtMs <= now) {
        this.receipts.delete(cacheKey);
      }
    }
  }
}
