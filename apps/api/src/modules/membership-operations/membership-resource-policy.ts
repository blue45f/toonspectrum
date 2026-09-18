export const MEMBERSHIP_STORAGE_GRACE_DAYS = 7;

export type MembershipResourceState =
  | "normal"
  | "warning"
  | "grace"
  | "read_only";

export type MembershipResourceQuotaKind =
  | "file"
  | "storage"
  | "daily-upload";

export interface MembershipResourcePolicyInput {
  storageBytes: number;
  warningRatio: number;
  fileMaxBytes: number;
  dailyUploadMaxBytes: number;
}

export function deriveMembershipResourceState(input: {
  usageBytes: number;
  limitBytes: number;
  warningRatio: number;
  nowMs: number;
  existingOverQuotaSinceMs?: number | null;
  existingGraceEndsAtMs?: number | null;
}): {
  status: MembershipResourceState;
  overQuotaSinceMs: number | null;
  graceEndsAtMs: number | null;
  canUpload: boolean;
} {
  if (input.usageBytes > input.limitBytes) {
    const overQuotaSinceMs =
      input.existingOverQuotaSinceMs ?? input.nowMs;
    const graceEndsAtMs =
      input.existingGraceEndsAtMs
      ?? overQuotaSinceMs
        + MEMBERSHIP_STORAGE_GRACE_DAYS * 24 * 60 * 60 * 1000;
    return {
      status: input.nowMs < graceEndsAtMs ? "grace" : "read_only",
      overQuotaSinceMs,
      graceEndsAtMs,
      canUpload: false,
    };
  }

  const warning =
    input.limitBytes > 0
    && input.usageBytes / input.limitBytes >= input.warningRatio;
  return {
    status: warning ? "warning" : "normal",
    overQuotaSinceMs: null,
    graceEndsAtMs: null,
    canUpload: input.usageBytes < input.limitBytes,
  };
}

export function evaluateMembershipUploadQuota(input: {
  currentStorageBytes: number;
  dailyUploadBytes: number;
  incomingBytes: number;
  largestFileBytes: number;
  policy: MembershipResourcePolicyInput;
}): MembershipResourceQuotaKind | null {
  if (
    !Number.isSafeInteger(input.incomingBytes)
    || input.incomingBytes <= 0
    || !Number.isSafeInteger(input.largestFileBytes)
    || input.largestFileBytes <= 0
  ) {
    return "file";
  }
  if (input.largestFileBytes > input.policy.fileMaxBytes) return "file";
  if (
    input.currentStorageBytes + input.incomingBytes
    > input.policy.storageBytes
  ) {
    return "storage";
  }
  if (
    input.dailyUploadBytes + input.incomingBytes
    > input.policy.dailyUploadMaxBytes
  ) {
    return "daily-upload";
  }
  return null;
}
