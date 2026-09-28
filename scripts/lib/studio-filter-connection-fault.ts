import type { Page, WebSocketRoute } from "playwright";

/** 소유한 임시 API의 실제 연결만 끊는다. 인증 응답이나 ACK 프레임을 합성하지 않는다. */
export async function installStudioFilterConnectionFault(page: Page, origin: string) {
  const target = new URL(origin);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || !target.port
    || target.pathname !== "/" || target.search || target.hash || target.username || target.password) {
    throw new Error("필터 연결 장애는 명시적인 loopback QA origin에서만 주입할 수 있습니다.");
  }
  const matches = (url: URL) => url.host === target.host
    && ["http:", "ws:"].includes(url.protocol)
    && (url.pathname === "/socket.io" || url.pathname.startsWith("/socket.io/"));
  let disconnected = false;
  let connectedSockets = 0;
  let blockedSockets = 0;
  let blockedPollingRequests = 0;
  const connections: { client: WebSocketRoute; server: WebSocketRoute }[] = [];
  await page.route(matches, async (route) => {
    if (disconnected) {
      blockedPollingRequests += 1;
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await page.routeWebSocket(matches, async (client) => {
    if (disconnected) {
      blockedSockets += 1;
      await client.close({ code: 1012, reason: "명시적 QA 연결 장애" });
      return;
    }
    // 정상 구간은 원래 API와 양방향 전달을 그대로 유지한다.
    connections.push({ client, server: client.connectToServer() });
    connectedSockets += 1;
  });
  return {
    async disconnect() {
      if (connections.length === 0) throw new Error("실제 QA WebSocket 연결이 확인되지 않았습니다.");
      disconnected = true;
      for (const { client, server } of connections.splice(0)) {
        await client.close({ code: 1012, reason: "명시적 QA 연결 장애" });
        await server.close({ code: 1012, reason: "명시적 QA 연결 장애" });
      }
    },
    reconnect() {
      if (!disconnected) throw new Error("주입한 연결 단절이 없습니다.");
      // 클라이언트의 정상 재연결 경로를 다시 열 뿐 인증 응답이나 ACK를 만들지 않는다.
      disconnected = false;
    },
    evidence: () => ({ disconnected, connectedSockets, blockedSockets, blockedPollingRequests }),
    isExpectedConsoleFailure(message: string) {
      return disconnected && message.includes(`${target.host}/socket.io`)
        && /WebSocket|ERR_CONNECTION_RESET|ERR_FAILED/u.test(message);
    },
  };
}
