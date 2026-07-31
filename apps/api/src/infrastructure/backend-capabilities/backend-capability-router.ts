import { Inject, Injectable } from "@nestjs/common";

import {
  backendCapabilityWorkloadPlacementRole,
  type BackendCapabilityId,
  type BackendCapabilityPolicy,
  type BackendCapabilityProviderId,
  type BackendCapabilityRequest,
  BackendCapabilityRequestSchema,
  type BackendPlacementRole,
  type BackendRemoteProviderId,
} from "./backend-capability-policy";

export const BACKEND_CAPABILITY_POLICY = Symbol("BACKEND_CAPABILITY_POLICY");

export type BackendProviderRejectionReason =
  | "disabled"
  | "excluded"
  | "unsupported"
  | "placement-role"
  | "duration"
  | "payload"
  | "circuit-open"
  | "request-budget"
  | "cost-budget"
  | "concurrency"
  | "durability";

export interface BackendProviderRuntimeState {
  readonly day: string;
  readonly requests: number;
  readonly costUnits: number;
  readonly inFlight: number;
  readonly consecutiveFailures: number;
  readonly circuitOpenUntil: number;
}

export interface BackendProviderEvaluation {
  readonly providerId: BackendCapabilityProviderId;
  readonly accepted: boolean;
  readonly reason?: BackendProviderRejectionReason;
}

export type BackendCapabilitySelection =
  | {
      readonly available: true;
      readonly providerId: BackendCapabilityProviderId;
      readonly placementRole: BackendPlacementRole;
      readonly selectionReason: "workload-affinity";
      readonly evaluations: readonly BackendProviderEvaluation[];
    }
  | {
      readonly available: false;
      readonly evaluations: readonly BackendProviderEvaluation[];
    };

export type BackendCapabilityLeaseOutcome =
  | "success"
  | "provider-failure"
  | "request-rejected"
  | "cancelled"
  | "coordination-deferred";

