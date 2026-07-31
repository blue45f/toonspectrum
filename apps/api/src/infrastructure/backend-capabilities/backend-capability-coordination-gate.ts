import { createHash, randomUUID } from "node:crypto";

import { Inject, Injectable, Optional } from "@nestjs/common";

import { UPSTASH_COORDINATION_PORT } from "../upstash-coordination/upstash-coordination.port";

import {
  BackendCapabilityGatewayCommandSchema,
  BackendCapabilityGatewayResponseSchema,
  canonicalJsonStringify,
  type BackendCapabilityGatewayCommand,
  type BackendCapabilityGatewayResponse,
} from "./backend-capability-gateway-contract";
import {
  type BackendCapabilityPolicy,
  type BackendRemoteProviderId,
} from "./backend-capability-policy";
import { BACKEND_CAPABILITY_POLICY } from "./backend-capability-router";

import type { UpstashCoordinationPort } from "../upstash-coordination/upstash-coordination.port";

export const BACKEND_CAPABILITY_COORDINATION_RUNTIME = Symbol(
  "BACKEND_CAPABILITY_COORDINATION_RUNTIME"
);

const RECEIPT_RETENTION_MS = 24 * 60 * 60 * 1_000;
const MAX_LEASE_MS = 15 * 60 * 1_000;
const MIN_LEASE_MS = 30 * 1_000;
const LEASE_GRACE_MS = 30 * 1_000;
const BUDGET_EXPIRY_GRACE_MS = 60 * 60 * 1_000;

export interface BackendCapabilityCoordinationRuntime {
  readonly now: () => number;
  readonly nonce: () => string;
}

export type BackendCapabilityCoordinationDeferredReason =
  | "aborted"
  | "attempt-active"
  | "circuit-open"
  | "coordination-unavailable"
  | "distribution-disabled"
  | "idempotency-completed"
  | "idempotency-pending"
  | "invalid-command"
  | "invalid-provider-response"
  | "lease-lost"
  | "provider-budget-exhausted"
  | "provider-disabled"
  | "provider-slots-exhausted"
  | "reconciliation-required"
  | "receipt-conflict"
  | "session-closed";

export interface BackendCapabilityCoordinatedAdmission {
  readonly mode: "distributed";
  readonly providerId: BackendRemoteProviderId;
  readonly slot: number;
  readonly leaseTtlMs: number;
  readonly budgetDuplicate: boolean;
}

export type BackendCapabilityCoordinationAdmissionResult =
  | {
      readonly admitted: true;
      readonly admission: BackendCapabilityCoordinatedAdmission;
    }
  | {
      readonly admitted: false;
      readonly mode: "distributed";
      readonly reason: BackendCapabilityCoordinationDeferredReason;
    };

export type BackendCapabilityCoordinationRenewResult =
  | {
      readonly renewed: true;
      readonly remainingTtlMs: number;
    }
  | {
      readonly renewed: false;
      readonly reason: BackendCapabilityCoordinationDeferredReason;
    };

export type BackendCapabilityCoordinatedAttemptOutcome =
  | {
      readonly kind: "accepted" | "completed" | "duplicate";
      readonly response: BackendCapabilityGatewayResponse;
    }
  | {
      readonly kind: "provider-failure";
      /**
       * False keeps this command's receipt ownership for an exact same-session provider failover.
       * True closes the receipt so a later process cannot replay an ambiguously delivered command.
       */
      readonly terminal: boolean;
    }
  | {
      readonly kind: "request-rejected";
    }
  | {
      readonly kind: "cancelled";
    }
  | {
      /**
       * The provider delivery may have completed after lease ownership became uncertain. When an
       * exact response was observed it is retained here so the receipt fingerprints that response,
       * never a synthetic cancellation. A null response still closes the receipt fail-closed.
       */
      readonly kind: "delivery-unknown";
      readonly response: BackendCapabilityGatewayResponse | null;
    };

export type BackendCapabilityCoordinationSettlementResult =
  | {
      readonly settled: true;
      readonly terminal: boolean;
      readonly receipt: "completed" | "retained" | "not-reserved";
    }
  | {
      readonly settled: false;
      readonly terminal: true;
      readonly reason: BackendCapabilityCoordinationDeferredReason;
    };

