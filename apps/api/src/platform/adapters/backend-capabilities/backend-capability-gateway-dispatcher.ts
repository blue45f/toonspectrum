import { Inject, Injectable } from "@nestjs/common";

import {
  BackendCapabilityCoordinationGate,
  type BackendCapabilityCoordinatedAdmission,
  type BackendCapabilityCoordinationDeferredReason,
  type BackendCapabilityDistributedCoordinationSession,
} from "./backend-capability-coordination-gate";
import {
  BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
  BACKEND_CAPABILITY_GATEWAY_PATH,
  BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER,
  BACKEND_CAPABILITY_GATEWAY_VERSION,
  BACKEND_CAPABILITY_IDEMPOTENCY_HEADER,
  BackendCapabilityGatewayCommandSchema,
  BackendCapabilityGatewayEnvelopeSchema,
  BackendCapabilityGatewayResponseSchema,
  canonicalJsonStringify,
  type BackendCapabilityGatewayCommand,
  type BackendCapabilityGatewayEnvelope,
  type BackendCapabilityGatewayResponse,
  type CanonicalJsonValue,
} from "./backend-capability-gateway-contract";
import {
  BACKEND_GATEWAY_HARD_MAX_BODY_BYTES,
  BACKEND_REMOTE_PROVIDER_IDS,
  type BackendCapabilityPolicy,
  type BackendCapabilityRequest,
  type BackendPlacementRole,
  type BackendRemoteProviderId,
} from "./backend-capability-policy";
import {
  BACKEND_CAPABILITY_POLICY,
  BackendCapabilityRouter,
  type BackendCapabilityLeaseOutcome,
} from "./backend-capability-router";

export const BACKEND_CAPABILITY_GATEWAY_RUNTIME = Symbol(
  "BACKEND_CAPABILITY_GATEWAY_RUNTIME"
);

export interface BackendCapabilityGatewayRuntime {
  readonly fetch: (
    input: string | URL | Request,
    init?: RequestInit
  ) => Promise<Response>;
  readonly now: () => number;
  readonly nonce: () => string;
}

export interface BackendCapabilityGatewayDispatchOptions {
  readonly signal?: AbortSignal;
}

export interface BackendCapabilityGatewayAttempt {
  readonly providerId: BackendRemoteProviderId;
  readonly placementRole: BackendPlacementRole;
  readonly selectionReason: "workload-affinity";
  readonly outcome:
    | "completed"
    | "accepted"
    | "duplicate"
    | "provider-failure"
    | "request-rejected";
}

export interface BackendCapabilityGatewayReconciliation {
  readonly state: "required";
  /**
   * The renewal observation that made delivery ownership uncertain. This is retained separately
   * from the public delivery-unknown reason so operators can distinguish a lost lease from an
   * unavailable coordination transport.
   */
  readonly cause: BackendCapabilityCoordinationDeferredReason;
  /**
   * Exact, schema-validated provider evidence when the response won the race with renewal failure.
   * Callers must reconcile it; they must not replay the command from this failure result.
   */
  readonly providerResponse: BackendCapabilityGatewayResponse | null;
  readonly settlementReason?: BackendCapabilityCoordinationDeferredReason;
}

export type BackendCapabilityGatewayDispatchResult =
  | {
      readonly ok: true;
      readonly coordinationMode: "distributed" | "local-process";
      readonly providerId: BackendRemoteProviderId;
      readonly placementRole: BackendPlacementRole;
      readonly selectionReason: "workload-affinity";
      readonly outcome: "completed" | "accepted" | "duplicate";
      readonly result: CanonicalJsonValue | null;
      readonly attempts: readonly BackendCapabilityGatewayAttempt[];
    }
  | {
      readonly ok: false;
      readonly coordinationMode:
        | "distributed"
        | "local-process"
        | "unresolved";
      readonly reason:
        | "invalid-command"
        | "payload-too-large"
        | "unavailable"
        | "providers-exhausted"
        | "request-rejected"
        | "delivery-unknown"
        | "aborted"
        | "coordination-deferred";
      readonly coordinationReason?: BackendCapabilityCoordinationDeferredReason;
      readonly reconciliation?: BackendCapabilityGatewayReconciliation;
      readonly attempts: readonly BackendCapabilityGatewayAttempt[];
    };