export interface BackendCapabilityLease {
  readonly providerId: BackendCapabilityProviderId;
  readonly placementRole: BackendPlacementRole;
  readonly selectionReason: "workload-affinity";
  readonly request: BackendCapabilityRequest;
  release(outcome: BackendCapabilityLeaseOutcome, now?: number): void;
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function emptyRuntimeState(now: number): BackendProviderRuntimeState {
  return {
    day: utcDay(now),
    requests: 0,
    costUnits: 0,
    inFlight: 0,
    consecutiveFailures: 0,
    circuitOpenUntil: 0,
  };
}

function normalizedRuntimeState(
  state: BackendProviderRuntimeState | undefined,
  now: number
): BackendProviderRuntimeState {
  if (!state) return emptyRuntimeState(now);
  if (state.day === utcDay(now)) return state;
  return {
    ...state,
    day: utcDay(now),
    requests: 0,
    costUnits: 0,
  };
}

function evaluateRemoteProvider(
  policy: BackendCapabilityPolicy,
  providerId: BackendRemoteProviderId,
  state: BackendProviderRuntimeState,
  request: BackendCapabilityRequest,
  placementRole: BackendPlacementRole,
  now: number
): BackendProviderRejectionReason | undefined {
  const provider = policy.providers[providerId];
  if (!provider.enabled) return "disabled";
  if (!provider.supportedCapabilities.has(request.capability)) {
    return "unsupported";
  }
  if (!provider.placementRoles.has(placementRole)) return "placement-role";
  if (request.estimatedDurationMs > provider.maxExecutionMs) return "duration";
  if (request.payloadBytes > provider.maxPayloadBytes) return "payload";
  if (state.circuitOpenUntil > now) return "circuit-open";
  if (state.requests + 1 > provider.dailyRequestBudget) {
    return "request-budget";
  }
  if (
    state.costUnits + request.estimatedCostUnits >
    provider.dailyCostBudget
  ) {
    return "cost-budget";
  }
  if (state.inFlight >= provider.maxConcurrency) return "concurrency";
  return undefined;
}

/**
 * Pure, deterministic route planning. Callers provide both wall-clock time and health state so
 * tests and clustered implementations do not depend on hidden globals.
 */
export function selectBackendCapabilityProvider(
  policy: BackendCapabilityPolicy,
  states: Readonly<
    Partial<Record<BackendRemoteProviderId, BackendProviderRuntimeState>>
  >,
  requestInput: BackendCapabilityRequest,
  now: number,
  excludedProviderIds: ReadonlySet<BackendRemoteProviderId> = new Set()
): BackendCapabilitySelection {
  const request = BackendCapabilityRequestSchema.parse(requestInput);
  const placementRole = backendCapabilityWorkloadPlacementRole(
    request.workload
  );
  const evaluations: BackendProviderEvaluation[] = [];

  if (policy.enabled) {
    for (const providerId of policy.workloadProviderOrder[request.workload]) {
      if (excludedProviderIds.has(providerId)) {
        evaluations.push({
          providerId,
          accepted: false,
          reason: "excluded",
        });
        continue;
      }
      const state = normalizedRuntimeState(states[providerId], now);
      const reason = evaluateRemoteProvider(
        policy,
        providerId,
        state,
        request,
        placementRole,
        now
      );
      evaluations.push({
        providerId,
        accepted: reason === undefined,
        ...(reason ? { reason } : {}),
      });
      if (!reason) {
        return {
          available: true,
          providerId,
          placementRole,
          selectionReason: "workload-affinity",
          evaluations,
        };
      }
    }
  }

  if (policy.localFallback === "development") {
    const durable =
      request.durability === "durable" ||
      placementRole === "object-store" ||
      placementRole === "durable-queue";
    evaluations.push({
      providerId: "local",
      accepted: !durable,
      ...(durable ? { reason: "durability" as const } : {}),
    });
    if (!durable) {
      return {
        available: true,
        providerId: "local",
        placementRole,
        selectionReason: "workload-affinity",
        evaluations,
      };
    }
  }

  return { available: false, evaluations };
}

export interface BackendCapabilityProviderStatus {
  readonly id: BackendCapabilityProviderId;
  readonly enabled: boolean;
  readonly capabilities: readonly BackendCapabilityId[];
  readonly placementRoles: readonly BackendPlacementRole[];
  readonly circuit: "closed" | "open";
  readonly inFlight: number;
  readonly remainingDailyRequests: number | null;
  readonly remainingDailyCostUnits: number | null;
}

export interface BackendCapabilityStatus {
  readonly distributionEnabled: boolean;
  readonly authoritativeCore: "nestjs-postgres";
  readonly configurationIssues: readonly string[];
  readonly providers: readonly BackendCapabilityProviderStatus[];
}

/**
 * Process-local guard for the first rollout. It deliberately does not execute HTTP requests:
 * provider adapters acquire a lease, perform their operation, then release it with an outcome.
 * A future shared ledger can feed the pure selector without changing feature code.
 */
@Injectable()
export class BackendCapabilityRouter {
  private readonly states = new Map<
    BackendRemoteProviderId,
    BackendProviderRuntimeState
  >();

  constructor(
    @Inject(BACKEND_CAPABILITY_POLICY)
    private readonly policy: BackendCapabilityPolicy
  ) {}

