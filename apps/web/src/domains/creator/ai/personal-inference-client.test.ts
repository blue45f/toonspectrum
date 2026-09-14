import { describe, expect, it } from "vitest";

import { isPersonalInferenceRequestPath } from "./personal-inference-client";

describe("personal inference request path", () => {
  it("accepts only bounded absolute API segments", () => {
    expect(isPersonalInferenceRequestPath("/capabilities")).toBe(true);
    expect(isPersonalInferenceRequestPath("/uploads/0123456789abcdef0123456789abcdef/chunks/12")).toBe(true);
    expect(isPersonalInferenceRequestPath("/jobs/a_b-c.1/cancel")).toBe(true);
  });

  it.each([
    "", "/", "capabilities", "/uploads//chunks/1", "/uploads/../secret",
    "/uploads/%2e%2e/secret", "/jobs/id?admin=1", "/jobs/id#fragment",
    `/jobs/${"-".repeat(129)}`, `/jobs/${"a".repeat(513)}`,
  ])("rejects unsafe or unbounded path %s", (path) => {
    expect(isPersonalInferenceRequestPath(path)).toBe(false);
  });
});
