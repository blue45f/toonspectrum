import { describe, expect, it, vi } from "vitest";

import { installStudioFilterConnectionFault } from "./studio-filter-connection-fault";

import type { Page, Route, WebSocketRoute } from "playwright";


function harness() {
  const route = vi.fn(async (_match: (url: URL) => boolean, _handle: (route: Route) => Promise<void>) => {});
  const routeWebSocket = vi.fn(async (_match: (url: URL) => boolean, _handle: (socket: WebSocketRoute) => Promise<void>) => {});
  return { page: { route, routeWebSocket } as unknown as Page, route, routeWebSocket };
}

const origin = "http://127.0.0.1:5181";

describe("필터 연결 단절 검증의 권한과 실제 전달", () => {
  it.each(["https://www.toonstudio.cloud", "http://example.test:5181", "http://localhost:5181",
    "http://127.0.0.1", `${origin}/path`, `${origin}/?query=1`, `${origin}/#hash`,
    "http://fixture-user@127.0.0.1:5181"])("소유한 loopback origin이 아닌 %s에는 장애를 주입하지 않는다", async (url) => {
    const f = harness();
    await expect(installStudioFilterConnectionFault(f.page, url)).rejects.toThrow("loopback");
    expect(f.route).not.toHaveBeenCalled();
    expect(f.routeWebSocket).not.toHaveBeenCalled();
  });

  it("비밀번호만 있는 userinfo 문법도 거부한다", async () => {
    const f = harness();
    const url = new URL(origin);
    // 실제 자격증명이 아닌 URL 문법 경계 전용 값이다.
    url.password = "fixture-only";
    await expect(installStudioFilterConnectionFault(f.page, url.href)).rejects.toThrow("loopback");
    expect(f.route).not.toHaveBeenCalled();
    expect(f.routeWebSocket).not.toHaveBeenCalled();
  });

  it("같은 origin의 Socket.IO 경로에만 적용하고 HTTP 데이터 API는 보존한다", async () => {
    const f = harness();
    await installStudioFilterConnectionFault(f.page, origin);
    const [matches] = f.route.mock.calls[0]!;
    expect(matches(new URL(`${origin}/socket.io/?EIO=4&transport=polling`))).toBe(true);
    expect(matches(new URL("ws://127.0.0.1:5181/socket.io/?transport=websocket"))).toBe(true);
    for (const url of [`${origin}/api/creator/works`, `${origin}/socket.io-other`,
      "http://127.0.0.1:4355/socket.io/", "https://127.0.0.1:5181/socket.io/", "wss://other.test/socket.io/"]) {
      expect(matches(new URL(url)), url).toBe(false);
    }
  });

  it("서버 연결 전에는 단절 검증을 성공으로 처리하지 않는다", async () => {
    const f = harness();
    const fault = await installStudioFilterConnectionFault(f.page, origin);
    await expect(fault.disconnect()).rejects.toThrow("실제 QA WebSocket");
    expect(fault.evidence().disconnected).toBe(false);
  });

  it("정상 통신은 실제 서버에 전달하고 명시적 단절 후 재연결만 차단한다", async () => {
    const f = harness();
    const fault = await installStudioFilterConnectionFault(f.page, origin);
    const [, handlePolling] = f.route.mock.calls[0]!;
    const [, handleSocket] = f.routeWebSocket.mock.calls[0]!;
    const next = vi.fn(async () => {});
    const abort = vi.fn(async () => {});
    const request = { continue: next, abort } as unknown as Route;
    const serverClose = vi.fn(async () => {});
    const server = { close: serverClose } as unknown as WebSocketRoute;
    const clientClose = vi.fn(async () => {});
    const connect = vi.fn(() => server);
    const onMessage = vi.fn();
    const send = vi.fn();
    const client = { connectToServer: connect, close: clientClose, onMessage, send } as unknown as WebSocketRoute;
    await handlePolling(request);
    await handleSocket(client);
    expect(next).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledOnce();
    expect(abort).not.toHaveBeenCalled();
    expect(fault.isExpectedConsoleFailure(`WebSocket failed ws://127.0.0.1:5181/socket.io/`)).toBe(false);
    await fault.disconnect();
    expect(clientClose).toHaveBeenCalledOnce();
    expect(serverClose).toHaveBeenCalledOnce();
    await handlePolling(request);
    await handleSocket(client);
    expect(connect).toHaveBeenCalledOnce();
    expect(abort).toHaveBeenCalledWith("connectionreset");
    expect(onMessage).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(fault.evidence()).toEqual({ disconnected: true, connectedSockets: 1, blockedSockets: 1, blockedPollingRequests: 1 });
    fault.reconnect();
    expect(fault.evidence().disconnected).toBe(false);
    await handleSocket(client);
    await handlePolling(request);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(2);
    expect(onMessage).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    await fault.disconnect();
    // 이미 닫은 연결을 다시 닫지 않고 이번에 실제로 연결한 소켓만 닫는다.
    expect(serverClose).toHaveBeenCalledTimes(2);
    expect(fault.isExpectedConsoleFailure(`WebSocket failed ws://127.0.0.1:5181/socket.io/`)).toBe(true);
    expect(fault.isExpectedConsoleFailure(`TypeError: unexpected application crash ${origin}/socket.io/`)).toBe(false);
    expect(fault.isExpectedConsoleFailure("WebSocket failed wss://realtime.toonstudio.cloud/socket.io/")).toBe(false);
  });
});