  acquire(
    requestInput: BackendCapabilityRequest,
    now = Date.now(),
    excludedProviderIds: ReadonlySet<BackendRemoteProviderId> = new Set()
  ): BackendCapabilityLease | null {
    const request = BackendCapabilityRequestSchema.parse(requestInput);
    const stateRecord = Object.fromEntries(this.states) as Partial<
      Record<BackendRemoteProviderId, BackendProviderRuntimeState>
    >;
    const selection = selectBackendCapabilityProvider(
      this.policy,
      stateRecord,
      request,
      now,
      excludedProviderIds
    );
    if (!selection.available) return null;
    if (selection.providerId === "local") {
      return this.createLocalLease(request, selection.placementRole);
    }

    const providerId = selection.providerId;
    const current = normalizedRuntimeState(this.states.get(providerId), now);
    this.states.set(providerId, {
      ...current,
      requests: current.requests + 1,
      costUnits: current.costUnits + request.estimatedCostUnits,
      inFlight: current.inFlight + 1,
    });
    return this.createRemoteLease(
      providerId,
      request,
      selection.placementRole
    );
  }

  status(now = Date.now()): BackendCapabilityStatus {
    const providers: BackendCapabilityProviderStatus[] = Object.values(
      this.policy.providers
    ).map((provider) => {
      const state = normalizedRuntimeState(this.states.get(provider.id), now);
      return {
        id: provider.id,
        enabled: provider.enabled,
        capabilities: [...provider.supportedCapabilities],
        placementRoles: [...provider.placementRoles],
        circuit: state.circuitOpenUntil > now ? "open" : "closed",
        inFlight: state.inFlight,
        remainingDailyRequests: provider.enabled
          ? Math.max(0, provider.dailyRequestBudget - state.requests)
          : null,
        remainingDailyCostUnits: provider.enabled
          ? Math.max(0, provider.dailyCostBudget - state.costUnits)
          : null,
      };
    });
    if (this.policy.localFallback === "development") {
      providers.push({
        id: "local",
        enabled: true,
        capabilities: ["async-job", "realtime"],
        placementRoles: ["edge-short", "container-worker", "realtime-relay"],
        circuit: "closed",
        inFlight: 0,
        remainingDailyRequests: null,
        remainingDailyCostUnits: null,
      });
    }
    return {
      distributionEnabled: this.policy.enabled,
      authoritativeCore: "nestjs-postgres",
      configurationIssues: this.policy.configurationIssues,
      providers,
    };
  }

  private createLocalLease(
    request: BackendCapabilityRequest,
    placementRole: BackendPlacementRole
  ): BackendCapabilityLease {
    let released = false;
    return Object.freeze({
      providerId: "local" as const,
      placementRole,
      selectionReason: "workload-affinity" as const,
      request,
      release: () => {
        if (released) return;
        released = true;
      },
    });
  }

  private createRemoteLease(
    providerId: BackendRemoteProviderId,
    request: BackendCapabilityRequest,
    placementRole: BackendPlacementRole
  ): BackendCapabilityLease {
    let released = false;
    return Object.freeze({
      providerId,
      placementRole,
      selectionReason: "workload-affinity" as const,
      request,
      release: (outcome: BackendCapabilityLeaseOutcome, now = Date.now()) => {
        if (released) return;
        released = true;
        const current = normalizedRuntimeState(
          this.states.get(providerId),
          now
        );
        const inFlight = Math.max(0, current.inFlight - 1);
        if (outcome === "coordination-deferred") {
          this.states.set(providerId, {
            ...current,
            requests: Math.max(0, current.requests - 1),
            costUnits: Math.max(
              0,
              current.costUnits - request.estimatedCostUnits
            ),
            inFlight,
          });
          return;
        }
        if (outcome !== "provider-failure") {
          this.states.set(providerId, {
            ...current,
            inFlight,
            consecutiveFailures:
              outcome === "success" ? 0 : current.consecutiveFailures,
          });
          return;
        }

        const consecutiveFailures = current.consecutiveFailures + 1;
        const openCircuit =
          consecutiveFailures >= this.policy.circuitFailureThreshold;
        this.states.set(providerId, {
          ...current,
          inFlight,
          consecutiveFailures,
          circuitOpenUntil: openCircuit
            ? now + this.policy.circuitCooldownMs
            : current.circuitOpenUntil,
        });
      },
    });
  }
}