export interface BackendCapabilityDistributedCoordinationSession {
  admitProvider(
    providerId: BackendRemoteProviderId,
    options?: Readonly<{ signal?: AbortSignal }>
  ): Promise<BackendCapabilityCoordinationAdmissionResult>;
  renewProviderLease(
    options?: Readonly<{ signal?: AbortSignal }>
  ): Promise<BackendCapabilityCoordinationRenewResult>;
  settleProviderAttempt(
    outcome: BackendCapabilityCoordinatedAttemptOutcome,
    options?: Readonly<{ signal?: AbortSignal }>
  ): Promise<BackendCapabilityCoordinationSettlementResult>;
  finalizeWithoutActiveProvider(
    outcome: "cancelled" | "providers-exhausted",
    options?: Readonly<{ signal?: AbortSignal }>
  ): Promise<BackendCapabilityCoordinationSettlementResult>;
}

export type BackendCapabilityCoordinationBeginResult =
  | {
      readonly mode: "local-process";
      readonly reason: "distribution-disabled";
    }
  | {
      readonly mode: "distributed";
      readonly session: BackendCapabilityDistributedCoordinationSession;
    }
  | {
      readonly mode: "deferred";
      readonly reason: BackendCapabilityCoordinationDeferredReason;
    };

interface ActiveProviderAttempt {
  readonly providerId: BackendRemoteProviderId;
  readonly slot: number;
  readonly resourceId: string;
  readonly leaseToken: string;
  readonly ttlMs: number;
}

function defaultRuntime(): BackendCapabilityCoordinationRuntime {
  return {
    now: Date.now,
    nonce: randomUUID,
  };
}

function leaseTtlMs(maxExecutionMs: number): number {
  return Math.min(
    MAX_LEASE_MS,
    Math.max(MIN_LEASE_MS, maxExecutionMs + LEASE_GRACE_MS)
  );
}

function circuitTtlMs(cooldownMs: number): number {
  return Math.min(
    7 * 24 * 60 * 60 * 1_000,
    Math.max(60 * 60 * 1_000, cooldownMs * 2)
  );
}

function slotStart(
  command: BackendCapabilityGatewayCommand,
  providerId: BackendRemoteProviderId,
  maximumSlots: number
): number {
  const digest = createHash("sha256")
    .update(
      canonicalJsonStringify([
        "toonspectrum.backend-capability-slot.v1",
        providerId,
        command.workload,
        command.idempotencyKey,
      ]),
      "utf8"
    )
    .digest();
  return digest.readUInt32BE(0) % maximumSlots;
}

