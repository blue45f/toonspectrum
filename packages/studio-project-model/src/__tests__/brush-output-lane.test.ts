import { describe, expect, it } from "vitest";

import { brushOutputPolicyIRSchema, brushProgramIRSchema } from "../ir/brush";

describe("brush output lane union (V19 §2.3)", () => {
  it("keeps vector-path as the default target", () => {
    expect(brushOutputPolicyIRSchema.parse({}).target).toBe("vector-path");
    expect(
      brushProgramIRSchema.parse({ id: "pen", name: "pen" }).output.target,
    ).toBe("vector-path");
  });

  it("round-trips the vector-mesh lane", () => {
    const program = brushProgramIRSchema.parse({
      id: "ink-mesh",
      name: "ink-mesh",
      geometry: { kind: "google-ink-mesh" },
      output: { target: "vector-mesh", bake: "editable-proxy" },
    });
    expect(program.output.target).toBe("vector-mesh");
    expect(brushProgramIRSchema.parse(program)).toEqual(program);
  });

  it("still rejects unknown targets", () => {
    expect(() =>
      brushOutputPolicyIRSchema.parse({ target: "vector-mush" }),
    ).toThrow();
  });
});
