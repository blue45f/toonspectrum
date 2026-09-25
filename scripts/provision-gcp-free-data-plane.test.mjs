import { describe, expect, it } from "vitest";

import {
  applyGcpFreeDataPlane,
  parseGcpFreeDataPlaneArguments,
} from "./provision-gcp-free-data-plane.mjs";

describe("GCP free data-plane provisioning", () => {
  it.each([
    [["--plan"], "plan"],
    [["--check"], "check"],
    [["--apply"], "apply"],
  ])("parses exactly one explicit mode: %j", (arguments_, expected) => {
    expect(parseGcpFreeDataPlaneArguments(arguments_)).toBe(expected);
  });

  it.each([
    [[]],
    [["--plan", "--check"]],
    [["--apply", "--unknown"]],
  ])("rejects ambiguous or unknown arguments: %j", (arguments_) => {
    expect(() => parseGcpFreeDataPlaneArguments(arguments_)).toThrow(
      "Use exactly one of --plan, --check, or --apply",
    );
  });

  it("requires an explicit apply confirmation before any cloud command", () => {
    expect(() => applyGcpFreeDataPlane({})).toThrow(
      "APPLY-TOONSPECTRUM-GCP-FREE-DATA",
    );
  });
});