class GatewayTransportError extends Error {
  constructor(
    readonly kind:
      | "timeout"
      | "aborted"
      | "network"
      | "response-too-large"
      | "invalid-response"
  ) {
    super(kind);
    this.name = "GatewayTransportError";
  }
}

function isBackendCapabilityGatewayContentType(value: string | null): boolean {
  if (!value) return false;
  const [rawMediaType, ...rawParameters] = value.split(";");
  const expectedMediaType = BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (rawMediaType?.trim().toLowerCase() !== expectedMediaType) return false;

  let version: string | null = null;
  for (const rawParameter of rawParameters) {
    const separator = rawParameter.indexOf("=");
    if (separator <= 0) return false;
    const name = rawParameter.slice(0, separator).trim().toLowerCase();
    let parameterValue = rawParameter.slice(separator + 1).trim();
    if (
      parameterValue.length >= 2
      && parameterValue.startsWith('"')
      && parameterValue.endsWith('"')
    ) {
      parameterValue = parameterValue.slice(1, -1);
    }
    if (!name || !parameterValue) return false;
    if (name !== "version") continue;
    if (version !== null && version !== parameterValue) return false;
    version = parameterValue;
  }
  return version === "1";
}

interface GatewayProviderAttemptResult {
  readonly leaseOutcome: BackendCapabilityLeaseOutcome;
  readonly attemptOutcome: BackendCapabilityGatewayAttempt["outcome"];
  readonly response?: BackendCapabilityGatewayResponse & {
    outcome: "completed" | "accepted" | "duplicate";
  };
  readonly externalAbort?: boolean;
}

interface CoordinatedProviderAttemptResult {
  readonly attempted: GatewayProviderAttemptResult;
  readonly renewalFailure?: BackendCapabilityCoordinationDeferredReason;
}

function gatewayUrl(baseUrl: string): string {
  const origin = new URL(baseUrl).origin;
  return new URL(BACKEND_CAPABILITY_GATEWAY_PATH, `${origin}/`).toString();
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function createEnvelope(
  command: BackendCapabilityGatewayCommand,
  provider: BackendRemoteProviderId,
  createdAt: string,
  nonce: string
): BackendCapabilityGatewayEnvelope {
  return BackendCapabilityGatewayEnvelopeSchema.parse({
    version: BACKEND_CAPABILITY_GATEWAY_VERSION,
    provider,
    tenantId: command.tenantId,
    capability: command.capability,
    workload: command.workload,
    idempotencyKey: command.idempotencyKey,
    idempotent: command.idempotent,
    createdAt,
    nonce,
    requirements: {
      fidelity: "exact",
      allowDegraded: false,
      latency: "tolerant",
    },
    execution: {
      estimatedCostUnits: command.estimatedCostUnits,
      estimatedDurationMs: command.estimatedDurationMs,
      durability: command.durability,
    },
    payload: command.payload,
  });
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Discarding an untrusted response body is best-effort.
  }
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && /^\d+$/u.test(declaredLength)) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length > maxBytes) {
      await cancelResponseBody(response);
      throw new GatewayTransportError("response-too-large");
    }
  }
  if (!response.body) throw new GatewayTransportError("invalid-response");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw new GatewayTransportError("aborted");
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new GatewayTransportError("response-too-large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new GatewayTransportError("invalid-response");
  }
}

