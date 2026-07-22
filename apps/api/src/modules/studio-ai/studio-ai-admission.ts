export const STUDIO_AI_ADMISSION_GATE = Symbol("STUDIO_AI_ADMISSION_GATE");

export const STUDIO_AI_RATE_LIMIT_REQUESTS = 20;
export const STUDIO_AI_RATE_LIMIT_WINDOW_MS = 60_000;
export const STUDIO_AI_LEASE_GRACE_MS = 15_000;

export interface StudioAiAdmissionLease {
  /** Bearer secret held only by the API process. PostgreSQL stores its SHA-256 digest. */
  readonly token: string;
  /** Monotonic per-user fence returned as a decimal string to avoid bigint precision loss. */
  readonly fence: string;
  readonly expiresAt: Date;
}

export const STUDIO_AI_RECEIPT_STATUSES = [
  "admitted",
  "sent",
  "succeeded",
  "ambiguous",
] as const;

export type StudioAiReceiptStatus = (typeof STUDIO_AI_RECEIPT_STATUSES)[number];

export interface StudioAiRequestIdentity {
  /** SHA-256(user id + exact Idempotency-Key); the raw key never enters PostgreSQL. */
  readonly userKeyHash: Uint8Array;
  /** SHA-256 of the canonical validated request tuple; prompts are never persisted. */
  readonly requestHash: Uint8Array;
}

export interface StudioAiAdmissionReceipt extends StudioAiRequestIdentity {
  readonly fence: string;
}

export type StudioAiIdempotencyConflictReason =
  | "key_reused_with_different_request"
  | "request_admitted"
  | "request_sent"
  | "request_ambiguous"
  | "request_succeeded";

export type StudioAiAdmissionResult =
  | {
      readonly status: "acquired";
      readonly lease: StudioAiAdmissionLease;
      readonly receipt: StudioAiAdmissionReceipt;
    }
  | { readonly status: "rate_limited" }
  | { readonly status: "busy" }
  | {
      readonly status: "idempotency_conflict";
      readonly reason: StudioAiIdempotencyConflictReason;
    };

export interface StudioAiAdmissionAcquireInput {
  readonly userId: string;
  readonly identity: StudioAiRequestIdentity;
  readonly requestLimit: number;
  readonly windowMs: number;
  readonly leaseMs: number;
}

export interface StudioAiAdmissionReleaseInput {
  readonly userId: string;
  readonly token: string;
  readonly fence: string;
}

export interface StudioAiAdmissionRenewInput extends StudioAiAdmissionReleaseInput {
  readonly leaseMs: number;
}

export interface StudioAiReceiptMutationInput extends StudioAiAdmissionReceipt {
  readonly userId: string;
}

export interface StudioAiAdmissionGate {
  acquire(input: StudioAiAdmissionAcquireInput): Promise<StudioAiAdmissionResult>;
  /**
   * Extends only the exact token/fence identity. An expired lease may be renewed while its row still
   * carries that identity; a replacement lease with a newer fence returns null.
   */
  renew(input: StudioAiAdmissionRenewInput): Promise<StudioAiAdmissionLease | null>;
  /** False means this exact token/fence is stale and no current lease was changed. */
  release(input: StudioAiAdmissionReleaseInput): Promise<boolean>;
  /** Authorizes one provider attempt and durably extends the replay-blocking window first. */
  markSent(input: StudioAiReceiptMutationInput): Promise<boolean>;
  /** Terminal paid success. No prompt or response body is retained. */
  markSucceeded(input: StudioAiReceiptMutationInput): Promise<boolean>;
  /** Provider acceptance/billing is uncertain; retries must remain blocked. */
  markAmbiguous(input: StudioAiReceiptMutationInput): Promise<boolean>;
  /** Removes an exact receipt only when no provider request was sent. */
  abandonBeforeSend(input: StudioAiReceiptMutationInput): Promise<boolean>;
  /** Removes an exact sent receipt only after a machine-verifiable pre-inference rejection. */
  abandonSafeRejection(input: StudioAiReceiptMutationInput): Promise<boolean>;
}
