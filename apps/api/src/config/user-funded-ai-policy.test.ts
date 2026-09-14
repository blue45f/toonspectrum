import { afterEach, describe, expect, it } from "vitest";

import { Studio3dGenerationService } from "../modules/studio-ai/studio-3d-generation.service";
import { operatorAiFundingEnabled, rejectOperatorFundedAi } from "./user-funded-ai-policy";

const originalNodeEnv = process.env.NODE_ENV;
const originalHyper3dKey = process.env.HYPER3D_API_KEY;

describe("user-funded AI product policy", () => {
  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalHyper3dKey === undefined) delete process.env.HYPER3D_API_KEY;
    else process.env.HYPER3D_API_KEY = originalHyper3dKey;
  });

  it("fails closed outside the test harness", () => {
    process.env.NODE_ENV = "production";
    expect(operatorAiFundingEnabled()).toBe(false);
    expect(() => rejectOperatorFundedAi()).toThrow(/운영측 AI 생성은 비활성화/u);
  });

  it("does not advertise an operator 3D key in product environments", () => {
    process.env.NODE_ENV = "development";
    process.env.HYPER3D_API_KEY = "operator-key-must-not-run";
    expect(new Studio3dGenerationService().status().configured).toBe(false);
  });

  it("keeps the legacy provider seam only for regression tests", () => {
    process.env.NODE_ENV = "test";
    expect(operatorAiFundingEnabled()).toBe(true);
    expect(() => rejectOperatorFundedAi()).not.toThrow();
  });
});
