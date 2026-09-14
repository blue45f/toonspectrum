import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { StudioAiController } from "./studio-ai.controller";

describe("StudioAiController user-funded policy", () => {
  it("reports no operator-funded provider or quota", () => {
    const controller = new StudioAiController();

    expect(controller.status()).toEqual({
      configured: false,
      provider: "none",
      model: "",
      providers: [],
      selection: { default: "auto", order: [], fallback: false },
      capabilities: [],
      requiresAuth: false,
      operatorFunded: false,
      settingsHref: "/studio/ai-settings",
    });
  });

  it("fails closed before any paid server request can start", () => {
    const controller = new StudioAiController();

    let caught: unknown;
    try {
      controller.chat();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect((caught as ServiceUnavailableException).getStatus()).toBe(503);
    expect((caught as ServiceUnavailableException).getResponse()).toMatchObject({
      code: "USER_AI_CONNECTION_REQUIRED",
      operatorFunded: false,
      settingsHref: "/studio/ai-settings",
    });
  });

  it("returns a stable user-facing migration message", () => {
    const controller = new StudioAiController();

    expect(() => controller.chat()).toThrow(
      "운영측 텍스트 AI는 비활성화되어 있습니다. 통합 AI 설정에서 본인 키를 연결하세요.",
    );
  });
});
