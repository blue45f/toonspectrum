import { describe, expect, it } from "vitest";

import { IntegrationRuntimeExecuteSchema } from "./integration-runtime.dto";

const base = {
  projectId: "project-1",
  mutationId: "11111111-1111-4111-8111-111111111111",
  dryRun: true,
  confirm: false,
  request: {
    providerId: "wikidata",
    action: "trends.read",
    input: { query: "Work", language: "en", limit: 5 },
  },
};

describe("IntegrationRuntimeExecuteSchema", () => {
  it("accepts strict provider-specific dry-run input", () => {
    expect(IntegrationRuntimeExecuteSchema.parse(base)).toEqual(base);
  });

  it("requires explicit confirmation for live execution", () => {
    const result = IntegrationRuntimeExecuteSchema.safeParse({
      ...base,
      dryRun: false,
      confirm: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "confirm")).toBe(true);
    }
  });

  it("rejects provider/action mismatches and unknown input keys", () => {
    expect(IntegrationRuntimeExecuteSchema.safeParse({
      ...base,
      request: { ...base.request, action: "message.send" },
    }).success).toBe(false);
    expect(IntegrationRuntimeExecuteSchema.safeParse({
      ...base,
      request: { ...base.request, input: { ...base.request.input, secret: "not-allowed" } },
    }).success).toBe(false);
  });

  it("bounds identifiers, arrays and URLs through each provider contract", () => {
    expect(IntegrationRuntimeExecuteSchema.safeParse({
      ...base,
      request: {
        providerId: "slack",
        action: "message.send",
        input: { text: "Ready", severity: "info", url: "javascript:alert(1)" },
      },
    }).success).toBe(false);
    expect(IntegrationRuntimeExecuteSchema.safeParse({
      ...base,
      request: {
        providerId: "figma",
        action: "design.inspect",
        input: { fileKey: "abcdefgh", nodeIds: Array.from({ length: 21 }, (_, index) => String(index)), includeImages: false },
      },
    }).success).toBe(false);
  });
});
