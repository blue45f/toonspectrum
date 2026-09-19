import { SpecialistError } from "./specialist-contract";

export const SPECIALIST_WORKER_PHASES = [
  "validating",
  "decoding",
  "processing",
  "verifying",
] as const;
export type SpecialistWorkerPhase = (typeof SPECIALIST_WORKER_PHASES)[number];
export type SpecialistJobPhase =
  | "queued"
  | "starting"
  | SpecialistWorkerPhase
  | "ready"
  | "cancelled"
  | "timed-out"
  | "rejected"
  | "failed";
export interface SpecialistJobProgress {
  readonly phase: SpecialistJobPhase;
  /** 1-based among waiting jobs; absent after a job starts. No estimated percentage. */
  readonly queuePosition?: number;
}
export type SpecialistProgressListener = (
  progress: SpecialistJobProgress,
) => void;
export function notifySpecialistProgress(
  listener: SpecialistProgressListener | undefined,
  progress: SpecialistJobProgress,
): void {
  // Diagnostics/UI observers must not acquire authority over execution or cleanup.
  try {
    listener?.(Object.freeze(progress));
  } catch {
    /* Isolate presentation failures. */
  }
}
export function readSpecialistWorkerProgress(
  value: Record<string, unknown>,
  id: number,
  lastSequence: number,
): SpecialistWorkerPhase {
  const sequence = value.sequence;
  if (
    Object.keys(value).sort().join(",") !== "id,kind,phase,sequence,version" ||
    value.kind !== "progress" ||
    value.version !== 1 ||
    value.id !== id ||
    sequence !== lastSequence + 1 ||
    !Number.isSafeInteger(sequence) ||
    (sequence as number) < 1 ||
    (sequence as number) > SPECIALIST_WORKER_PHASES.length ||
    value.phase !== SPECIALIST_WORKER_PHASES[(sequence as number) - 1]
  ) {
    throw new SpecialistError(
      "runtime",
      "Invalid or out-of-order worker progress.",
    );
  }
  return value.phase as SpecialistWorkerPhase;
}
export function specialistFailurePhase(error: unknown): SpecialistJobPhase {
  if (error instanceof SpecialistError) {
    if (error.code === "cancelled") return "cancelled";
    if (error.code === "timeout") return "timed-out";
    if (["invalid-input", "unsupported", "budget"].includes(error.code))
      return "rejected";
  }
  return "failed";
}
