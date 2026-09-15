import { EventEmitter } from "node:events";

import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { StudioAiController } from "./studio-ai.controller";

import type { StudioAiChatDto } from "./studio-ai.dto";
import type { StudioAiService } from "./studio-ai.service";
import type { Request, Response } from "express";

function requestHarness() {
  const request = new EventEmitter() as EventEmitter & {
    aborted: boolean;
  };
  request.aborted = false;
  const response = new EventEmitter() as EventEmitter & {
    writableEnded: boolean;
    destroyed: boolean;
  };
  response.writableEnded = false;
  response.destroyed = false;
  return {
    request: request as unknown as Request,
    response: response as unknown as Response,
    requestEmitter: request,
    responseEmitter: response,
  };
}

function serviceHarness() {
  const status = vi.fn(() => ({
    configured: true,
    provider: "gemini",
    model: "gemini-3.8-flash",
  }));
  const complete = vi.fn(async () => ({
    content: "완료",
    provider: "gemini",
    model: "gemini-3.8-flash",
  }));
  const service = { status, complete } as unknown as StudioAiService;
  return { service, status, complete };
}

const BODY: StudioAiChatDto = {
  task: "composition",
  promptVersion: 1,
  system: "구도를 제안하세요.",
  user: "옥상 장면",
};

describe("StudioAiController free pool", () => {
  it("returns the service free-pool status", () => {
    const { service, status } = serviceHarness();
    const controller = new StudioAiController(service);

    expect(controller.status()).toMatchObject({
      configured: true,
      provider: "gemini",
    });
    expect(status).toHaveBeenCalledTimes(1);
  });

  it("requires login before shared free-pool use", async () => {
    const { service } = serviceHarness();
    const controller = new StudioAiController(service);
    const harness = requestHarness();

    const error = await controller.chat(
      undefined,
      "operation-0000000000001",
      BODY,
      harness.request,
      harness.response,
    ).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toMatchObject({
      code: "FREE_AI_LOGIN_REQUIRED",
      settingsHref: "/settings/ai",
    });
  });

  it("delegates authenticated requests and removes disconnect listeners", async () => {
    const { service, complete } = serviceHarness();
    const controller = new StudioAiController(service);
    const harness = requestHarness();

    await expect(controller.chat(
      "user-1",
      "operation-0000000000001",
      BODY,
      harness.request,
      harness.response,
    )).resolves.toMatchObject({ content: "완료" });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]?.slice(0, 3)).toEqual([
      "user-1",
      BODY,
      "operation-0000000000001",
    ]);
    expect(complete.mock.calls[0]?.[3]).toBeInstanceOf(AbortSignal);
    expect(harness.requestEmitter.listenerCount("aborted")).toBe(0);
    expect(harness.responseEmitter.listenerCount("close")).toBe(0);
  });
});
