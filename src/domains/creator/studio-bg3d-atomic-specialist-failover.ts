/**
 * Renderer-neutral, fail-closed specialist failover.
 *
 * A capture attempt is authoritative only after one registered runtime returns a fully validated
 * result through the runtime registry. Failed attempts never contribute partial artifacts to the
 * next attempt, and candidates are always awaited sequentially so two isolated engines cannot own
 * the same capture transaction at once.
 */

import {
  snapshotStudioBg3dSpecialistRequest,
  type StudioBg3dRuntimeAdapterRegistry,
  type StudioBg3dRuntimeSnapshot,
  type StudioBg3dSpecialistRequest,
  type StudioBg3dSpecialistResult,
} from "./studio-bg3d-runtime-adapter";
import {
  STUDIO_BG3D_RUNTIME_CATALOG,
  type StudioBg3dRuntimeId,
} from "./studio-bg3d-runtime-topology";

export const STUDIO_BG3D_ATOMIC_FAILOVER_MAX_CANDIDATES = 4;

export type StudioBg3dAtomicAttemptErrorCode =
  | "adapter-not-registered"
  | "binding-load-failed"
  | "capability-unavailable"
  | "context-lost"
  | "device-lost"
  | "engine-init-failed"
  | "renderer-unavailable"
  | "unsupported-artifact"
  | "unsupported-scene-feature"
  | "unknown";

export interface StudioBg3dAtomicSpecialistCandidate {
  readonly runtimeId: StudioBg3dRuntimeId;
}

export interface StudioBg3dAtomicSpecialistAttempt {
  readonly runtimeId: StudioBg3dRuntimeId;
  readonly outcome: "aborted" | "failed" | "succeeded";
  readonly errorCode?: StudioBg3dAtomicAttemptErrorCode;
}

export interface StudioBg3dAtomicSpecialistSuccess {
  readonly runtimeId: StudioBg3dRuntimeId;
  readonly result: StudioBg3dSpecialistResult;
  readonly attempts: readonly StudioBg3dAtomicSpecialistAttempt[];
  /**
   * True only when the authoritative result came from a later candidate. Callers must surface this
   * fact rather than relabeling a WebGL capture as WebGPU.
   */
  readonly fallbackUsed: boolean;
}

export type StudioBg3dAtomicSpecialistErrorCode =
  | "aborted"
  | "all-candidates-failed"
  | "invalid-candidates"
  | "terminal-attempt-failed";

export class StudioBg3dAtomicSpecialistError extends Error {
  readonly code: StudioBg3dAtomicSpecialistErrorCode;
  readonly attempts: readonly StudioBg3dAtomicSpecialistAttempt[];

  constructor(
    code: StudioBg3dAtomicSpecialistErrorCode,
    attempts: readonly StudioBg3dAtomicSpecialistAttempt[] = [],
    cause?: unknown,
  ) {
    super(
      `Studio 3D atomic specialist transaction failed: ${code}`,
      cause === undefined ? undefined : { cause },
    );
    this.name = "StudioBg3dAtomicSpecialistError";
    this.code = code;
    this.attempts = freezeAttempts(attempts);
  }
}

export interface RunStudioBg3dAtomicSpecialistInput {
  readonly registry: StudioBg3dRuntimeAdapterRegistry;
  readonly jobId: string;
  readonly snapshot: StudioBg3dRuntimeSnapshot;
  readonly request: StudioBg3dSpecialistRequest;
  readonly candidates: readonly StudioBg3dAtomicSpecialistCandidate[];
  readonly signal?: AbortSignal;
}

const FALLBACK_ELIGIBLE_CODES = new Set<StudioBg3dAtomicAttemptErrorCode>([
  "adapter-not-registered",
  "binding-load-failed",
  "capability-unavailable",
  "context-lost",
  "device-lost",
  "engine-init-failed",
  "renderer-unavailable",
  "unsupported-artifact",
  "unsupported-scene-feature",
]);

function freezeAttempts(
  attempts: readonly StudioBg3dAtomicSpecialistAttempt[],
): readonly StudioBg3dAtomicSpecialistAttempt[] {
  return Object.freeze(attempts.map((attempt) => Object.freeze({ ...attempt })));
}

function errorCodeOf(error: unknown): string | null {
  try {
    if (!error || typeof error !== "object") return null;
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    if (!descriptor || !("value" in descriptor)) return null;
    return typeof descriptor.value === "string" ? descriptor.value : null;
  } catch {
    return null;
  }
}

function receiptCodeOf(error: unknown): StudioBg3dAtomicAttemptErrorCode {
  const code = errorCodeOf(error);
  return code && FALLBACK_ELIGIBLE_CODES.has(code as StudioBg3dAtomicAttemptErrorCode)
    ? code as StudioBg3dAtomicAttemptErrorCode
    : "unknown";
}

