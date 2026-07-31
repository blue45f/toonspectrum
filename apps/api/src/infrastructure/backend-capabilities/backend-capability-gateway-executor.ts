import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";
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
  BACKEND_CAPABILITY_GATEWAY_VERSION,
  BackendCapabilityGatewayResponseSchema,
  canonicalJsonStringify,
  type BackendCapabilityGatewayEnvelope,
  type BackendCapabilityGatewayResponse,
} from "./backend-capability-gateway-contract";

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
    tenantId: command.tenantId,
    capability: command.capability,
    workload: command.workload,
    idempotencyKey: command.idempotencyKey,
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

  async execute(
    envelope: BackendCapabilityGatewayEnvelope,
    providerId: string,
    signal: AbortSignal | undefined = undefined
  ): Promise<BackendCapabilityGatewayResponse> {
    const now = Date.now();
    this.purgeExpired(now);

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
    if (response.outcome === "completed") {
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
        return this.parseGatewayResponse({
          providerId: envelope.provider,
          idempotencyKey: envelope.idempotencyKey,
          outcome: "rejected",
          retryable: false,
          result: null,
          errorCode: "NOT_IMPLEMENTED",
        });
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
      outcome: "rejected",
      retryable: false,
      result: null,
      errorCode: "NOT_IMPLEMENTED",
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
      outcome: "rejected",
      retryable: false,
      result: null,
      errorCode: "NOT_IMPLEMENTED",
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
