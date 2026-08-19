import { describe, expect, it } from "vitest";

import { checkBrowserCompatibility, classifyError, getBrowserInfo } from "../browser-check";

describe("browser-check compat module", () => {
  it("should get browser info without crashing", () => {
    const info = getBrowserInfo();
    expect(info).toHaveProperty("name");
    expect(info).toHaveProperty("version");
    expect(info).toHaveProperty("os");
  });

  it("should check browser compatibility", () => {
    const res = checkBrowserCompatibility();
    expect(res).toHaveProperty("isSupported");
    expect(res).toHaveProperty("missingFeatures");
    expect(Array.isArray(res.missingFeatures)).toBe(true);
  });

  it("should classify network error correctly", () => {
    const err = new Error("Failed to fetch");
    const analysis = classifyError(err);
    expect(analysis.type).toBe("network");
    expect(analysis.isCompatibilityIssue).toBe(false);
  });

  it("should classify chunk load error correctly", () => {
    const err = new Error("Failed to fetch dynamically imported module /src/pages/Home.tsx");
    const analysis = classifyError(err);
    expect(analysis.type).toBe("chunk_load");
    expect(analysis.isCompatibilityIssue).toBe(false);
  });

  it("should classify general error when environment is fully supported", () => {
    const err = new Error("Custom business logic crash");
    const analysis = classifyError(err);
    expect(analysis.type).toBe("general");
    expect(analysis.isCompatibilityIssue).toBe(false);
  });

  it("does not treat app method TypeErrors as a browser-update wall", () => {
    const err = new TypeError("target_0.park is not a function");
    const analysis = classifyError(err);
    expect(analysis.type).toBe("general");
    expect(analysis.isCompatibilityIssue).toBe(false);
  });
});
