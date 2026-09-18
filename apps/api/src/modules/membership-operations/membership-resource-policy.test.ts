import { describe, expect, it } from "vitest";

import {
  deriveMembershipResourceState,
  evaluateMembershipUploadQuota,
  MEMBERSHIP_STORAGE_GRACE_DAYS,
} from "./membership-resource-policy";

describe("membership resource policy", () => {
  it("keeps normal accounts writable and warns at the configured ratio", () => {
    expect(deriveMembershipResourceState({
      usageBytes: 7_000,
      limitBytes: 10_000,
      warningRatio: 0.8,
      nowMs: 1_000,
    })).toEqual({
      status: "normal",
      overQuotaSinceMs: null,
      graceEndsAtMs: null,
      canUpload: true,
    });

    expect(deriveMembershipResourceState({
      usageBytes: 8_000,
      limitBytes: 10_000,
      warningRatio: 0.8,
      nowMs: 1_000,
    }).status).toBe("warning");
  });

  it("preserves data through a grace period and becomes read-only for new uploads", () => {
    const started = Date.UTC(2026, 8, 18);
    const grace = deriveMembershipResourceState({
      usageBytes: 11_000,
      limitBytes: 10_000,
      warningRatio: 0.8,
      nowMs: started,
    });
    expect(grace.status).toBe("grace");
    expect(grace.canUpload).toBe(false);
    expect(grace.overQuotaSinceMs).toBe(started);
    expect(grace.graceEndsAtMs).toBe(
      started + MEMBERSHIP_STORAGE_GRACE_DAYS * 86_400_000,
    );

    const expired = deriveMembershipResourceState({
      usageBytes: 11_000,
      limitBytes: 10_000,
      warningRatio: 0.8,
      nowMs: grace.graceEndsAtMs!,
      existingOverQuotaSinceMs: grace.overQuotaSinceMs,
      existingGraceEndsAtMs: grace.graceEndsAtMs,
    });
    expect(expired.status).toBe("read_only");
    expect(expired.canUpload).toBe(false);
  });

  it("clears downgrade state when usage returns under the current limit", () => {
    const recovered = deriveMembershipResourceState({
      usageBytes: 5_000,
      limitBytes: 10_000,
      warningRatio: 0.8,
      nowMs: 50_000,
      existingOverQuotaSinceMs: 1_000,
      existingGraceEndsAtMs: 2_000,
    });
    expect(recovered).toEqual({
      status: "normal",
      overQuotaSinceMs: null,
      graceEndsAtMs: null,
      canUpload: true,
    });
  });

  it("enforces file, total storage and KST daily upload budgets independently", () => {
    const policy = {
      storageBytes: 10_000,
      warningRatio: 0.8,
      fileMaxBytes: 2_000,
      dailyUploadMaxBytes: 4_000,
    };
    expect(evaluateMembershipUploadQuota({
      currentStorageBytes: 1_000,
      dailyUploadBytes: 500,
      incomingBytes: 1_000,
      largestFileBytes: 1_000,
      policy,
    })).toBeNull();

    expect(evaluateMembershipUploadQuota({
      currentStorageBytes: 1_000,
      dailyUploadBytes: 500,
      incomingBytes: 2_001,
      largestFileBytes: 2_001,
      policy,
    })).toBe("file");

    expect(evaluateMembershipUploadQuota({
      currentStorageBytes: 9_500,
      dailyUploadBytes: 500,
      incomingBytes: 1_000,
      largestFileBytes: 1_000,
      policy,
    })).toBe("storage");

    expect(evaluateMembershipUploadQuota({
      currentStorageBytes: 1_000,
      dailyUploadBytes: 3_500,
      incomingBytes: 1_000,
      largestFileBytes: 1_000,
      policy,
    })).toBe("daily-upload");
  });

  it("allows exact-limit writes but rejects malformed byte counts", () => {
    const policy = {
      storageBytes: 10_000,
      warningRatio: 0.8,
      fileMaxBytes: 2_000,
      dailyUploadMaxBytes: 4_000,
    };
    expect(evaluateMembershipUploadQuota({
      currentStorageBytes: 8_000,
      dailyUploadBytes: 2_000,
      incomingBytes: 2_000,
      largestFileBytes: 2_000,
      policy,
    })).toBeNull();
    expect(evaluateMembershipUploadQuota({
      currentStorageBytes: 0,
      dailyUploadBytes: 0,
      incomingBytes: 0,
      largestFileBytes: 0,
      policy,
    })).toBe("file");
  });
});
