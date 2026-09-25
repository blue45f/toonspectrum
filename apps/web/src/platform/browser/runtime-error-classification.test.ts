import { describe, expect, it } from "vitest";

import { classifyRuntimeError } from "./runtime-error-classification";

describe("runtime error classification", () => {
  it("keeps chunk and network recovery synchronous", () => {
    expect(classifyRuntimeError(new Error("Failed to fetch dynamically imported module")).type).toBe("chunk_load");
    expect(classifyRuntimeError(new Error("NetworkError: Failed to fetch")).type).toBe("network");
  });

  it("recognizes explicit browser capability failures without loading diagnostics", () => {
    expect(classifyRuntimeError(new TypeError("WebGPU is not supported in this environment")).type).toBe("compatibility");
  });

  it("does not turn application method failures into a browser wall", () => {
    expect(classifyRuntimeError(new TypeError("target_0.park is not a function")).type).toBe("general");
  });
});