function validateCandidates(
  candidates: readonly StudioBg3dAtomicSpecialistCandidate[],
): readonly StudioBg3dAtomicSpecialistCandidate[] {
  if (
    !Array.isArray(candidates) ||
    candidates.length === 0 ||
    candidates.length > STUDIO_BG3D_ATOMIC_FAILOVER_MAX_CANDIDATES
  ) {
    throw new StudioBg3dAtomicSpecialistError("invalid-candidates");
  }
  const runtimeIds = new Set<StudioBg3dRuntimeId>();
  const normalized = candidates.map((candidate) => {
    let runtimeId: unknown;
    try {
      if (!candidate || typeof candidate !== "object") {
        throw new StudioBg3dAtomicSpecialistError("invalid-candidates");
      }
      const descriptor = Object.getOwnPropertyDescriptor(candidate, "runtimeId");
      runtimeId = descriptor && "value" in descriptor ? descriptor.value : null;
    } catch {
      throw new StudioBg3dAtomicSpecialistError("invalid-candidates");
    }
    if (
      typeof runtimeId !== "string" ||
      !Object.hasOwn(STUDIO_BG3D_RUNTIME_CATALOG, runtimeId) ||
      runtimeIds.has(runtimeId as StudioBg3dRuntimeId)
    ) {
      throw new StudioBg3dAtomicSpecialistError("invalid-candidates");
    }
    runtimeIds.add(runtimeId as StudioBg3dRuntimeId);
    return Object.freeze({ runtimeId: runtimeId as StudioBg3dRuntimeId });
  });
  return Object.freeze(normalized);
}

/**
 * Runs one immutable request against an ordered list of equivalent specialist runtimes.
 *
 * Fallback is deliberately narrow: only explicit availability, binding, capability, initialization,
 * context-loss, renderer, or equivalent-feature/artifact failures may advance to the next
 * candidate. Invalid requests/results, disposal, unknown failures, and caller aborts are terminal
 * because retrying them could hide a contract or lifecycle defect.
 */
export async function runStudioBg3dAtomicSpecialist(
  input: RunStudioBg3dAtomicSpecialistInput,
): Promise<StudioBg3dAtomicSpecialistSuccess> {
  const candidates = validateCandidates(input.candidates);
  const request = snapshotStudioBg3dSpecialistRequest(input.request, input.snapshot);
  if (!request) {
    throw new StudioBg3dAtomicSpecialistError("terminal-attempt-failed");
  }
  const attempts: StudioBg3dAtomicSpecialistAttempt[] = [];
  const signal = input.signal ?? new AbortController().signal;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    if (signal.aborted) {
      throw new StudioBg3dAtomicSpecialistError("aborted", attempts);
    }
    try {
      const result = await input.registry.run(
        candidate.runtimeId,
        input.jobId,
        input.snapshot,
        request,
        signal,
      );
      if (signal.aborted) {
        attempts.push(Object.freeze({
          runtimeId: candidate.runtimeId,
          outcome: "aborted",
        }));
        throw new StudioBg3dAtomicSpecialistError("aborted", attempts);
      }
      attempts.push(Object.freeze({
        runtimeId: candidate.runtimeId,
        outcome: "succeeded",
      }));
      return Object.freeze({
        runtimeId: candidate.runtimeId,
        result,
        attempts: freezeAttempts(attempts),
        fallbackUsed: index > 0,
      });
    } catch (error) {
      if (
        error instanceof StudioBg3dAtomicSpecialistError &&
        error.code === "aborted"
      ) {
        throw error;
      }
      const rawCode = errorCodeOf(error);
      if (signal.aborted || rawCode === "aborted") {
        attempts.push(Object.freeze({
          runtimeId: candidate.runtimeId,
          outcome: "aborted",
        }));
        throw new StudioBg3dAtomicSpecialistError("aborted", attempts, error);
      }
      const errorCode = receiptCodeOf(error);
      attempts.push(Object.freeze({
        runtimeId: candidate.runtimeId,
        outcome: "failed",
        errorCode,
      }));
      if (!FALLBACK_ELIGIBLE_CODES.has(errorCode)) {
        throw new StudioBg3dAtomicSpecialistError(
          "terminal-attempt-failed",
          attempts,
          error,
        );
      }
      if (index === candidates.length - 1) {
        throw new StudioBg3dAtomicSpecialistError(
          "all-candidates-failed",
          attempts,
          error,
        );
      }
    }
  }

  // validateCandidates guarantees at least one candidate; keep the impossible path fail-closed.
  throw new StudioBg3dAtomicSpecialistError("all-candidates-failed", attempts);
}
