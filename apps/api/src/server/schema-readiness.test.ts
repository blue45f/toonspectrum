import { describe, expect, it, vi } from "vitest";

import { createSchemaReadinessCheck } from "./schema-readiness";

describe("schema readiness availability backoff", () => {
  it("coalesces a quota outage until the bounded retry window expires", async () => {
    let now = 0;
    const outage = Object.assign(new Error("quota exceeded"), { code: "53000" });
    const execute = vi.fn()
      .mockRejectedValueOnce(outage)
      .mockResolvedValue(undefined);
    const ensure = createSchemaReadinessCheck(["select 1"], {
      execute,
      failureBackoffMs: 100,
      now: () => now,
    });

    await expect(ensure()).rejects.toBe(outage);
    await expect(ensure()).rejects.toBe(outage);
    expect(execute).toHaveBeenCalledTimes(1);

    now = 101;
    await expect(ensure()).resolves.toBeUndefined();
    await expect(ensure()).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("retries schema drift immediately instead of caching it as an outage", async () => {
    const drift = Object.assign(new Error("missing relation"), { code: "42P01" });
    const execute = vi.fn()
      .mockRejectedValueOnce(drift)
      .mockResolvedValue(undefined);
    const ensure = createSchemaReadinessCheck(["select 1"], {
      execute,
      failureBackoffMs: 10_000,
    });

    await expect(ensure()).rejects.toBe(drift);
    await expect(ensure()).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
