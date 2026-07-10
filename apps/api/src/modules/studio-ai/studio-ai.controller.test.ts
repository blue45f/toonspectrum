import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { StudioAiController } from "./studio-ai.controller";

import type { StudioAiChatDto } from "./studio-ai.dto";
import type { StudioAiService } from "./studio-ai.service";
import type { Request, Response } from "express";

const input = {
  task: "composition",
  promptVersion: 1,
  system: "구도를 제안하세요.",
  user: "교실 장면",
} as StudioAiChatDto;

class RequestEvents extends EventEmitter {
  aborted = false;
}

class ResponseEvents extends EventEmitter {
  destroyed = false;
  writableEnded = false;
}

function createHttpEvents() {
  const requestEvents = new RequestEvents();
  const responseEvents = new ResponseEvents();
  return {
    requestEvents,
    responseEvents,
    request: requestEvents as unknown as Request,
    response: responseEvents as unknown as Response,
  };
}

describe("StudioAiController", () => {
  it("이미 중단된 HTTP 요청 상태를 서비스 AbortSignal로 전달하고 리스너를 정리한다", async () => {
    const { requestEvents, responseEvents, request, response } = createHttpEvents();
    requestEvents.aborted = true;
    const complete = vi.fn((_userId, _body, signal?: AbortSignal) =>
      Promise.resolve({ clientAborted: signal?.aborted })
    );
    const controller = new StudioAiController({ complete } as unknown as StudioAiService);

    const result = await controller.chat("studio-user", input, request, response);

    expect(result).toEqual({ clientAborted: true });
    expect(complete).toHaveBeenCalledWith("studio-user", input, expect.any(AbortSignal));
    expect(requestEvents.listenerCount("aborted")).toBe(0);
    expect(responseEvents.listenerCount("close")).toBe(0);
  });

  it("응답 전 연결 종료를 서비스 신호로 전파하고 성공/실패 뒤 리스너를 정리한다", async () => {
    const { requestEvents, responseEvents, request, response } = createHttpEvents();
    let receivedSignal: AbortSignal | undefined;
    const complete = vi.fn((_userId, _body, signal?: AbortSignal) => {
      receivedSignal = signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("client disconnected")), { once: true });
      });
    });
    const controller = new StudioAiController({ complete } as unknown as StudioAiService);

    const result = controller.chat("studio-user", input, request, response);
    responseEvents.emit("close");

    await expect(result).rejects.toThrow("client disconnected");
    expect(receivedSignal?.aborted).toBe(true);
    expect(requestEvents.listenerCount("aborted")).toBe(0);
    expect(responseEvents.listenerCount("close")).toBe(0);
  });

  it("정상 완료 시 신호를 중단하지 않고 연결 리스너를 정리한다", async () => {
    const { requestEvents, responseEvents, request, response } = createHttpEvents();
    let receivedSignal: AbortSignal | undefined;
    const complete = vi.fn((_userId, _body, signal?: AbortSignal) => {
      receivedSignal = signal;
      return Promise.resolve({ content: "ok" });
    });
    const controller = new StudioAiController({ complete } as unknown as StudioAiService);

    await expect(controller.chat("studio-user", input, request, response)).resolves.toEqual({ content: "ok" });

    expect(receivedSignal?.aborted).toBe(false);
    expect(requestEvents.listenerCount("aborted")).toBe(0);
    expect(responseEvents.listenerCount("close")).toBe(0);
  });
});
