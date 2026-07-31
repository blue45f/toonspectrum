import type {
  AcquireCoordinationLease,
  AcquireCoordinationLeaseResult,
  CompleteIdempotencyReceipt,
  CompleteIdempotencyReceiptResult,
  ConsumeProviderBudget,
  ConsumeProviderBudgetResult,
  MutateCoordinationLease,
  MutateCoordinationLeaseResult,
  ProviderCircuitFailure,
  ProviderCircuitIdentity,
  ProviderCircuitState,
  ReserveIdempotencyReceipt,
  ReserveIdempotencyReceiptResult,
} from "./upstash-coordination.contract";

export const UPSTASH_COORDINATION_PORT = Symbol(
  "UPSTASH_COORDINATION_PORT"
);

export interface UpstashCoordinationCallOptions {
  readonly signal?: AbortSignal;
}

/**
 * Ephemeral cross-host coordination only. This interface intentionally has no arbitrary value,
 * document, CRDT update, user-content, or asset-byte operation.
 */
export interface UpstashCoordinationPort {
  /**
   * Performs a bounded authenticated round-trip to Redis without reading or mutating user data.
   * Readiness must use this instead of treating syntactically valid credentials as reachability.
   */
  ping(options?: UpstashCoordinationCallOptions): Promise<boolean>;
  acquireLease(
    input: AcquireCoordinationLease,
    options?: UpstashCoordinationCallOptions
  ): Promise<AcquireCoordinationLeaseResult>;
  renewLease(
    input: MutateCoordinationLease,
    options?: UpstashCoordinationCallOptions
  ): Promise<MutateCoordinationLeaseResult>;
  releaseLease(
    input: MutateCoordinationLease,
    options?: UpstashCoordinationCallOptions
  ): Promise<MutateCoordinationLeaseResult>;
  reserveIdempotencyReceipt(
    input: ReserveIdempotencyReceipt,
    options?: UpstashCoordinationCallOptions
  ): Promise<ReserveIdempotencyReceiptResult>;
  completeIdempotencyReceipt(
    input: CompleteIdempotencyReceipt,
    options?: UpstashCoordinationCallOptions
  ): Promise<CompleteIdempotencyReceiptResult>;
  recordProviderFailure(
    input: ProviderCircuitFailure,
    options?: UpstashCoordinationCallOptions
  ): Promise<ProviderCircuitState>;
  closeProviderCircuit(
    input: ProviderCircuitIdentity,
    options?: UpstashCoordinationCallOptions
  ): Promise<ProviderCircuitState>;
  readProviderCircuit(
    input: ProviderCircuitIdentity,
    options?: UpstashCoordinationCallOptions
  ): Promise<ProviderCircuitState>;
  consumeProviderBudget(
    input: ConsumeProviderBudget,
    options?: UpstashCoordinationCallOptions
  ): Promise<ConsumeProviderBudgetResult>;
}
