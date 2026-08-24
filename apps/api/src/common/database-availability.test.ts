import { describe, expect, it, vi } from "vitest";

import {
  isDatabaseAvailabilityError,
  runSchemaPreflightToleratingDbUnavailability,
} from "./database-availability";

function pgError(code: string | undefined, message: string): Error {
  const error = new Error(message);
  if (code != null) Object.assign(error, { code });
  return error;
}

describe("isDatabaseAvailabilityError", () => {
  it.each([
    ["Neon compute quota (insufficient resources)", pgError("53000", "compute time quota exceeded")],
    ["connection exception SQLSTATE", pgError("08006", "connection_failure")],
    ["cannot connect now", pgError("57P03", "the database system is starting up")],
    ["node network errno", pgError("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:5432")],
    [
      "wrapped cause code",
      new Error("db error", { cause: pgError("ETIMEDOUT", "connect ETIMEDOUT") }),
    ],
    [
      "pg termination without a code",
      pgError(undefined, "Connection terminated unexpectedly"),
    ],
  ])("classifies %s as an availability error", (_case, error) => {
    expect(isDatabaseAvailabilityError(error)).toBe(true);
  });

  it.each([
    ["schema integrity violation", new Error("Studio AI admission schema is incomplete; apply migration 0018_studio_ai_request_gate.sql before starting the API")],
    ["unknown SQLSTATE", pgError("23505", "duplicate key value violates unique constraint")],
    ["non-error throw", "boom"],
    ["empty message error", new Error("")],
  ])("does not classify %s as an availability error", (_case, error) => {
    expect(isDatabaseAvailabilityError(error)).toBe(false);
  });
});

describe("runSchemaPreflightToleratingDbUnavailability", () => {
  it("continues when the database is unreachable at boot", async () => {
    await expect(
      runSchemaPreflightToleratingDbUnavailability("test preflight", async () => {
        throw pgError("53000", "compute time quota exceeded");
      })
    ).resolves.toBeUndefined();
  });

  it("rethrows schema integrity failures so the fail-closed contract survives", async () => {
    await expect(
      runSchemaPreflightToleratingDbUnavailability("test preflight", async () => {
        throw new Error("schema is incomplete");
      })
    ).rejects.toThrow(/schema is incomplete/u);
  });

  it("propagates success unchanged", async () => {
    const run = vi.fn(async () => {});
    await expect(
      runSchemaPreflightToleratingDbUnavailability("test preflight", run)
    ).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