function parseGatewayResponse(
  text: string,
  providerId: BackendRemoteProviderId,
  idempotencyKey: string
): BackendCapabilityGatewayResponse {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new GatewayTransportError("invalid-response");
  }
  const parsed = BackendCapabilityGatewayResponseSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.provider !== providerId ||
    parsed.data.idempotencyKey !== idempotencyKey
  ) {
    throw new GatewayTransportError("invalid-response");
  }
  return parsed.data;
}

function requestInit(
  body: string,
  token: string,
  idempotencyKey: string
): RequestInit {
  return {
    method: "POST",
    headers: {
      accept: BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
      "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
      [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: token,
      [BACKEND_CAPABILITY_IDEMPOTENCY_HEADER]: idempotencyKey,
    },
    body,
    redirect: "error",
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  };
}

interface BoundedAbortScope {
  readonly signal: AbortSignal;
  readonly externalAborted: () => boolean;
  readonly dispose: () => void;
}

function createBoundedAbortScope(
  timeoutMs: number,
  externalSignal: AbortSignal | undefined
): BoundedAbortScope {
  if (externalSignal?.aborted) throw new GatewayTransportError("aborted");

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new Error("backend capability gateway timeout"));
  }, timeoutMs);
  timer.unref?.();

  return {
    signal: controller.signal,
    externalAborted: () => externalSignal?.aborted ?? false,
    dispose: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

/**
 * Executes only optional, reconstructable workloads through one versioned HTTPS gateway contract.
 * It never truncates payloads, lowers fidelity, changes a requested workload or routes core
 * authority operations. An incapable provider is skipped or returns a retryable rejection.
 */
@Injectable()
export class BackendCapabilityGatewayDispatcher {
  constructor(
    @Inject(BACKEND_CAPABILITY_POLICY)
    private readonly policy: BackendCapabilityPolicy,
    @Inject(BackendCapabilityRouter)
    private readonly router: BackendCapabilityRouter,
    @Inject(BACKEND_CAPABILITY_GATEWAY_RUNTIME)
    private readonly runtime: BackendCapabilityGatewayRuntime,
    @Inject(BackendCapabilityCoordinationGate)
    private readonly coordinationGate: BackendCapabilityCoordinationGate
  ) {}

  async dispatch(
    commandInput: unknown,
    options: BackendCapabilityGatewayDispatchOptions = {}
  ): Promise<BackendCapabilityGatewayDispatchResult> {
    const parsedCommand =
      BackendCapabilityGatewayCommandSchema.safeParse(commandInput);
    if (!parsedCommand.success) {
      return {
        ok: false,
        coordinationMode: "unresolved",
        reason: "invalid-command",
        attempts: [],
      };
    }
    if (options.signal?.aborted) {
      return {
        ok: false,
        coordinationMode: "unresolved",
        reason: "aborted",
        attempts: [],
      };
    }

    const command = parsedCommand.data;
    const createdAtMs = this.runtime.now();
    const createdAt = new Date(createdAtMs).toISOString();
    const nonce = this.runtime.nonce();
    let maximumEnvelopeBody: string;
    try {
      const longestProviderId = BACKEND_REMOTE_PROVIDER_IDS.reduce(
        (longest, providerId) =>
          providerId.length > longest.length ? providerId : longest
      );
      // Provider is part of the signed body, so size against the longest configured ID.
      maximumEnvelopeBody = canonicalJsonStringify(
        createEnvelope(command, longestProviderId, createdAt, nonce)
      );
    } catch {
      return {
        ok: false,
        coordinationMode: "unresolved",
        reason: "invalid-command",
        attempts: [],
      };
    }
    const payloadBytes = utf8Bytes(maximumEnvelopeBody);
    if (payloadBytes > BACKEND_GATEWAY_HARD_MAX_BODY_BYTES) {
      return {
        ok: false,
        coordinationMode: "unresolved",
        reason: "payload-too-large",
        attempts: [],
      };
    }

    const coordination = this.coordinationGate.begin(command, options);
    if (coordination.mode === "deferred") {
      if (coordination.reason === "aborted") {
        return {
          ok: false,
          coordinationMode: "unresolved",
          reason: "aborted",
          attempts: [],
        };
      }
      return {
        ok: false,
        coordinationMode: "distributed",
        reason: "coordination-deferred",
        coordinationReason: coordination.reason,
        attempts: [],
      };
    }
    const coordinationMode = coordination.mode;
    const coordinationSession =
      coordination.mode === "distributed" ? coordination.session : null;

    const request: BackendCapabilityRequest = {
      capability: command.capability,
      workload: command.workload,
      estimatedCostUnits: command.estimatedCostUnits,
      estimatedDurationMs: command.estimatedDurationMs,
      payloadBytes,
      // Cold starts and queue wait are acceptable; fidelity and correctness are not negotiable.
      coldStartTolerant: true,
      durability: command.durability,
    };
    const excluded = new Set<BackendRemoteProviderId>();
    const attempts: BackendCapabilityGatewayAttempt[] = [];
    const maxAttempts = command.idempotent
      ? this.policy.gatewayMaxAttempts
      : 1;

    while (attempts.length < maxAttempts) {
      if (options.signal?.aborted) {
        await coordinationSession?.finalizeWithoutActiveProvider("cancelled");
        return {
          ok: false,
          coordinationMode,
          reason: "aborted",
          attempts,
        };
      }
      const lease = this.router.acquire(request, this.runtime.now(), excluded);
      if (!lease || lease.providerId === "local") {
        lease?.release("cancelled", this.runtime.now());
        if (coordinationSession) {
          const finalized =
            await coordinationSession.finalizeWithoutActiveProvider(
              "providers-exhausted"
            );
          if (!finalized.settled) {
            return {
              ok: false,
              coordinationMode,
              reason: "coordination-deferred",
              coordinationReason: finalized.reason,
              attempts,
            };
          }
        }
        return {
          ok: false,
          coordinationMode,
          reason: attempts.length > 0 ? "providers-exhausted" : "unavailable",
          attempts,
        };
      }

      const providerId = lease.providerId;
      excluded.add(providerId);
      const provider = this.policy.providers[providerId];
      const body = canonicalJsonStringify(
        createEnvelope(command, providerId, createdAt, nonce)
      );
      if (
        utf8Bytes(body) > provider.maxPayloadBytes ||
        utf8Bytes(body) > BACKEND_GATEWAY_HARD_MAX_BODY_BYTES
      ) {
        // No request was sent, and payloads are never truncated. Try a larger exact executor.
        lease.release("request-rejected", this.runtime.now());
        attempts.push({
          providerId,
          placementRole: lease.placementRole,
          selectionReason: lease.selectionReason,
          outcome: "request-rejected",
        });
        continue;
      }

      let coordinatedAdmission: BackendCapabilityCoordinatedAdmission | null =
        null;
      if (coordinationSession) {
        const admission = await coordinationSession.admitProvider(
          providerId,
          options
        );
        if (!admission.admitted) {
          lease.release("coordination-deferred", this.runtime.now());
          await coordinationSession.finalizeWithoutActiveProvider(
            admission.reason === "aborted"
              ? "cancelled"
              : "providers-exhausted"
          );
          if (admission.reason === "aborted") {
            return {
              ok: false,
              coordinationMode,
              reason: "aborted",
              attempts,
            };
          }
          return {
            ok: false,
            coordinationMode,
            reason: "coordination-deferred",
            coordinationReason: admission.reason,
            attempts,
          };
        }
        coordinatedAdmission = admission.admission;
      }

      const coordinatedAttempt =
        coordinationSession && coordinatedAdmission
          ? await this.attemptProviderWithCoordination(
              coordinationSession,
              coordinatedAdmission,
              providerId,
              command,
              body,
              options.signal
            )
          : {
              attempted: await this.attemptProvider(
                providerId,
                command,
                body,
                options.signal
              ),
            };
      const { attempted } = coordinatedAttempt;
      lease.release(attempted.leaseOutcome, this.runtime.now());
      attempts.push({
        providerId,
        placementRole: lease.placementRole,
        selectionReason: lease.selectionReason,
        outcome: attempted.attemptOutcome,
      });

      if (coordinatedAttempt.renewalFailure) {
        const settled = await coordinationSession?.settleProviderAttempt({
          kind: "delivery-unknown",
          response: attempted.response ?? null,
        });
        return {
          ok: false,
          coordinationMode,
          reason: "delivery-unknown",
          coordinationReason: "reconciliation-required",
          reconciliation: {
            state: "required",
            cause: coordinatedAttempt.renewalFailure,
            providerResponse: attempted.response ?? null,
            ...(
              settled && !settled.settled
                ? { settlementReason: settled.reason }
                : {}
            ),
          },
          attempts,
        };
      }
      if (attempted.response) {
        if (coordinationSession) {
          const settled = await coordinationSession.settleProviderAttempt({
            kind: attempted.response.outcome,
            response: attempted.response,
          });
          if (!settled.settled) {
            return {
              ok: false,
              coordinationMode,
              reason: "coordination-deferred",
              coordinationReason: settled.reason,
              attempts,
            };
          }
        }
        return {
          ok: true,
          coordinationMode,
          providerId,
          placementRole: lease.placementRole,
          selectionReason: lease.selectionReason,
          outcome: attempted.response.outcome,
          result: attempted.response.result,
          attempts,
        };
      }
      if (attempted.externalAbort) {
        await coordinationSession?.settleProviderAttempt({
          kind: "cancelled",
        });
        return {
          ok: false,
          coordinationMode,
          reason: "aborted",
          attempts,
        };
      }
      if (attempted.leaseOutcome === "request-rejected") {
        if (coordinationSession) {
          const settled = await coordinationSession.settleProviderAttempt({
            kind: "request-rejected",
          });
          if (!settled.settled) {
            return {
              ok: false,
              coordinationMode,
              reason: "coordination-deferred",
              coordinationReason: settled.reason,
              attempts,
            };
          }
        }
        return {
          ok: false,
          coordinationMode,
          reason: "request-rejected",
          attempts,
        };
      }
      const terminalFailure =
        !command.idempotent || attempts.length >= maxAttempts;
      if (coordinationSession) {
        const settled = await coordinationSession.settleProviderAttempt({
          kind: "provider-failure",
          terminal: terminalFailure,
        });
        if (!settled.settled) {
          return {
            ok: false,
            coordinationMode,
            reason: "coordination-deferred",
            coordinationReason: settled.reason,
            attempts,
          };
        }
      }
      if (!command.idempotent) {
        return {
          ok: false,
          coordinationMode,
          reason: "delivery-unknown",
          attempts,
        };
      }
      if (terminalFailure) {
        return {
          ok: false,
          coordinationMode,
          reason: "providers-exhausted",
          attempts,
        };
      }
    }

    if (coordinationSession) {
      const finalized =
        await coordinationSession.finalizeWithoutActiveProvider(
          "providers-exhausted"
        );
      if (!finalized.settled) {
        return {
          ok: false,
          coordinationMode,
          reason: "coordination-deferred",
          coordinationReason: finalized.reason,
          attempts,
        };
      }
    }
    return {
      ok: false,
      coordinationMode,
      reason: "providers-exhausted",
      attempts,
    };
  }

  private async attemptProviderWithCoordination(
    session: BackendCapabilityDistributedCoordinationSession,
    admission: BackendCapabilityCoordinatedAdmission,
    providerId: BackendRemoteProviderId,
    command: BackendCapabilityGatewayCommand,
    body: string,
    callerSignal: AbortSignal | undefined
  ): Promise<CoordinatedProviderAttemptResult> {
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort(callerSignal?.reason);
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
    if (callerSignal?.aborted) onCallerAbort();

    const renewalIntervalMs = Math.max(
      1_000,
      Math.floor(admission.leaseTtlMs / 2)
    );
    let stopped = false;
    let renewalFailure:
      | BackendCapabilityCoordinationDeferredReason
      | undefined;
    let renewalTimer: ReturnType<typeof setTimeout> | undefined;
    let renewalInFlight: Promise<void> | null = null;

    const scheduleRenewal = () => {
      renewalTimer = setTimeout(() => {
        renewalInFlight = (async () => {
          const renewed = await session.renewProviderLease();
          if (!renewed.renewed) {
            renewalFailure = renewed.reason;
            controller.abort(
              new Error("backend capability coordination lease renewal failed")
            );
            return;
          }
          if (!stopped) scheduleRenewal();
        })();
      }, renewalIntervalMs);
      renewalTimer.unref?.();
    };
    scheduleRenewal();

    let attempted: GatewayProviderAttemptResult;
    try {
      attempted = await this.attemptProvider(
        providerId,
        command,
        body,
        controller.signal
      );
    } finally {
      stopped = true;
      if (renewalTimer) clearTimeout(renewalTimer);
      await renewalInFlight;
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
    return {
      attempted,
      ...(renewalFailure ? { renewalFailure } : {}),
    };
  }

  private async attemptProvider(
    providerId: BackendRemoteProviderId,
    command: BackendCapabilityGatewayCommand,
    body: string,
    externalSignal: AbortSignal | undefined
  ): Promise<GatewayProviderAttemptResult> {
    const provider = this.policy.providers[providerId];
    let abortScope: BoundedAbortScope | undefined;
    try {
      abortScope = createBoundedAbortScope(
        provider.maxExecutionMs,
        externalSignal
      );
      const response = await this.runtime.fetch(
        gatewayUrl(provider.baseUrl ?? ""),
        {
          ...requestInit(
            body,
            provider.authToken ?? "",
            command.idempotencyKey
          ),
          signal: abortScope.signal,
        }
      );

      if (!response.ok) {
        await cancelResponseBody(response);
        const providerFailure = isRetryableHttpStatus(response.status);
        return {
          leaseOutcome: providerFailure
            ? "provider-failure"
            : "request-rejected",
          attemptOutcome: providerFailure
            ? "provider-failure"
            : "request-rejected",
        };
      }
      const contentType = response.headers.get("content-type");
      if (!isBackendCapabilityGatewayContentType(contentType)) {
        await cancelResponseBody(response);
        throw new GatewayTransportError("invalid-response");
      }
      const responseText = await readBoundedResponse(
        response,
        provider.maxResponseBytes,
        abortScope.signal
      );
      const gatewayResponse = parseGatewayResponse(
        responseText,
        providerId,
        command.idempotencyKey
      );
      if (gatewayResponse.outcome === "rejected") {
        const providerFailure = gatewayResponse.retryable;
        return {
          leaseOutcome: providerFailure
            ? "provider-failure"
            : "request-rejected",
          attemptOutcome: providerFailure
            ? "provider-failure"
            : "request-rejected",
        };
      }
      return {
        leaseOutcome: "success",
        attemptOutcome: gatewayResponse.outcome,
        response: gatewayResponse as BackendCapabilityGatewayResponse & {
          outcome: "completed" | "accepted" | "duplicate";
        },
      };
    } catch (error) {
      const externalAbort =
        abortScope?.externalAborted() ??
        (error instanceof GatewayTransportError && error.kind === "aborted");
      return {
        leaseOutcome: externalAbort ? "cancelled" : "provider-failure",
        attemptOutcome: "provider-failure",
        ...(externalAbort ? { externalAbort: true } : {}),
      };
    } finally {
      abortScope?.dispose();
    }
  }
}