function outcomeFingerprint(
  providerId: BackendRemoteProviderId | null,
  command: BackendCapabilityGatewayCommand,
  outcome:
    | BackendCapabilityGatewayResponse
    | Readonly<{
        kind:
          | "cancelled"
          | "delivery-unknown"
          | "provider-failure"
          | "providers-exhausted"
          | "request-rejected";
      }>
): `sha256:${string}` {
  const canonical = canonicalJsonStringify({
    domain: "toonspectrum.backend-capability-coordination-outcome.v1",
    providerId,
    idempotencyKey: command.idempotencyKey,
    workload: command.workload,
    outcome,
  });
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function requestFingerprint(
  command: BackendCapabilityGatewayCommand
): `sha256:${string}` {
  const canonical = canonicalJsonStringify({
    domain: "toonspectrum.backend-capability-coordination-request.v1",
    tenantId: command.tenantId,
    workload: command.workload,
    command: {
      capability: command.capability,
      estimatedCostUnits: command.estimatedCostUnits,
      estimatedDurationMs: command.estimatedDurationMs,
      durability: command.durability,
      idempotencyKey: command.idempotencyKey,
      idempotent: command.idempotent,
    },
    payload: command.payload,
  });
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}

class DistributedCoordinationSession
  implements BackendCapabilityDistributedCoordinationSession
{
  private activeAttempt: ActiveProviderAttempt | null = null;
  private receiptOwned = false;
  private closed = false;
  private leaseUncertainty: BackendCapabilityCoordinationDeferredReason | null =
    null;
  private readonly immutableRequestFingerprint: `sha256:${string}`;

  constructor(
    private readonly policy: BackendCapabilityPolicy,
    private readonly coordination: UpstashCoordinationPort,
    private readonly runtime: BackendCapabilityCoordinationRuntime,
    private readonly command: BackendCapabilityGatewayCommand,
    private readonly claimToken: string
  ) {
    this.immutableRequestFingerprint = requestFingerprint(command);
  }

  async admitProvider(
    providerId: BackendRemoteProviderId,
    options: Readonly<{ signal?: AbortSignal }> = {}
  ): Promise<BackendCapabilityCoordinationAdmissionResult> {
    if (this.closed) return this.deferred("session-closed");
    if (this.activeAttempt) return this.deferred("attempt-active");
    if (isAborted(options.signal)) return this.deferred("aborted");

    const provider = this.policy.providers[providerId];
    if (!provider.enabled) return this.deferred("provider-disabled");

    try {
      const circuit = await this.coordination.readProviderCircuit(
        { providerId },
        options
      );
      if (circuit.state === "open") return this.deferred("circuit-open");
    } catch {
      return this.deferred("coordination-unavailable");
    }

    const ttlMs = leaseTtlMs(provider.maxExecutionMs);
    const leaseToken = this.runtime.nonce();
    const startingSlot = slotStart(
      this.command,
      providerId,
      provider.maxConcurrency
    );
    let acquired: ActiveProviderAttempt | null = null;
    try {
      for (let offset = 0; offset < provider.maxConcurrency; offset += 1) {
        const slot = (startingSlot + offset) % provider.maxConcurrency;
        const resourceId = `provider:${providerId}:slot:${slot}`;
        const lease = await this.coordination.acquireLease(
          {
            scope: "provider-dispatch",
            resourceId,
            leaseToken,
            ttlMs,
          },
          options
        );
        if (lease.acquired) {
          acquired = {
            providerId,
            slot,
            resourceId,
            leaseToken,
            ttlMs,
          };
          break;
        }
      }
    } catch {
      return this.deferred("coordination-unavailable");
    }
    if (!acquired) return this.deferred("provider-slots-exhausted");

    let budget;
    try {
      budget = await this.coordination.consumeProviderBudget(
        {
          providerId,
          operationId:
            `${this.command.workload}:${providerId}:${this.command.idempotencyKey}`,
          requestUnits: 1,
          costUnits: this.command.estimatedCostUnits,
          maximumRequestUnits: provider.dailyRequestBudget,
          maximumCostUnits: provider.dailyCostBudget,
          expiryGraceMs: BUDGET_EXPIRY_GRACE_MS,
        },
        options
      );
    } catch {
      await this.releaseAfterAdmissionFailure(acquired);
      return this.deferred("coordination-unavailable");
    }
    if (!budget.accepted) {
      const released = await this.releaseAfterAdmissionFailure(acquired);
      return this.deferred(
        released ? "provider-budget-exhausted" : "coordination-unavailable"
      );
    }

    if (!this.receiptOwned) {
      let receipt;
      try {
        receipt = await this.coordination.reserveIdempotencyReceipt(
          {
            scope: "provider-dispatch",
            operation: "backend-capability.dispatch",
            idempotencyKey: this.command.idempotencyKey,
            requestFingerprint: this.immutableRequestFingerprint,
            claimToken: this.claimToken,
            ttlMs: RECEIPT_RETENTION_MS,
          },
          options
        );
      } catch {
        await this.releaseAfterAdmissionFailure(acquired);
        return this.deferred("coordination-unavailable");
      }
      if (!receipt.reserved) {
        const released = await this.releaseAfterAdmissionFailure(acquired);
        if (!released) return this.deferred("coordination-unavailable");
        return this.deferred(
          receipt.state === "request-conflict"
            ? "receipt-conflict"
            : receipt.state === "completed"
              ? "idempotency-completed"
              : "idempotency-pending"
        );
      }
      this.receiptOwned = true;
    }

    this.activeAttempt = acquired;
    return {
      admitted: true,
      admission: {
        mode: "distributed",
        providerId,
        slot: acquired.slot,
        leaseTtlMs: acquired.ttlMs,
        budgetDuplicate: budget.duplicate,
      },
    };
  }

  async renewProviderLease(
    options: Readonly<{ signal?: AbortSignal }> = {}
  ): Promise<BackendCapabilityCoordinationRenewResult> {
    if (this.closed) return { renewed: false, reason: "session-closed" };
    const attempt = this.activeAttempt;
    if (!attempt) return { renewed: false, reason: "lease-lost" };
    if (isAborted(options.signal)) return { renewed: false, reason: "aborted" };

    try {
      const renewed = await this.coordination.renewLease(
        {
          scope: "provider-dispatch",
          resourceId: attempt.resourceId,
          leaseToken: attempt.leaseToken,
          ttlMs: attempt.ttlMs,
        },
        options
      );
      if (!renewed.matched || renewed.remainingTtlMs === null) {
        this.leaseUncertainty = "lease-lost";
        return { renewed: false, reason: "lease-lost" };
      }
      return {
        renewed: true,
        remainingTtlMs: renewed.remainingTtlMs,
      };
    } catch {
      this.leaseUncertainty = "coordination-unavailable";
      return { renewed: false, reason: "coordination-unavailable" };
    }
  }

  async settleProviderAttempt(
    outcome: BackendCapabilityCoordinatedAttemptOutcome,
    _options: Readonly<{ signal?: AbortSignal }> = {}
  ): Promise<BackendCapabilityCoordinationSettlementResult> {
    if (this.closed) return this.settlementDeferred("session-closed");
    const attempt = this.activeAttempt;
    if (!attempt) return this.settlementDeferred("lease-lost");

    let validated = this.validateOutcome(outcome, attempt.providerId);
    if (!validated) {
      const cleanup = await this.cleanupAttempt(
        attempt,
        {
          circuit: "failure",
          receiptFingerprint: null,
          retainReceipt: true,
        },
        {}
      );
      this.activeAttempt = null;
      this.closed = true;
      return this.settlementDeferred(
        cleanup === null
          ? "invalid-provider-response"
          : cleanup
      );
    }

    /*
     * Once renewal becomes uncertain, no later provider observation may be rewritten as a
     * cancellation. Convert defensively even if a caller has not yet adopted the explicit
     * delivery-unknown outcome. Exact responses retain their exact response fingerprint.
     */
    if (this.leaseUncertainty && validated.kind !== "delivery-unknown") {
      validated = {
        kind: "delivery-unknown",
        response:
          validated.kind === "accepted" ||
          validated.kind === "completed" ||
          validated.kind === "duplicate"
            ? validated.response
            : null,
      };
    }

    const terminal =
      validated.kind !== "provider-failure" || validated.terminal;
    const circuit =
      validated.kind === "provider-failure"
        ? "failure" as const
        : validated.kind === "delivery-unknown"
          ? validated.response
            ? "success" as const
            : "none" as const
        : validated.kind === "accepted" ||
            validated.kind === "completed" ||
            validated.kind === "duplicate"
          ? "success" as const
          : "none" as const;
    const receiptFingerprint =
      validated.kind === "accepted" ||
      validated.kind === "completed" ||
      validated.kind === "duplicate"
        ? outcomeFingerprint(attempt.providerId, this.command, validated.response)
        : validated.kind === "delivery-unknown"
          ? validated.response
            ? outcomeFingerprint(
                attempt.providerId,
                this.command,
                validated.response
              )
            : outcomeFingerprint(attempt.providerId, this.command, {
                kind: "delivery-unknown",
              })
        : validated.kind === "request-rejected" ||
            validated.kind === "cancelled" ||
            (validated.kind === "provider-failure" && validated.terminal)
          ? outcomeFingerprint(attempt.providerId, this.command, {
              kind: validated.kind,
            })
          : null;
    const retainReceipt =
      validated.kind === "provider-failure" && !validated.terminal;

    const cleanup = await this.cleanupAttempt(
      attempt,
      { circuit, receiptFingerprint, retainReceipt },
      {}
    );
    this.activeAttempt = null;
    this.leaseUncertainty = null;
    this.closed = terminal || cleanup !== null;
    if (cleanup) return this.settlementDeferred(cleanup);

    return {
      settled: true,
      terminal,
      receipt: receiptFingerprint
        ? "completed"
        : retainReceipt && this.receiptOwned
          ? "retained"
          : "not-reserved",
    };
  }

  async finalizeWithoutActiveProvider(
    outcome: "cancelled" | "providers-exhausted",
    _options: Readonly<{ signal?: AbortSignal }> = {}
  ): Promise<BackendCapabilityCoordinationSettlementResult> {
    if (this.closed) return this.settlementDeferred("session-closed");
    if (this.activeAttempt) return this.settlementDeferred("attempt-active");
    this.closed = true;
    if (!this.receiptOwned) {
      return {
        settled: true,
        terminal: true,
        receipt: "not-reserved",
      };
    }

    try {
      const completed = await this.coordination.completeIdempotencyReceipt({
        scope: "provider-dispatch",
        operation: "backend-capability.dispatch",
        idempotencyKey: this.command.idempotencyKey,
        requestFingerprint: this.immutableRequestFingerprint,
        claimToken: this.claimToken,
        ttlMs: RECEIPT_RETENTION_MS,
        outcomeFingerprint: outcomeFingerprint(null, this.command, {
          kind: outcome,
        }),
      });
      if (
        completed.outcome !== "completed" &&
        completed.outcome !== "duplicate"
      ) {
        return this.settlementDeferred("receipt-conflict");
      }
      this.receiptOwned = false;
      return {
        settled: true,
        terminal: true,
        receipt: "completed",
      };
    } catch {
      return this.settlementDeferred("coordination-unavailable");
    }
  }

  private validateOutcome(
    outcome: BackendCapabilityCoordinatedAttemptOutcome,
    providerId: BackendRemoteProviderId
  ): BackendCapabilityCoordinatedAttemptOutcome | null {
    if (
      !outcome ||
      typeof outcome !== "object" ||
      !("kind" in outcome)
    ) {
      return null;
    }
    if (
      outcome.kind === "accepted" ||
      outcome.kind === "completed" ||
      outcome.kind === "duplicate"
    ) {
      const response = BackendCapabilityGatewayResponseSchema.safeParse(
        outcome.response
      );
      if (
        !response.success ||
        response.data.provider !== providerId ||
        response.data.idempotencyKey !== this.command.idempotencyKey ||
        response.data.outcome !== outcome.kind
      ) {
        return null;
      }
      return { kind: outcome.kind, response: response.data };
    }
    if (outcome.kind === "provider-failure") {
      return typeof outcome.terminal === "boolean" ? outcome : null;
    }
    if (outcome.kind === "delivery-unknown") {
      if (outcome.response === null) return outcome;
      const response = BackendCapabilityGatewayResponseSchema.safeParse(
        outcome.response
      );
      if (
        !response.success ||
        response.data.provider !== providerId ||
        response.data.idempotencyKey !== this.command.idempotencyKey ||
        response.data.outcome === "rejected"
      ) {
        return null;
      }
      return { kind: "delivery-unknown", response: response.data };
    }
    return outcome.kind === "request-rejected" || outcome.kind === "cancelled"
      ? outcome
      : null;
  }

  private async cleanupAttempt(
    attempt: ActiveProviderAttempt,
    cleanup: Readonly<{
      circuit: "failure" | "none" | "success";
      receiptFingerprint: `sha256:${string}` | null;
      retainReceipt: boolean;
    }>,
    options: Readonly<{ signal?: AbortSignal }>
  ): Promise<BackendCapabilityCoordinationDeferredReason | null> {
    const circuitPromise = cleanup.circuit === "failure"
      ? this.coordination.recordProviderFailure(
          {
            providerId: attempt.providerId,
            failureThreshold: this.policy.circuitFailureThreshold,
            cooldownMs: this.policy.circuitCooldownMs,
            stateTtlMs: circuitTtlMs(this.policy.circuitCooldownMs),
          },
          options
        )
      : cleanup.circuit === "success"
        ? this.coordination.closeProviderCircuit(
            { providerId: attempt.providerId },
            options
          )
        : Promise.resolve(null);
    const receiptPromise =
      cleanup.receiptFingerprint && this.receiptOwned
        ? this.coordination.completeIdempotencyReceipt(
            {
              scope: "provider-dispatch",
              operation: "backend-capability.dispatch",
              idempotencyKey: this.command.idempotencyKey,
              requestFingerprint: this.immutableRequestFingerprint,
              claimToken: this.claimToken,
              ttlMs: RECEIPT_RETENTION_MS,
              outcomeFingerprint: cleanup.receiptFingerprint,
            },
            options
          )
        : Promise.resolve(null);
    const releasePromise = this.coordination.releaseLease(
      {
        scope: "provider-dispatch",
        resourceId: attempt.resourceId,
        leaseToken: attempt.leaseToken,
        ttlMs: attempt.ttlMs,
      },
      options
    );

    const [circuit, receipt, release] = await Promise.allSettled([
      circuitPromise,
      receiptPromise,
      releasePromise,
    ]);
    if (receipt.status === "rejected") return "coordination-unavailable";
    if (
      receipt.value &&
      receipt.value.outcome !== "completed" &&
      receipt.value.outcome !== "duplicate"
    ) {
      return "receipt-conflict";
    }
    if (!cleanup.retainReceipt && cleanup.receiptFingerprint) {
      this.receiptOwned = false;
    }
    if (circuit.status === "rejected") return "coordination-unavailable";
    if (
      cleanup.circuit === "success" &&
      circuit.value &&
      circuit.value.state !== "closed"
    ) {
      return "coordination-unavailable";
    }
    if (release.status === "rejected") return "coordination-unavailable";
    if (!release.value.matched) return "lease-lost";
    return null;
  }

  private async releaseAfterAdmissionFailure(
    attempt: ActiveProviderAttempt
  ): Promise<boolean> {
    try {
      const released = await this.coordination.releaseLease(
        {
          scope: "provider-dispatch",
          resourceId: attempt.resourceId,
          leaseToken: attempt.leaseToken,
          ttlMs: attempt.ttlMs,
        },
        {}
      );
      return released.matched;
    } catch {
      return false;
    }
  }

  private deferred(
    reason: BackendCapabilityCoordinationDeferredReason
  ): BackendCapabilityCoordinationAdmissionResult {
    return { admitted: false, mode: "distributed", reason };
  }

  private settlementDeferred(
    reason: BackendCapabilityCoordinationDeferredReason
  ): BackendCapabilityCoordinationSettlementResult {
    return { settled: false, terminal: true, reason };
  }
}

/**
 * Cross-host coordination is a distinct dispatch gate, not a replacement data authority and not a
 * generic provider fallback. The caller still selects a purpose-specific provider through the
 * existing policy/router, then asks the returned session to admit exactly that provider.
 */
@Injectable()
export class BackendCapabilityCoordinationGate {
  private readonly coordination: UpstashCoordinationPort | null;
  private readonly runtime: BackendCapabilityCoordinationRuntime;

  constructor(
    @Inject(BACKEND_CAPABILITY_POLICY)
    private readonly policy: BackendCapabilityPolicy,
    @Optional()
    @Inject(UPSTASH_COORDINATION_PORT)
    coordination?: UpstashCoordinationPort | null,
    @Optional()
    @Inject(BACKEND_CAPABILITY_COORDINATION_RUNTIME)
    runtime?: BackendCapabilityCoordinationRuntime
  ) {
    this.coordination = coordination ?? null;
    this.runtime = runtime ?? defaultRuntime();
  }

  begin(
    commandInput: unknown,
    options: Readonly<{ signal?: AbortSignal }> = {}
  ): BackendCapabilityCoordinationBeginResult {
    const command = BackendCapabilityGatewayCommandSchema.safeParse(
      commandInput
    );
    if (!command.success) {
      return { mode: "deferred", reason: "invalid-command" };
    }
    if (isAborted(options.signal)) {
      return { mode: "deferred", reason: "aborted" };
    }
    if (!this.policy.enabled) {
      return {
        mode: "local-process",
        reason: "distribution-disabled",
      };
    }
    if (!this.coordination) {
      return { mode: "deferred", reason: "coordination-unavailable" };
    }

    return {
      mode: "distributed",
      session: new DistributedCoordinationSession(
        this.policy,
        this.coordination,
        this.runtime,
        command.data,
        this.runtime.nonce()
      ),
    };
  }
}
