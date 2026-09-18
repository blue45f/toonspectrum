import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const migration = readFileSync(
  resolve(root, "apps/api/src/db/migrations/0077_membership_operations.sql"),
  "utf8",
);

describe("membership operations database contract", () => {
  it("provisions account usage, downgrade state, notices and reward recovery", () => {
    for (const relation of [
      "membership_resource_usage_event",
      "membership_resource_state",
      "membership_notice",
      "membership_reward_reversal",
      "membership_policy_change",
    ]) {
      expect(migration).toContain(
        `CREATE TABLE IF NOT EXISTS public.${relation}`,
      );
      expect(migration).toContain(
        `REVOKE ALL ON TABLE public.${relation} FROM PUBLIC`,
      );
    }
  });

  it("captures policy changes as immutable before/after history", () => {
    expect(migration).toContain("capture_membership_policy_change");
    expect(migration).toContain("membership_policy_change_capture");
    expect(migration).toContain('"beforeValue"');
    expect(migration).toContain('"afterValue"');
    expect(migration).toContain('"changedBy"');
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog, public");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.capture_membership_policy_change() FROM PUBLIC",
    );
  });

  it("automatically recovers pending reward clawbacks from future point grants", () => {
    expect(migration).toContain("apply_pending_reward_recovery");
    expect(migration).toContain("wallet_pending_reward_recovery");
    expect(migration).toContain("account_asset <> 'reward_point'");
    expect(migration).toContain("'reversal'");
    expect(migration).toContain('"pendingAmount" = "pendingAmount" - take');
  });

  it("keeps usage receipts and reward correction receipts idempotent", () => {
    expect(migration).toContain(
      'UNIQUE ("userId", "sourceKey")',
    );
    expect(migration).toContain(
      'UNIQUE ("userId", activity, "sourceRef")',
    );
    expect(migration).toContain(
      'UNIQUE ("userId", "dedupeKey")',
    );
  });
});
